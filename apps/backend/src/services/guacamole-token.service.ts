import crypto from 'crypto';
import { env } from '../config/env.js';
import { getEncryptionKey } from '../config/guacamole.js';

const CIPHER_ALGORITHM = 'AES-256-CBC';

export interface ConnectionSettings {
  connection: {
    type: 'vnc' | 'rdp' | 'ssh';
    settings: {
      hostname: string;
      port: number;
      username?: string;
      password?: string;
      // Recording
      'recording-path'?: string;
      'recording-name'?: string;
      'create-recording-path'?: string;
      // Protocol-specific
      [key: string]: string | number | boolean | undefined;
    };
  };
  // Custom field for session tracking
  sessionId?: string;
}

/**
 * Encrypts connection settings into a token for guacamole-lite
 *
 * Guacamole-lite expects the token format to be:
 * base64(JSON.stringify({iv: base64(iv), value: base64(encrypted)}))
 */
export function encryptToken(settings: ConnectionSettings): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, iv);

  const jsonStr = JSON.stringify(settings);
  let encrypted = cipher.update(jsonStr, 'utf8', 'binary');
  encrypted += cipher.final('binary');

  // Guacamole-lite expects: base64(JSON.stringify({iv: base64(iv), value: base64(encrypted)}))
  const tokenData = {
    iv: Buffer.from(iv).toString('base64'),
    value: Buffer.from(encrypted, 'binary').toString('base64'),
  };

  return Buffer.from(JSON.stringify(tokenData), 'ascii').toString('base64');
}

/**
 * Creates a connection token for a server
 */
export function createConnectionToken(
  server: {
    host: string;
    port: number;
    protocol: 'ssh' | 'rdp' | 'vnc';
    username?: string;
    password?: string;
  },
  sessionId: string
): string {
  const settings: ConnectionSettings = {
    connection: {
      type: server.protocol,
      settings: {
        hostname: server.host,
        port: server.port,
        // Recording
        'recording-path': env.GUAC_RECORDING_PATH,
        'recording-name': `session-${sessionId}`,
        'create-recording-path': 'true',
      },
    },
    // Include sessionId for tracking on connection open/close
    sessionId,
  };

  // Add credentials if provided
  if (server.username) {
    settings.connection.settings.username = server.username;
  }
  if (server.password) {
    settings.connection.settings.password = server.password;
  }

  // Protocol-specific settings
  if (server.protocol === 'ssh') {
    // SSH specific - required for proper terminal rendering
    settings.connection.settings['font-size'] = 12;
    settings.connection.settings['font-name'] = 'monospace';
    settings.connection.settings['color-scheme'] = 'gray-black';
    settings.connection.settings['terminal-type'] = 'xterm-256color';
    settings.connection.settings['backspace'] = 127;
    settings.connection.settings['scrollback'] = 1000;
  } else if (server.protocol === 'vnc') {
    // VNC specific
    settings.connection.settings['color-depth'] = 24;
  } else if (server.protocol === 'rdp') {
    // RDP specific
    settings.connection.settings['ignore-cert'] = true;
    settings.connection.settings['security'] = 'any';
    settings.connection.settings['resize-method'] = 'display-update';
  }

  return encryptToken(settings);
}
