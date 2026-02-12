import crypto from 'crypto';
import { env } from './env.js';

export interface Server {
  id: string;
  hostname: string;
  port: number;
  protocol: 'vnc' | 'rdp' | 'ssh';
}

export interface GuacamoleConnectionSettings {
  protocol: 'vnc' | 'rdp' | 'ssh';
  hostname: string;
  port: number;
  password?: string;
  username?: string;

  // Recording settings
  'recording-path': string;
  'recording-name': string;
  'create-recording-path': 'true' | 'false';

  // Optional protocol-specific settings
  [key: string]: string | number | undefined;
}

/**
 * Get the encryption key as a 32-byte Buffer for AES-256-CBC
 * This MUST match the key used in guacamole-token.service.ts
 */
export function getEncryptionKey(): Buffer {
  const keyString = env.ENCRYPTION_KEY;

  // If key is exactly 32 bytes, use it directly
  if (keyString.length === 32) {
    return Buffer.from(keyString, 'utf8');
  }

  // Otherwise, hash it to get exactly 32 bytes
  return crypto.createHash('sha256').update(keyString).digest();
}

export function getGuacamoleLiteConfig() {
  return {
    guacd: {
      host: env.GUACD_HOST,
      port: env.GUACD_PORT,
    },
    client: {
      crypt: {
        cypher: 'AES-256-CBC',
        key: getEncryptionKey(),
      },
    },
  };
}

export function createConnectionSettings(
  sessionId: string,
  server: Server,
  credentials?: { username?: string; password?: string }
): GuacamoleConnectionSettings {
  const settings: GuacamoleConnectionSettings = {
    protocol: server.protocol,
    hostname: server.hostname,
    port: server.port,

    // Enable recording
    'recording-path': env.GUAC_RECORDING_PATH,
    'recording-name': `session-${sessionId}`,
    'create-recording-path': 'true',
  };

  // Add credentials if provided
  if (credentials?.username) {
    settings.username = credentials.username;
  }
  if (credentials?.password) {
    settings.password = credentials.password;
  }

  // Protocol-specific defaults
  if (server.protocol === 'vnc') {
    settings['color-depth'] = 24;
  } else if (server.protocol === 'rdp') {
    settings['ignore-cert'] = 'true';
    settings['security'] = 'any';
  }

  return settings;
}
