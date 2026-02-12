import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import {
  extractKeysFromGuacMessage,
  keysymToChar,
  isModifierKey,
  isSpecialKey,
  type KeystrokeEvent,
} from '@smartaiaudit/shared';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the path for recordings
// In production (Fly.io): guacd and backend share the same filesystem, use GUAC_RECORDING_PATH directly
// In development: recordings are at <project>/docker/recordings (Docker volume mount on host)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const HOST_RECORDING_PATH = process.env.NODE_ENV === 'production'
  ? env.GUAC_RECORDING_PATH
  : path.join(PROJECT_ROOT, 'docker', 'recordings');

interface SessionRecordingData {
  sessionId: string;
  keystrokes: KeystrokeEvent[];
  startTime: number;
  lastActivity: number;
}

class RecordingService {
  private recordings = new Map<string, SessionRecordingData>();

  /**
   * Initialize recording for a session
   */
  initRecording(sessionId: string): void {
    this.recordings.set(sessionId, {
      sessionId,
      keystrokes: [],
      startTime: Date.now(),
      lastActivity: Date.now(),
    });
    console.log(`[Recording] Initialized for session: ${sessionId}`);
  }

  /**
   * Add keystroke from Guacamole message
   */
  addKeystrokesFromMessage(sessionId: string, message: string): number {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      console.warn(`[Recording] No recording found for session ${sessionId}`);
      return 0;
    }

    const keys = extractKeysFromGuacMessage(message);
    let addedCount = 0;

    keys.forEach(({ keysym, pressed }) => {
      if (pressed && !isModifierKey(keysym)) {
        const keystroke: KeystrokeEvent = {
          timestamp: Date.now() - recording.startTime,
          keysym,
          pressed,
          character: keysymToChar(keysym),
          type: isSpecialKey(keysym) ? 'special' : 'key',
        };

        recording.keystrokes.push(keystroke);
        recording.lastActivity = Date.now();
        addedCount++;
      }
    });

    return addedCount;
  }

  /**
   * Get session statistics
   */
  getStats(sessionId: string) {
    const recording = this.recordings.get(sessionId);
    if (!recording) return null;

    // Convert keystrokes to string for risk detection
    const keystrokes = recording.keystrokes
      .filter(k => k.character)
      .map(k => k.character)
      .join('');

    return {
      keystrokeCount: recording.keystrokes.length,
      durationSeconds: Math.round((Date.now() - recording.startTime) / 1000),
      hasActivity: recording.keystrokes.length > 0,
      keystrokes,
    };
  }

  /**
   * Get keystrokes for a session
   */
  getKeystrokes(sessionId: string): KeystrokeEvent[] {
    return this.recordings.get(sessionId)?.keystrokes || [];
  }

  /**
   * Upload .guac recording file to Supabase Storage
   */
  async uploadGuacRecording(sessionId: string): Promise<string | null> {
    try {
      // Brief delay: guacd may still be flushing the last frames when the
      // connection-close handler fires.  Give it time to finish writing.
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Use HOST_RECORDING_PATH - this is where the docker volume mounts recordings on the host
      // guacd may create file with or without .guac extension
      let filePath = path.join(HOST_RECORDING_PATH, `session-${sessionId}.guac`);

      // Check if file exists, if not try without extension
      try {
        await fs.access(filePath);
      } catch {
        filePath = path.join(HOST_RECORDING_PATH, `session-${sessionId}`);
      }

      console.log(`[Recording] Looking for file at: ${filePath}`);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        console.error(`[Recording] .guac file not found: ${filePath}`);
        return null;
      }

      // Read file
      const fileBuffer = await fs.readFile(filePath);
      console.log(`[Recording] Read .guac file: ${fileBuffer.length} bytes`);

      // Upload to Supabase Storage
      const storagePath = `guac/${sessionId}.guac`;
      const { data, error } = await supabase.storage
        .from('session-recordings')
        .upload(storagePath, fileBuffer, {
          contentType: 'application/x-guacamole-recording',
          upsert: false,
        });

      if (error) {
        console.error(`[Recording] Upload error:`, error);
        throw error;
      }

      console.log(`[Recording] Uploaded to: ${data.path}`);

      // For private buckets, store the storage path (not URL)
      // Signed URLs will be generated on demand when playback is requested
      // Update session record with the storage path
      await supabase
        .from('sessions')
        .update({
          guac_recording_url: storagePath, // Store path, not URL
          guac_file_size_bytes: fileBuffer.length,
        })
        .eq('id', sessionId);

      console.log(`[Recording] Saved storage path: ${storagePath}`);

      // Cleanup local file
      await fs.unlink(filePath);

      return storagePath;
    } catch (error) {
      console.error(`[Recording] Failed to upload .guac file:`, error);
      return null;
    }
  }

  /**
   * Save keystrokes to database
   */
  async saveKeystrokes(sessionId: string): Promise<void> {
    const recording = this.recordings.get(sessionId);
    if (!recording) return;

    const { error } = await supabase
      .from('sessions')
      .update({
        keystroke_data: recording.keystrokes,
        keystroke_count: recording.keystrokes.length,
      })
      .eq('id', sessionId);

    if (error) {
      console.error(`[Recording] Failed to save keystrokes:`, error);
    } else {
      console.log(
        `[Recording] Saved ${recording.keystrokes.length} keystrokes for session ${sessionId}`
      );
    }
  }

  /**
   * Update keystroke count in database (lightweight, for periodic updates during active session)
   */
  async updateKeystrokeCount(sessionId: string): Promise<void> {
    const recording = this.recordings.get(sessionId);
    if (!recording) return;

    const { error } = await supabase
      .from('sessions')
      .update({
        keystroke_count: recording.keystrokes.length,
      })
      .eq('id', sessionId);

    if (error) {
      console.error(`[Recording] Failed to update keystroke count:`, error);
    }
  }

  /**
   * End recording and clean up
   */
  async endRecording(sessionId: string): Promise<void> {
    console.log(`[Recording] Ending recording for session: ${sessionId}`);

    // Save keystrokes to database
    await this.saveKeystrokes(sessionId);

    // Upload .guac file
    await this.uploadGuacRecording(sessionId);

    // Clean up memory
    this.recordings.delete(sessionId);
  }

  /**
   * Cleanup old recordings (run periodically)
   */
  cleanupOldRecordings(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, recording] of this.recordings) {
      if (now - recording.lastActivity > maxAgeMs) {
        this.recordings.delete(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// Export singleton
export const recordingService = new RecordingService();
