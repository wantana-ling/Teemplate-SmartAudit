import type { KeystrokeEvent, RiskLevel } from '../types/index.js';
import { KEYSYM_MAP, MODIFIER_KEYS, RISK_COLORS } from '../constants/index.js';

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/**
 * Format timestamp to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Get risk level color for UI
 */
export function getRiskColor(level: RiskLevel): string {
  return RISK_COLORS[level];
}

/**
 * Convert keystrokes to readable text
 */
export function keystrokesToText(keystrokes: KeystrokeEvent[]): string {
  return keystrokes
    .filter((k) => k.pressed)
    .map((k) => k.character)
    .join('');
}

/**
 * Map X11 keysym to character
 */
export function keysymToChar(keysym: number): string {
  return KEYSYM_MAP[keysym] || `[0x${keysym.toString(16)}]`;
}

/**
 * Check if keysym is a modifier key
 */
export function isModifierKey(keysym: number): boolean {
  return MODIFIER_KEYS.has(keysym);
}

/**
 * Check if keysym is a special key
 */
export function isSpecialKey(keysym: number): boolean {
  const char = KEYSYM_MAP[keysym];
  return char ? char.startsWith('[') && char.endsWith(']') : false;
}

/**
 * Extract keystrokes from Guacamole protocol message
 */
export function extractKeysFromGuacMessage(data: string): Array<{
  keysym: number;
  pressed: boolean;
}> {
  const keys: Array<{ keysym: number; pressed: boolean }> = [];

  // Format: "3.key,<len>.<keysym>,<len>.<pressed>;"
  const keyPattern = /3\.key,\d+\.(\d+),\d+\.([01]);/g;
  let match;

  while ((match = keyPattern.exec(data)) !== null) {
    const keysym = parseInt(match[1], 10);
    const pressed = match[2] === '1';
    keys.push({ keysym, pressed });
  }

  return keys;
}

/**
 * Validate server configuration
 */
export function validateServerConfig(config: {
  hostname: string;
  port: number;
  protocol: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.hostname || config.hostname.trim() === '') {
    errors.push('Hostname is required');
  }

  if (!config.port || config.port < 1 || config.port > 65535) {
    errors.push('Port must be between 1 and 65535');
  }

  if (!['vnc', 'rdp', 'ssh'].includes(config.protocol)) {
    errors.push('Invalid protocol');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Generate unique session ID
 */
export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Analyze keystrokes for risk patterns
 */
export function analyzeKeystrokeRisk(text: string): {
  hasCommands: boolean;
  hasSensitivePatterns: boolean;
  patterns: string[];
} {
  const patterns: string[] = [];
  const lowerText = text.toLowerCase();

  // Command patterns
  const commandPatterns = [
    { pattern: /sudo\s+/i, name: 'sudo command' },
    { pattern: /rm\s+-rf/i, name: 'recursive delete' },
    { pattern: /chmod\s+777/i, name: 'permissive permissions' },
    { pattern: /passwd/i, name: 'password change' },
    { pattern: /mysql\s+-/i, name: 'mysql access' },
    { pattern: /psql\s+-/i, name: 'postgresql access' },
    { pattern: /ssh\s+/i, name: 'ssh connection' },
    { pattern: /curl\s+/i, name: 'curl command' },
    { pattern: /wget\s+/i, name: 'wget command' },
  ];

  const hasCommands = commandPatterns.some((p) => {
    if (p.pattern.test(lowerText)) {
      patterns.push(p.name);
      return true;
    }
    return false;
  });

  // Sensitive data patterns
  const sensitivePatterns = [
    { pattern: /password[:\s=]/i, name: 'password keyword' },
    { pattern: /api[_-]?key/i, name: 'api key' },
    { pattern: /secret/i, name: 'secret keyword' },
    { pattern: /token/i, name: 'token keyword' },
    { pattern: /credit[_-]?card/i, name: 'credit card' },
    { pattern: /ssn/i, name: 'SSN' },
  ];

  const hasSensitivePatterns = sensitivePatterns.some((p) => {
    if (p.pattern.test(lowerText)) {
      patterns.push(p.name);
      return true;
    }
    return false;
  });

  return {
    hasCommands,
    hasSensitivePatterns,
    patterns,
  };
}
