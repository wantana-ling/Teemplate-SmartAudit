// Protocol types
export const PROTOCOLS = ['vnc', 'rdp', 'ssh'] as const;

// Session statuses
export const SESSION_STATUS = {
  CONNECTING: 'connecting',
  ACTIVE: 'active',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
} as const;

// Risk levels
export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

// User roles
export const USER_ROLES = {
  AUDITOR: 'auditor',
  ADMIN: 'admin',
  VIEWER: 'viewer',
} as const;

// X11 Keysym mappings (full mapping)
export const KEYSYM_MAP: Record<number, string> = {
  // Letters (lowercase)
  0x0061: 'a', 0x0062: 'b', 0x0063: 'c', 0x0064: 'd', 0x0065: 'e',
  0x0066: 'f', 0x0067: 'g', 0x0068: 'h', 0x0069: 'i', 0x006a: 'j',
  0x006b: 'k', 0x006c: 'l', 0x006d: 'm', 0x006e: 'n', 0x006f: 'o',
  0x0070: 'p', 0x0071: 'q', 0x0072: 'r', 0x0073: 's', 0x0074: 't',
  0x0075: 'u', 0x0076: 'v', 0x0077: 'w', 0x0078: 'x', 0x0079: 'y',
  0x007a: 'z',

  // Letters (uppercase)
  0x0041: 'A', 0x0042: 'B', 0x0043: 'C', 0x0044: 'D', 0x0045: 'E',
  0x0046: 'F', 0x0047: 'G', 0x0048: 'H', 0x0049: 'I', 0x004a: 'J',
  0x004b: 'K', 0x004c: 'L', 0x004d: 'M', 0x004e: 'N', 0x004f: 'O',
  0x0050: 'P', 0x0051: 'Q', 0x0052: 'R', 0x0053: 'S', 0x0054: 'T',
  0x0055: 'U', 0x0056: 'V', 0x0057: 'W', 0x0058: 'X', 0x0059: 'Y',
  0x005a: 'Z',

  // Numbers
  0x0030: '0', 0x0031: '1', 0x0032: '2', 0x0033: '3', 0x0034: '4',
  0x0035: '5', 0x0036: '6', 0x0037: '7', 0x0038: '8', 0x0039: '9',

  // Punctuation and symbols
  0x0020: ' ',
  0x0021: '!', 0x0022: '"', 0x0023: '#', 0x0024: '$', 0x0025: '%',
  0x0026: '&', 0x0027: "'", 0x0028: '(', 0x0029: ')', 0x002a: '*',
  0x002b: '+', 0x002c: ',', 0x002d: '-', 0x002e: '.', 0x002f: '/',
  0x003a: ':', 0x003b: ';', 0x003c: '<', 0x003d: '=', 0x003e: '>',
  0x003f: '?', 0x0040: '@', 0x005b: '[', 0x005c: '\\', 0x005d: ']',
  0x005e: '^', 0x005f: '_', 0x0060: '`', 0x007b: '{', 0x007c: '|',
  0x007d: '}', 0x007e: '~',

  // Special keys
  0xff08: '[BACKSPACE]',
  0xff09: '[TAB]',
  0xff0d: '[ENTER]',
  0xff1b: '[ESCAPE]',
  0xff50: '[HOME]',
  0xff51: '[LEFT]',
  0xff52: '[UP]',
  0xff53: '[RIGHT]',
  0xff54: '[DOWN]',
  0xff55: '[PAGEUP]',
  0xff56: '[PAGEDOWN]',
  0xff57: '[END]',
  0xffff: '[DELETE]',

  // Function keys
  0xffbe: '[F1]', 0xffbf: '[F2]', 0xffc0: '[F3]', 0xffc1: '[F4]',
  0xffc2: '[F5]', 0xffc3: '[F6]', 0xffc4: '[F7]', 0xffc5: '[F8]',
  0xffc6: '[F9]', 0xffc7: '[F10]', 0xffc8: '[F11]', 0xffc9: '[F12]',
};

// Modifier keys (to ignore in keystroke capture)
export const MODIFIER_KEYS = new Set([
  0xffe1, // Shift_L
  0xffe2, // Shift_R
  0xffe3, // Control_L
  0xffe4, // Control_R
  0xffe9, // Alt_L
  0xffea, // Alt_R
  0xffe7, // Meta_L
  0xffe8, // Meta_R
  0xffeb, // Super_L
  0xffec, // Super_R
  0xffe5, // Caps_Lock
  0xffe6, // Shift_Lock
  0xff7f, // Num_Lock
  0xff14, // Scroll_Lock
]);

// Recording settings
export const DEFAULT_RECORDING_FPS = 15;
export const MAX_KEYSTROKE_DISPLAY = 100;
export const SESSION_CLEANUP_INTERVAL_MS = 3600000; // 1 hour

// File size limits
export const MAX_GUAC_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
export const MAX_VIDEO_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

// Colors for risk levels
export const RISK_COLORS = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#DC2626',
} as const;
