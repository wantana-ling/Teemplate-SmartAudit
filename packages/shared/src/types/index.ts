// Core entity types
export interface Server {
  id: string;
  name: string;
  hostname: string;
  port: number;
  protocol: 'vnc' | 'rdp' | 'ssh';
  description?: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AuditorProfile {
  id: string;
  email: string;
  full_name: string;
  organization?: string;
  role: 'auditor' | 'admin' | 'viewer';
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export type SessionStatus = 'connecting' | 'active' | 'disconnected' | 'error';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type UserRole = 'super_admin' | 'admin' | 'auditor' | 'client';

// Behavioral flags aligned with MITRE ATT&CK tactics
export interface BehavioralFlags {
  privilegeEscalation: boolean;  // TA0004
  dataExfiltration: boolean;     // TA0010
  persistence: boolean;          // TA0003
  lateralMovement: boolean;      // TA0008
  credentialAccess: boolean;     // TA0006
  defenseEvasion: boolean;       // TA0005
}

// Indicators of Compromise extracted from sessions
export interface Indicators {
  ipAddresses: string[];
  domains: string[];
  fileHashes: string[];
  urls: string[];
  userAccounts: string[];
}

// Detailed finding with MITRE technique mapping
export interface SessionFinding {
  id: string;                         // F001, F002, etc.
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  evidence: string;                   // Specific commands or actions observed
  mitreTactic?: string;               // e.g., "Privilege Escalation"
  mitreTechniqueId?: string;          // e.g., "T1059.001"
  mitreTechniqueName?: string;        // e.g., "PowerShell"
  timestamp?: string;                 // Time offset in session
  commandRiskScore?: number;          // 0-10 risk score for specific command
}

export interface Session {
  id: string;
  server_id: string;
  server?: Server;
  client_user_id: string;
  client_user?: AuditorProfile;

  status: SessionStatus;

  started_at: string;
  ended_at?: string;
  duration_seconds?: number;

  // Recording data
  guac_recording_url?: string;
  guac_file_size_bytes?: number;
  video_url?: string;
  video_duration_seconds?: number;
  thumbnail_url?: string;

  // Analytics
  keystroke_count: number;
  mouse_event_count: number;

  // AI Analysis
  ai_summary?: string;
  risk_level?: RiskLevel;
  risk_factors?: string[];
  suspicious_activities?: SuspiciousActivity[];
  analyzed_at?: string;

  // Tags for categorization
  tags?: string[];

  // Review tracking
  reviewed?: boolean;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;

  // Behavioral flags (MITRE ATT&CK aligned)
  privilege_escalation?: boolean;
  data_exfiltration?: boolean;
  persistence?: boolean;
  lateral_movement?: boolean;
  credential_access?: boolean;
  defense_evasion?: boolean;

  // Detailed analysis
  indicators?: Indicators;
  findings?: SessionFinding[];

  // Connection metadata
  connection_id?: string;
  client_ip?: string;
  user_agent?: string;
  error_message?: string;
}

export interface KeystrokeEvent {
  timestamp: number; // Milliseconds from session start
  keysym: number; // X11 keysym code
  pressed: boolean;
  character: string;
  type: 'key' | 'special';
}

export interface SuspiciousActivity {
  timestamp: number;
  description: string;
  severity: RiskLevel;
  context?: string;
}

export interface SessionAnalysis {
  summary: string;
  riskLevel: RiskLevel;
  riskFactors: string[];
  recommendations: string[];
  suspiciousActivities: SuspiciousActivity[];
  complianceFlags: string[];
  tags?: string[];
  behavioralFlags?: BehavioralFlags;
  findings?: SessionFinding[];
  indicators?: Indicators;
}

export interface VideoExportJob {
  id: string;
  session_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  quality: 'low' | 'medium' | 'high';
  progress_percent: number;
  output_url?: string;
  output_size_bytes?: number;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

// API types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// WebSocket event types
export interface LiveSessionUpdate {
  sessionId: string;
  status: SessionStatus;
  timestamp: number;
  keystrokeCount: number;
  mouseEventCount: number;
}

export interface GuacamoleMessage {
  type: 'instruction' | 'sync' | 'error';
  data: string;
  timestamp: number;
}

// Request types
export interface CreateSessionRequest {
  server_id: string;
  credentials?: {
    username?: string;
    password?: string;
  };
}

export interface CreateServerRequest {
  name: string;
  hostname: string;
  port: number;
  protocol: 'vnc' | 'rdp' | 'ssh';
  description?: string;
}

export interface ExportVideoRequest {
  session_id: string;
  quality?: 'low' | 'medium' | 'high';
}

// User ban types
export type BanDuration = '1h' | '24h' | '7d' | '30d' | 'permanent';

export interface UserBan {
  id: string;
  user_id: string;
  server_id?: string;        // null = global ban
  banned_by: string;
  banned_at: string;
  expires_at?: string;       // null = permanent
  reason: string;
  lifted_by?: string;
  lifted_at?: string;
  session_id?: string;       // Optional reference to triggering session
  created_at: string;
  // Joined fields
  banned_username?: string;
  banned_display_name?: string;
  banned_by_username?: string;
  server_name?: string;
  ban_scope?: 'Global' | 'Server';
}

export interface CreateBanRequest {
  userId: string;
  serverId?: string;
  reason: string;
  duration?: BanDuration;
  sessionId?: string;
}

// Risk profile types
export interface UserRiskProfile {
  user_id: string;
  total_sessions: number;
  high_risk_sessions: number;
  critical_sessions: number;
  privilege_escalation_count: number;
  data_exfiltration_count: number;
  persistence_count: number;
  lateral_movement_count: number;
  credential_access_count: number;
  defense_evasion_count: number;
  risk_score_7d: number;
  risk_score_30d: number;
  risk_score_all_time: number;
  last_session_at?: string;
  last_high_risk_at?: string;
  updated_at: string;
  // Joined fields
  username?: string;
  display_name?: string;
}

export interface ServerRiskProfile {
  server_id: string;
  total_sessions: number;
  high_risk_sessions: number;
  critical_sessions: number;
  unique_users: number;
  risk_score_7d: number;
  risk_score_30d: number;
  last_session_at?: string;
  last_high_risk_at?: string;
  updated_at: string;
  // Joined fields
  server_name?: string;
}

// Permission types
export interface RolePermissions {
  role: UserRole;
  permissions: Record<string, boolean>;
  description?: string;
}

// Available permissions
export type Permission =
  | 'all'
  | 'users.view'
  | 'users.create'
  | 'users.edit'
  | 'users.disable'
  | 'servers.view'
  | 'servers.create'
  | 'servers.edit'
  | 'servers.delete'
  | 'groups.view'
  | 'groups.create'
  | 'groups.edit'
  | 'groups.delete'
  | 'sessions.view'
  | 'sessions.terminate'
  | 'sessions.ban'
  | 'sessions.review'
  | 'sessions.tag'
  | 'live.view'
  | 'analytics.view'
  | 'bans.view'
  | 'bans.create'
  | 'bans.lift'
  | 'reports.view'
  | 'client.use';
