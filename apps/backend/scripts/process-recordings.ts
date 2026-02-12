/**
 * Script to process and upload recordings for sessions that don't have them
 * Run with: npx tsx scripts/process-recordings.ts
 */

import { supabase } from '../src/config/supabase.js';
import { recordingService } from '../src/services/recording.service.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const RECORDINGS_DIR = path.join(PROJECT_ROOT, 'docker', 'recordings');

async function main() {
  console.log('Processing recordings...');
  console.log(`Looking in: ${RECORDINGS_DIR}\n`);

  // List all recording files
  let files: string[];
  try {
    files = await fs.readdir(RECORDINGS_DIR);
  } catch (err) {
    console.error('Cannot read recordings directory:', err);
    process.exit(1);
  }

  // Filter for session files
  const sessionFiles = files.filter(f => f.startsWith('session-'));
  console.log(`Found ${sessionFiles.length} recording files\n`);

  let successful = 0;
  let failed = 0;
  let alreadyUploaded = 0;

  for (const file of sessionFiles) {
    // Extract session ID from filename (session-{uuid} or session-{uuid}.guac)
    const sessionId = file.replace('session-', '').replace('.guac', '');

    // Check if already uploaded
    const { data: session } = await supabase
      .from('sessions')
      .select('id, guac_recording_url')
      .eq('id', sessionId)
      .single();

    if (!session) {
      console.log(`Session not found in database: ${sessionId}`);
      failed++;
      continue;
    }

    if (session.guac_recording_url) {
      console.log(`Already uploaded: ${sessionId}`);
      alreadyUploaded++;
      continue;
    }

    console.log(`Processing: ${sessionId}`);
    try {
      const storagePath = await recordingService.uploadGuacRecording(sessionId);
      if (storagePath) {
        console.log(`  ✓ Uploaded to: ${storagePath}`);
        successful++;
      } else {
        console.log(`  ✗ Upload failed`);
        failed++;
      }
    } catch (err: any) {
      console.log(`  ✗ Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone!`);
  console.log(`  Already uploaded: ${alreadyUploaded}`);
  console.log(`  Newly uploaded: ${successful}`);
  console.log(`  Failed: ${failed}`);

  process.exit(0);
}

main().catch(console.error);
