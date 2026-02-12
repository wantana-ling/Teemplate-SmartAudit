import { supabase } from '../config/supabase.js';
import { ruleLoaderService } from './rule-loader.service.js';
import type { RiskPattern, AttackSequence } from './rule-loader.service.js';

export type { RiskPattern, AttackSequence };

export interface RiskAlert {
  sessionId: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  pattern: string;
  matchedText: string;
  timestamp: Date;
  mitreTactic?: string;
  mitreTechnique?: string;
}

class RiskDetectionService {
  private keystrokeBuffers: Map<string, string> = new Map();
  private commandHistory: Map<string, string[]> = new Map();
  private alertedPatterns: Map<string, Set<string>> = new Map(); // Track patterns already alerted per session
  private sessionRiskLevels: Map<string, RiskAlert['level']> = new Map(); // Track highest risk level per session
  private pendingCommand: Map<string, string> = new Map(); // Track incomplete commands

  // Increased buffer for complex multi-line commands
  private readonly BUFFER_SIZE = 4096;
  private readonly COMMAND_HISTORY_SIZE = 50;

  // Command delimiters for boundary detection
  private readonly COMMAND_DELIMITERS = /[\n\r]+/;
  private readonly SHELL_OPERATORS = /[;|&`]+/;

  // Patterns and sequences are loaded from JSON via rule-loader
  private get patterns(): Record<string, RiskPattern[]> {
    return ruleLoaderService.getRules().patterns;
  }

  private get attackSequences(): AttackSequence[] {
    return ruleLoaderService.getRules().sequences;
  }

  /**
   * Normalize input to defeat common evasion techniques
   * This makes pattern matching more robust against obfuscation
   */
  private normalizeInput(input: string): string {
    return input
      // Remove single quotes used for string splitting evasion: c'a't -> cat
      .replace(/'/g, '')
      // Remove double quotes used for obfuscation: "cat" -> cat
      .replace(/"/g, '')
      // Remove backticks used in shell: `cat` -> cat
      .replace(/`/g, '')
      // Normalize multiple spaces to single space
      .replace(/\s+/g, ' ')
      // Remove backslash line continuations: cmd\ \n  arg -> cmd arg
      .replace(/\\\s*\n\s*/g, ' ')
      // Remove backslash escapes within commands: \c\a\t -> cat
      .replace(/\\([^xX0-9])/g, '$1')
      // Normalize path separators (multiple slashes)
      .replace(/\/+/g, '/')
      // Remove common variable assignment obfuscation: ${var} -> $var
      .replace(/\$\{(\w+)\}/g, '$$$1')
      // Remove caret escapes in Windows: c^a^t -> cat
      .replace(/\^/g, '')
      // Remove common comment evasion in middle of command
      .replace(/#[^\n]*\n/g, '\n')
      .trim();
  }

  /**
   * Decode common encoding schemes to detect obfuscated payloads
   */
  private decodePayloads(input: string): string[] {
    const decoded: string[] = [];

    // Base64 detection and decode
    const b64Matches = input.match(/[A-Za-z0-9+\/]{30,}={0,2}/g);
    if (b64Matches) {
      for (const match of b64Matches) {
        try {
          const dec = Buffer.from(match, 'base64').toString('utf-8');
          // Only include if it looks like readable text/commands
          if (/^[\x20-\x7E\s]+$/.test(dec) && dec.length > 5) {
            decoded.push(dec);
          }
        } catch {}
      }
    }

    // Hex escape decode: \x63\x61\x74 -> cat
    const hexMatches = input.match(/(?:\\x[0-9a-fA-F]{2})+/g);
    if (hexMatches) {
      for (const match of hexMatches) {
        try {
          const dec = match
            .replace(/\\x/g, '')
            .match(/.{2}/g)!
            .map((h) => String.fromCharCode(parseInt(h, 16)))
            .join('');
          if (dec.length > 3) {
            decoded.push(dec);
          }
        } catch {}
      }
    }

    // Octal escape decode: \143\141\164 -> cat
    const octalMatches = input.match(/(?:\\[0-7]{3})+/g);
    if (octalMatches) {
      for (const match of octalMatches) {
        try {
          const dec = match
            .replace(/\\/g, ' ')
            .trim()
            .split(' ')
            .map((o) => String.fromCharCode(parseInt(o, 8)))
            .join('');
          if (dec.length > 3) {
            decoded.push(dec);
          }
        } catch {}
      }
    }

    return decoded;
  }

  /**
   * Add keystroke to session buffer
   */
  addKeystroke(sessionId: string, char: string): void {
    const current = this.keystrokeBuffers.get(sessionId) || '';
    const updated = (current + char).slice(-this.BUFFER_SIZE);
    this.keystrokeBuffers.set(sessionId, updated);
  }

  /**
   * Add multiple keystrokes from message with command boundary detection
   */
  addKeystrokes(sessionId: string, text: string): void {
    const current = this.keystrokeBuffers.get(sessionId) || '';
    const updated = (current + text).slice(-this.BUFFER_SIZE);
    this.keystrokeBuffers.set(sessionId, updated);

    // Track command history with proper boundary detection
    this.updateCommandHistory(sessionId, text);
  }

  /**
   * Update command history for sequence detection with boundary detection
   */
  private updateCommandHistory(sessionId: string, text: string): void {
    // Get pending incomplete command from previous batch
    const pending = this.pendingCommand.get(sessionId) || '';
    const combined = pending + text;

    // Split on command boundaries (newlines)
    const parts = combined.split(this.COMMAND_DELIMITERS);

    // Process complete commands (all but the last part)
    const completeCommands: string[] = [];
    for (let i = 0; i < parts.length - 1; i++) {
      const cmd = parts[i].trim();
      if (cmd.length > 0) {
        completeCommands.push(cmd);
      }
    }

    // The last part is potentially incomplete (no newline yet)
    const lastPart = parts[parts.length - 1];
    this.pendingCommand.set(sessionId, lastPart);

    // Add complete commands to history
    if (completeCommands.length > 0) {
      const history = this.commandHistory.get(sessionId) || [];
      history.push(...completeCommands);
      const trimmed = history.slice(-this.COMMAND_HISTORY_SIZE);
      this.commandHistory.set(sessionId, trimmed);
    }
  }

  /**
   * Get current buffer for session
   */
  getBuffer(sessionId: string): string {
    return this.keystrokeBuffers.get(sessionId) || '';
  }

  /**
   * Clear buffer for session
   */
  clearBuffer(sessionId: string): void {
    this.keystrokeBuffers.delete(sessionId);
    this.commandHistory.delete(sessionId);
    this.alertedPatterns.delete(sessionId);
    this.sessionRiskLevels.delete(sessionId);
    this.pendingCommand.delete(sessionId);
  }

  /**
   * Get the highest risk level detected for a session
   */
  getSessionRiskLevel(sessionId: string): RiskAlert['level'] {
    return this.sessionRiskLevels.get(sessionId) || 'low';
  }

  /**
   * Detect encoded/obfuscated payloads
   */
  private detectEncodedPayloads(buffer: string): RiskAlert[] {
    const alerts: RiskAlert[] = [];
    const sessionId = '';

    // Base64 detection (long strings that look like base64)
    const base64Pattern = /[A-Za-z0-9+\/]{60,}={0,2}/g;
    const base64Matches = buffer.match(base64Pattern);
    if (base64Matches) {
      for (const match of base64Matches) {
        // Verify it is valid base64
        try {
          const decoded = Buffer.from(match, 'base64').toString();
          // Check if decoded content looks suspicious
          if (/(?:sh|bash|python|perl|ruby|powershell|cmd)/i.test(decoded)) {
            alerts.push({
              sessionId,
              level: 'high',
              pattern: 'Encoded payload with executable content',
              matchedText: match.substring(0, 50) + '...',
              timestamp: new Date(),
              mitreTactic: 'Defense Evasion',
              mitreTechnique: 'T1027',
            });
          }
        } catch {
          // Not valid base64, skip
        }
      }
    }

    // Hex encoded strings (common in shellcode)
    const hexPattern = /(?:\\x[0-9a-fA-F]{2}){10,}/g;
    const hexMatches = buffer.match(hexPattern);
    if (hexMatches) {
      alerts.push({
        sessionId,
        level: 'high',
        pattern: 'Hex-encoded payload detected',
        matchedText: hexMatches[0].substring(0, 50) + '...',
        timestamp: new Date(),
        mitreTactic: 'Defense Evasion',
        mitreTechnique: 'T1027.002',
      });
    }

    // URL encoded suspicious content
    const urlEncodedPattern = /%[0-9a-fA-F]{2}(?:%[0-9a-fA-F]{2}){10,}/g;
    const urlMatches = buffer.match(urlEncodedPattern);
    if (urlMatches) {
      alerts.push({
        sessionId,
        level: 'medium',
        pattern: 'URL-encoded payload detected',
        matchedText: urlMatches[0].substring(0, 50) + '...',
        timestamp: new Date(),
        mitreTactic: 'Defense Evasion',
        mitreTechnique: 'T1027',
      });
    }

    return alerts;
  }

  /**
   * Detect attack sequences in command history
   */
  private detectAttackSequences(sessionId: string): RiskAlert[] {
    const history = this.commandHistory.get(sessionId) || [];
    if (history.length < 2) return [];

    const alerts: RiskAlert[] = [];
    const historyStr = history.join('\n');

    for (const sequence of this.attackSequences) {
      let matchCount = 0;
      const matchedCommands: string[] = [];

      for (const pattern of sequence.patterns) {
        const match = historyStr.match(pattern);
        if (match) {
          matchCount++;
          matchedCommands.push(match[0]);
        }
      }

      // If at least 2 of the sequence patterns match, flag it
      if (matchCount >= 2) {
        alerts.push({
          sessionId,
          level: sequence.risk,
          pattern: `Attack Chain: ${sequence.name}`,
          matchedText: matchedCommands.join(' -> '),
          timestamp: new Date(),
          mitreTactic: sequence.mitreTactic,
        });
      }
    }

    return alerts;
  }

  /**
   * Detect risks in current buffer using both raw and normalized input
   */
  detectRisks(sessionId: string): RiskAlert[] {
    const rawBuffer = this.getBuffer(sessionId);
    if (!rawBuffer) return [];

    const alerts: RiskAlert[] = [];
    const seenAlerts = new Set<string>(); // Deduplicate within this detection run

    // Normalize buffer to catch evasion attempts
    const normalizedBuffer = this.normalizeInput(rawBuffer);

    // Decode any encoded payloads
    const decodedPayloads = this.decodePayloads(rawBuffer);

    // All buffers to check (raw, normalized, and decoded payloads)
    const buffersToCheck = [
      { buffer: rawBuffer, source: 'raw' },
      { buffer: normalizedBuffer, source: 'normalized' },
      ...decodedPayloads.map((p) => ({ buffer: p, source: 'decoded' })),
    ];

    // Pattern-based detection against all buffers
    for (const { buffer, source } of buffersToCheck) {
      for (const [level, patterns] of Object.entries(this.patterns)) {
        for (const { pattern, description, mitreTactic, mitreTechnique } of patterns) {
          const match = buffer.match(pattern);
          if (match) {
            // Create unique key to avoid duplicates
            const alertKey = `${description}:${match[0].substring(0, 50)}`;
            if (!seenAlerts.has(alertKey)) {
              seenAlerts.add(alertKey);
              alerts.push({
                sessionId,
                level: level as RiskAlert['level'],
                pattern: source === 'decoded' ? `[Decoded] ${description}` : description,
                matchedText: match[0],
                timestamp: new Date(),
                mitreTactic,
                mitreTechnique,
              });
            }
          }
        }
      }
    }

    // Encoded payload detection (additional heuristics)
    const encodedAlerts = this.detectEncodedPayloads(rawBuffer);
    for (const alert of encodedAlerts) {
      const alertKey = `${alert.pattern}:${alert.matchedText}`;
      if (!seenAlerts.has(alertKey)) {
        seenAlerts.add(alertKey);
        alert.sessionId = sessionId;
        alerts.push(alert);
      }
    }

    // Attack sequence detection
    const sequenceAlerts = this.detectAttackSequences(sessionId);
    for (const alert of sequenceAlerts) {
      const alertKey = `${alert.pattern}:${alert.matchedText}`;
      if (!seenAlerts.has(alertKey)) {
        seenAlerts.add(alertKey);
        alerts.push(alert);
      }
    }

    return alerts;
  }

  /**
   * Calculate risk score from alerts (used for tiered LLM analysis)
   */
  calculateRiskScore(alerts: RiskAlert[]): number {
    const weights = ruleLoaderService.getRules().scoring.alertWeights;
    return alerts.reduce((score, alert) => score + (weights[alert.level] ?? 0), 0);
  }

  /**
   * Calculate overall risk level from alerts
   */
  calculateRiskLevel(alerts: RiskAlert[]): 'low' | 'medium' | 'high' | 'critical' {
    const order = ruleLoaderService.getRules().scoring.riskLevelOrder;
    // Walk from highest to lowest; return first level found in alerts
    for (let i = order.length - 1; i >= 0; i--) {
      if (alerts.some((a) => a.level === order[i])) {
        return order[i] as RiskAlert['level'];
      }
    }
    return 'low';
  }

  /**
   * Reload detection rules from disk (delegates to rule-loader)
   */
  reloadRules() {
    return ruleLoaderService.reloadRules();
  }

  /**
   * Check for immediate risks (called on each keystroke batch)
   * Only returns NEW alerts that haven't been alerted before for this session
   */
  async checkAndAlertRisks(sessionId: string): Promise<RiskAlert[]> {
    const allAlerts = this.detectRisks(sessionId);

    if (allAlerts.length === 0) return [];

    // Get or create the set of already alerted patterns for this session
    if (!this.alertedPatterns.has(sessionId)) {
      this.alertedPatterns.set(sessionId, new Set());
    }
    const alertedSet = this.alertedPatterns.get(sessionId)!;

    // Filter to only NEW alerts (patterns not yet alerted)
    const newAlerts = allAlerts.filter((alert) => {
      const alertKey = `${alert.pattern}:${alert.matchedText}`;
      if (alertedSet.has(alertKey)) {
        return false; // Already alerted
      }
      alertedSet.add(alertKey);
      return true;
    });

    // Update session's highest risk level (never downgrade)
    const currentHighest = this.sessionRiskLevels.get(sessionId) || 'low';
    const newHighest = this.calculateRiskLevel(allAlerts);
    const riskOrder = ruleLoaderService.getRules().scoring.riskLevelOrder;
    if (riskOrder.indexOf(newHighest) > riskOrder.indexOf(currentHighest)) {
      this.sessionRiskLevels.set(sessionId, newHighest);
      // Update session risk level in database
      await supabase.from('sessions').update({ risk_level: newHighest }).eq('id', sessionId);
    }

    // Only save NEW significant alerts to database
    if (newAlerts.length > 0) {
      const significantNewAlerts = newAlerts.filter((a) => ['critical', 'high'].includes(a.level));
      if (significantNewAlerts.length > 0) {
        await supabase.from('risk_alerts').insert(
          significantNewAlerts.map((alert) => ({
            session_id: sessionId,
            level: alert.level,
            pattern: alert.pattern,
            matched_text: alert.matchedText,
            mitre_tactic: alert.mitreTactic,
            mitre_technique: alert.mitreTechnique,
          }))
        );
      }
    }

    return newAlerts; // Return only new alerts
  }

  /**
   * Get risk alerts for a session
   */
  async getSessionAlerts(sessionId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('risk_alerts')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to get risk alerts:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    await supabase
      .from('risk_alerts')
      .update({
        acknowledged: true,
        acknowledged_by: userId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', alertId);
  }

  /**
   * Get all unacknowledged alerts
   */
  async getUnacknowledgedAlerts(): Promise<any[]> {
    const { data, error } = await supabase
      .from('risk_alerts')
      .select('*, sessions(server_id, servers(name))')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Failed to get unacknowledged alerts:', error);
      return [];
    }

    return data || [];
  }
}

export const riskDetectionService = new RiskDetectionService();
