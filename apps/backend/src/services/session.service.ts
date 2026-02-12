import { supabase } from '../config/supabase.js';
import { recordingService } from './recording.service.js';
import { streamingService } from './streaming.service.js';
import { llmService } from './llm.service.js';
import { riskDetectionService } from './risk-detection.service.js';
import { keystrokesToText } from '@smartaiaudit/shared';
import type { Session, KeystrokeEvent } from '@smartaiaudit/shared';

class SessionService {
  private sessionConnections = new Map<string, string>(); // sessionId -> connectionId
  private connectionSessions = new Map<string, string>(); // connectionId -> sessionId
  private endedSessions = new Set<string>(); // Track sessions that have already been ended

  /**
   * Check if auto-analyze is enabled in system settings
   */
  private async isAutoAnalyzeEnabled(): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'auto_analyze_sessions')
        .single();

      // Default to true if setting doesn't exist
      if (!data) return true;

      return data.value === 'true';
    } catch (error) {
      // Default to true if there's an error (setting might not exist yet)
      console.log('[Session] Could not fetch auto_analyze_sessions setting, defaulting to enabled');
      return true;
    }
  }

  /**
   * Create a new session in database
   */
  async createSession(data: {
    server_id: string;
    client_user_id: string;
    client_ip?: string;
    user_agent?: string;
  }): Promise<Session | null> {
    // Fetch server info to denormalize into the session record.
    // This preserves server name/host/protocol even if the server is later deleted.
    const { data: server } = await supabase
      .from('servers')
      .select('name, host, protocol')
      .eq('id', data.server_id)
      .single();

    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        server_id: data.server_id,
        user_id: data.client_user_id, // Use user_id column (references public.users)
        status: 'connecting',
        started_at: new Date().toISOString(),
        client_ip: data.client_ip,
        user_agent: data.user_agent,
        keystroke_count: 0,
        mouse_event_count: 0,
        server_name: server?.name || null,
        server_host: server?.host || null,
        server_protocol: server?.protocol || null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[Session] Failed to create session:', error);
      console.error('[Session] Error details:', JSON.stringify(error, null, 2));
      return null;
    }

    console.log(`[Session] Created: ${session.id}`);

    // Initialize recording
    recordingService.initRecording(session.id);

    // Notify auditors
    streamingService.notifySessionStart(session.id, session);

    return session;
  }

  /**
   * Register connection mapping
   */
  registerConnection(sessionId: string, connectionId: string): void {
    this.sessionConnections.set(sessionId, connectionId);
    this.connectionSessions.set(connectionId, sessionId);
    console.log(`[Session] Registered: ${sessionId} <-> ${connectionId}`);
  }

  /**
   * Unregister connection
   */
  unregisterConnection(sessionId: string): void {
    const connectionId = this.sessionConnections.get(sessionId);
    if (connectionId) {
      this.connectionSessions.delete(connectionId);
    }
    this.sessionConnections.delete(sessionId);
  }

  /**
   * Get session ID from connection ID
   */
  getSessionIdByConnection(connectionId: string): string | undefined {
    return this.connectionSessions.get(connectionId);
  }

  /**
   * Get connection ID from session ID
   */
  getConnectionIdBySession(sessionId: string): string | undefined {
    return this.sessionConnections.get(sessionId);
  }

  /**
   * Update session status
   */
  async updateSessionStatus(
    sessionId: string,
    status: 'connecting' | 'active' | 'disconnected' | 'error',
    errorMessage?: string
  ): Promise<void> {
    const updateData: any = { status };
    if (errorMessage) {
      updateData.error_message = errorMessage;
    }
    if (status === 'disconnected') {
      updateData.ended_at = new Date().toISOString();
    }

    const { error } = await supabase.from('sessions').update(updateData).eq('id', sessionId);

    if (error) {
      console.error('[Session] Failed to update status:', error);
    } else {
      console.log(`[Session] ${sessionId} status: ${status}`);

      // Broadcast update
      streamingService.broadcastSessionUpdate(sessionId, { status });
    }
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    // Prevent double-processing if session was already ended (e.g., by auditor terminate)
    if (this.endedSessions.has(sessionId)) {
      console.log(`[Session] Session ${sessionId} already ended, skipping duplicate endSession call`);
      return;
    }
    this.endedSessions.add(sessionId);

    console.log(`[Session] ========== ENDING SESSION: ${sessionId} ==========`);

    // Update status
    await this.updateSessionStatus(sessionId, 'disconnected');

    // Check recording stats FIRST
    const stats = recordingService.getStats(sessionId);
    console.log(`[Session] Recording stats BEFORE capture:`, stats);

    // IMPORTANT: Capture keystrokes BEFORE endRecording() deletes them from memory
    let keystrokes = recordingService.getKeystrokes(sessionId);
    console.log(`[Session] Captured ${keystrokes.length} keystrokes from memory`);

    // If no keystrokes in memory, try to fetch from database (might have been saved earlier)
    if (keystrokes.length === 0) {
      console.log(`[Session] No keystrokes in memory, checking database...`);
      const { data: existingSession } = await supabase
        .from('sessions')
        .select('keystroke_data, keystroke_count')
        .eq('id', sessionId)
        .single();

      if (existingSession?.keystroke_data && Array.isArray(existingSession.keystroke_data)) {
        keystrokes = existingSession.keystroke_data;
        console.log(`[Session] Found ${keystrokes.length} keystrokes in database (keystroke_count: ${existingSession.keystroke_count})`);
      } else {
        console.log(`[Session] No keystrokes in database either. keystroke_count: ${existingSession?.keystroke_count}`);
      }
    } else {
      console.log(`[Session] First 3 keystrokes:`, keystrokes.slice(0, 3));
    }

    // End recording (saves keystrokes and uploads .guac file, then clears memory)
    console.log(`[Session] Now calling endRecording...`);
    await recordingService.endRecording(sessionId);
    console.log(`[Session] endRecording completed`);

    // Get session data for analysis
    const { data: session } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (session) {
      // Check if auto-analyze is enabled
      const shouldAnalyze = await this.isAutoAnalyzeEnabled();
      if (shouldAnalyze) {
        // Analyze session with LLM (pass captured keystrokes)
        this.analyzeSessionAsync(session, keystrokes);
      } else {
        console.log(`[Session] Auto-analyze is disabled, skipping AI analysis for session ${sessionId}`);
      }
    }

    // Notify auditors
    streamingService.notifySessionEnd(sessionId);

    // Unregister connection
    this.unregisterConnection(sessionId);

    // Clean up ended session tracking after a delay (allow time for duplicate calls)
    setTimeout(() => {
      this.endedSessions.delete(sessionId);
    }, 60000); // Keep in set for 1 minute to prevent duplicates
  }

  /**
   * Analyze session asynchronously (don't block session end)
   * Uses tiered analysis: low-risk sessions skip LLM, medium use Haiku, high use Sonnet
   */
  private async analyzeSessionAsync(session: Session, keystrokes: KeystrokeEvent[]): Promise<void> {
    try {
      console.log(`[Session] ========== STARTING AI ANALYSIS ==========`);
      console.log(`[Session] Session ID: ${session.id}`);
      console.log(`[Session] Keystrokes received for analysis: ${keystrokes.length}`);
      console.log(`[Session] Session keystroke_count from DB: ${session.keystroke_count}`);

      // If we have no keystrokes but keystroke_count > 0, try to fetch from DB
      if (keystrokes.length === 0 && (session.keystroke_count || 0) > 0) {
        console.log(`[Session] WARNING: keystrokes array is empty but keystroke_count is ${session.keystroke_count}`);
        console.log(`[Session] Attempting to fetch keystroke_data from database...`);

        // Try to get keystrokes from database
        const { data: sessionWithKeystrokes } = await supabase
          .from('sessions')
          .select('keystroke_data')
          .eq('id', session.id)
          .single();

        if (sessionWithKeystrokes?.keystroke_data && Array.isArray(sessionWithKeystrokes.keystroke_data)) {
          keystrokes = sessionWithKeystrokes.keystroke_data;
          console.log(`[Session] Retrieved ${keystrokes.length} keystrokes from database`);
        }
      }

      // Pre-compute risk alerts from keystroke data for tiered analysis
      const keystrokeText = keystrokesToText(keystrokes);

      // Add keystrokes to risk detection buffer for pattern matching
      if (keystrokeText.length > 0) {
        riskDetectionService.addKeystrokes(session.id, keystrokeText);
      }

      // Detect risks using the enhanced pattern matcher
      const alerts = riskDetectionService.detectRisks(session.id);
      const riskScore = riskDetectionService.calculateRiskScore(alerts);

      console.log(`[Session] Pre-analysis risk detection: ${alerts.length} alerts, score: ${riskScore}`);

      if (alerts.length > 0) {
        const alertsByLevel = alerts.reduce((acc, a) => {
          acc[a.level] = (acc[a.level] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        console.log(`[Session] Alert breakdown:`, alertsByLevel);
      }

      // Get the regex-detected risk level before clearing
      const regexRiskLevel = riskDetectionService.getSessionRiskLevel(session.id);

      // Pass pre-computed alerts to LLM service for tiered analysis
      const analysis = await llmService.analyzeSession(session, keystrokes, alerts);

      // Clear the risk detection buffer
      riskDetectionService.clearBuffer(session.id);

      // Preserve the higher risk level between regex detection and AI analysis
      const riskOrder = ['low', 'medium', 'high', 'critical'];
      const finalRiskLevel = riskOrder.indexOf(regexRiskLevel) > riskOrder.indexOf(analysis.riskLevel)
        ? regexRiskLevel
        : analysis.riskLevel;

      console.log(`[Session] Risk levels - Regex: ${regexRiskLevel}, AI: ${analysis.riskLevel}, Final: ${finalRiskLevel}`);

      // Save analysis to database (preserve higher risk level)
      const { error } = await supabase
        .from('sessions')
        .update({
          ai_summary: analysis.summary,
          risk_level: finalRiskLevel,
          risk_factors: analysis.riskFactors,
          suspicious_activities: analysis.suspiciousActivities,
          analyzed_at: new Date().toISOString(),
          tags: analysis.tags || [],
          // Behavioral flags
          privilege_escalation: analysis.behavioralFlags?.privilegeEscalation || false,
          data_exfiltration: analysis.behavioralFlags?.dataExfiltration || false,
          persistence: analysis.behavioralFlags?.persistence || false,
          lateral_movement: analysis.behavioralFlags?.lateralMovement || false,
          credential_access: analysis.behavioralFlags?.credentialAccess || false,
          defense_evasion: analysis.behavioralFlags?.defenseEvasion || false,
          // Indicators and findings
          indicators: analysis.indicators || {},
          findings: analysis.findings || [],
        })
        .eq('id', session.id);

      if (error) {
        console.error('[Session] Failed to save analysis:', error);
      } else {
        console.log(`[Session] Analysis complete: ${session.id} - Risk: ${analysis.riskLevel}`);

        // Notify auditors of analysis completion
        streamingService.broadcastSessionUpdate(session.id, {
          ...analysis,
        });
      }
    } catch (error) {
      console.error('[Session] Analysis failed:', error);
    }
  }

  /**
   * Clean up stale sessions that are stuck in connecting/active
   * but have no live in-memory connection (e.g., client crashed).
   */
  async cleanupStaleSessions(maxAgeMs: number = 2 * 60 * 1000): Promise<number> {
    const { data: openSessions } = await supabase
      .from('sessions')
      .select('id, status, started_at')
      .in('status', ['connecting', 'active'])
      .not('user_id', 'is', null);

    if (!openSessions || openSessions.length === 0) return 0;

    const now = Date.now();
    const staleIds: string[] = [];

    for (const session of openSessions) {
      const hasConnection = this.sessionConnections.has(session.id);
      const ageMs = now - new Date(session.started_at).getTime();

      if (!hasConnection && ageMs > maxAgeMs) {
        staleIds.push(session.id);
      }
    }

    if (staleIds.length === 0) return 0;

    // Batch update directly — avoids per-row triggers that may fail on old data
    const { error, count } = await supabase
      .from('sessions')
      .update({ status: 'disconnected', ended_at: new Date().toISOString() })
      .in('id', staleIds);

    if (error) {
      console.warn(`[Session] Batch stale cleanup failed, falling back to individual updates:`, error.message);
      // Fall back to individual updates
      let cleaned = 0;
      for (const id of staleIds) {
        const { error: itemError } = await supabase
          .from('sessions')
          .update({ status: 'disconnected', ended_at: new Date().toISOString() })
          .eq('id', id);
        if (!itemError) {
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(`[Session] Cleaned up ${cleaned}/${staleIds.length} stale session(s)`);
      }
      return cleaned;
    }

    const cleaned = count ?? staleIds.length;
    console.log(`[Session] Cleaned up ${cleaned} stale session(s)`);
    return cleaned;
  }

  /**
   * Get active sessions
   */
  async getActiveSessions(): Promise<Session[]> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, server:servers(*), user:users!user_id(*)')
      .eq('status', 'active')
      .order('started_at', { ascending: false });

    if (error) {
      console.error('[Session] Failed to get active sessions:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, server:servers(*), user:users!user_id(*)')
      .eq('id', sessionId)
      .single();

    if (error) {
      console.error('[Session] Failed to get session:', error);
      return null;
    }

    return data;
  }

  /**
   * Mark session as reviewed
   */
  async markSessionReviewed(
    sessionId: string,
    userId: string,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from('sessions')
      .update({
        reviewed: true,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null,
      })
      .eq('id', sessionId);

    if (error) {
      console.error('[Session] Failed to mark session as reviewed:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Session] Marked session ${sessionId} as reviewed by ${userId}`);
    return { success: true };
  }

  /**
   * Mark session as unreviewed
   */
  async markSessionUnreviewed(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from('sessions')
      .update({
        reviewed: false,
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
      })
      .eq('id', sessionId);

    if (error) {
      console.error('[Session] Failed to mark session as unreviewed:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Session] Marked session ${sessionId} as unreviewed`);
    return { success: true };
  }

  /**
   * Add tag to session
   */
  async addTag(sessionId: string, tag: string): Promise<{ success: boolean; tags?: string[]; error?: string }> {
    // Validate tag length (max 24 characters)
    const normalizedTag = tag.toLowerCase().trim().replace(/\s+/g, '-');
    if (normalizedTag.length === 0) {
      return { success: false, error: 'Tag cannot be empty' };
    }
    if (normalizedTag.length > 24) {
      return { success: false, error: 'Tag must be 24 characters or less' };
    }

    // First get current tags
    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('tags')
      .eq('id', sessionId)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const currentTags: string[] = session?.tags || [];

    // Check if tag already exists
    if (currentTags.includes(normalizedTag)) {
      return { success: true, tags: currentTags };
    }

    // Limit to max 10 tags
    if (currentTags.length >= 10) {
      return { success: false, error: 'Maximum 10 tags allowed per session' };
    }

    const newTags = [...currentTags, normalizedTag];

    const { error } = await supabase
      .from('sessions')
      .update({ tags: newTags })
      .eq('id', sessionId);

    if (error) {
      console.error('[Session] Failed to add tag:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Session] Added tag "${normalizedTag}" to session ${sessionId}`);
    return { success: true, tags: newTags };
  }

  /**
   * Remove tag from session
   */
  async removeTag(sessionId: string, tag: string): Promise<{ success: boolean; tags?: string[]; error?: string }> {
    // First get current tags
    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('tags')
      .eq('id', sessionId)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    const currentTags: string[] = session?.tags || [];
    const normalizedTag = tag.toLowerCase().trim();
    const newTags = currentTags.filter((t) => t !== normalizedTag);

    const { error } = await supabase
      .from('sessions')
      .update({ tags: newTags })
      .eq('id', sessionId);

    if (error) {
      console.error('[Session] Failed to remove tag:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Session] Removed tag "${normalizedTag}" from session ${sessionId}`);
    return { success: true, tags: newTags };
  }

  /**
   * Search sessions with filters
   */
  async searchSessions(params: {
    search?: string;
    status?: string;
    riskLevel?: string;
    reviewed?: boolean;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ sessions: Session[]; total: number }> {
    let query = supabase
      .from('sessions')
      .select('*, servers(id, name, host, protocol)', { count: 'exact' })
      .order('started_at', { ascending: false });

    // Apply filters
    if (params.status) {
      query = query.eq('status', params.status);
    }

    if (params.riskLevel) {
      // Support comma-separated risk levels
      const levels = params.riskLevel.split(',').map((l) => l.trim());
      query = query.in('risk_level', levels);
    }

    if (params.reviewed !== undefined) {
      query = query.eq('reviewed', params.reviewed);
    }

    if (params.tags && params.tags.length > 0) {
      // Filter sessions that contain ANY of the specified tags
      query = query.contains('tags', params.tags);
    }

    if (params.search) {
      // Search in server name, server host, and user display name
      // Using ilike for case-insensitive search
      query = query.or(
        `servers.name.ilike.%${params.search}%,servers.host.ilike.%${params.search}%`
      );
    }

    // Pagination
    const limit = params.limit || 50;
    const offset = params.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('[Session] Search failed:', error);
      return { sessions: [], total: 0 };
    }

    return { sessions: data || [], total: count || 0 };
  }
}

// Export singleton
export const sessionService = new SessionService();
