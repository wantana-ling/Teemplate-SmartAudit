import { env } from '../config/env.js';
import type { Session, SessionAnalysis, KeystrokeEvent, RiskLevel, BehavioralFlags, Indicators, SessionFinding } from '@smartaiaudit/shared';
import { keystrokesToText } from '@smartaiaudit/shared';
import { riskDetectionService, type RiskAlert } from './risk-detection.service.js';
import { ruleLoaderService } from './rule-loader.service.js';

// Professional security analyst system prompt
const SYSTEM_PROMPT = `You are a Principal Security Analyst preparing formal audit documentation for the Security Operations Center. Write as an experienced professional with direct, evidence-based findings.

WRITING STANDARDS (MANDATORY):
- Use formal third-person voice (The analyst observed, The session revealed, Evidence indicates)
- Write declarative statements with specific timestamps and evidence
- NO contractions (cannot, does not, will not - never use shortened forms)
- NO quotation marks around technical terms or commands
- FORBIDDEN phrases that must never appear: "I would recommend", "It appears that", "It seems", "certainly", "happy to", "I'd suggest", "basically", "actually", "just", "simply", "obviously", "of course"
- Use active voice for findings (The user executed... not The command was executed...)
- Reference specific evidence from the keystroke data
- Be direct and concise - avoid hedging language
- Do not use emoticons or informal language

ANALYSIS FRAMEWORK:
Apply MITRE ATT&CK methodology to classify observed behaviors:
- Initial Access (T1078, T1190) - Valid Accounts, Exploit Public-Facing Application
- Execution (T1059, T1053) - Command and Scripting Interpreter, Scheduled Task
- Persistence (T1098, T1136) - Account Manipulation, Create Account
- Privilege Escalation (T1548, T1068) - Abuse Elevation Control, Exploitation for Privilege Escalation
- Defense Evasion (T1070, T1036) - Indicator Removal, Masquerading
- Credential Access (T1003, T1552) - OS Credential Dumping, Unsecured Credentials
- Discovery (T1082, T1083) - System Information Discovery, File and Directory Discovery
- Lateral Movement (T1021, T1563) - Remote Services, Remote Service Session Hijacking
- Collection (T1005, T1039) - Data from Local System, Data from Network Shared Drive
- Exfiltration (T1041, T1048) - Exfiltration Over C2 Channel, Exfiltration Over Alternative Protocol
- Impact (T1485, T1486) - Data Destruction, Data Encrypted for Impact

RISK CLASSIFICATION CRITERIA:
- LOW: Standard administrative operations within documented scope. Routine file operations, system monitoring, and authorized configuration review.
- MEDIUM: Elevated privilege usage, sensitive file access, configuration changes. Activity warrants documentation but does not indicate malicious intent.
- HIGH: Unauthorized access patterns, security control modifications, bulk data operations. Immediate supervisor notification recommended.
- CRITICAL: Active exploitation, data exfiltration, malicious payload execution, evidence destruction. Immediate incident response required.

COMPLIANCE FRAMEWORKS TO CONSIDER:
- PCI-DSS: Payment card data access, network segmentation, access controls
- HIPAA: Protected health information access, audit trails, minimum necessary
- SOX: Financial system access, change management, segregation of duties
- GDPR: Personal data processing, data subject rights, cross-border transfers
- ISO 27001: Information security controls, risk assessment, incident management`;

// Structured output schema for OpenRouter
const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    executiveSummary: {
      type: 'string',
      description: 'Two to three sentence summary of session activity and key findings. Written in third-person professional voice.',
    },
    riskClassification: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'critical'],
      description: 'Overall risk level based on observed activities',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Generate 2-5 descriptive tags for this session based on observed activities. Use lowercase kebab-case format. Examples: privilege-escalation, file-access, network-scan, data-export, routine-admin, config-change, user-management, database-query, log-review, system-update',
    },
    behavioralFlags: {
      type: 'object',
      description: 'MITRE ATT&CK aligned behavioral flags - set to true ONLY if there is clear evidence',
      properties: {
        privilegeEscalation: { type: 'boolean', description: 'TA0004 - sudo, su, runas, setuid, capability abuse' },
        dataExfiltration: { type: 'boolean', description: 'TA0010 - scp, curl upload, data encoding, cloud storage' },
        persistence: { type: 'boolean', description: 'TA0003 - crontab, systemd, registry run keys, startup scripts' },
        lateralMovement: { type: 'boolean', description: 'TA0008 - ssh to other hosts, RDP, psexec, WMI' },
        credentialAccess: { type: 'boolean', description: 'TA0006 - /etc/passwd, /etc/shadow, mimikatz, credential files' },
        defenseEvasion: { type: 'boolean', description: 'TA0005 - log deletion, history clearing, disabling security tools' },
      },
      required: ['privilegeEscalation', 'dataExfiltration', 'persistence', 'lateralMovement', 'credentialAccess', 'defenseEvasion'],
    },
    indicators: {
      type: 'object',
      description: 'Indicators of Compromise (IoCs) extracted from the session',
      properties: {
        ipAddresses: { type: 'array', items: { type: 'string' }, description: 'IP addresses observed (exclude localhost)' },
        domains: { type: 'array', items: { type: 'string' }, description: 'Domain names observed' },
        fileHashes: { type: 'array', items: { type: 'string' }, description: 'File hashes (MD5, SHA1, SHA256) observed' },
        urls: { type: 'array', items: { type: 'string' }, description: 'URLs observed (http/https)' },
        userAccounts: { type: 'array', items: { type: 'string' }, description: 'User accounts referenced (excluding common service accounts)' },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Finding identifier (F001, F002, etc.)' },
          severity: { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] },
          title: { type: 'string', description: 'Brief finding title' },
          description: { type: 'string', description: 'Detailed finding description' },
          evidence: { type: 'string', description: 'Specific commands or actions observed' },
          mitreTactic: { type: 'string', description: 'MITRE ATT&CK tactic name (e.g., Privilege Escalation)' },
          mitreTechniqueId: { type: 'string', description: 'MITRE ATT&CK technique ID (e.g., T1059.001, T1548)' },
          mitreTechniqueName: { type: 'string', description: 'MITRE ATT&CK technique name (e.g., PowerShell)' },
          timestamp: { type: 'string', description: 'Approximate time offset in session' },
          commandRiskScore: { type: 'number', description: 'Risk score 0-10 for this specific finding' },
        },
        required: ['id', 'severity', 'title', 'evidence'],
      },
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific, actionable security recommendations',
    },
    complianceImplications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          framework: { type: 'string', enum: ['PCI-DSS', 'HIPAA', 'SOX', 'GDPR', 'ISO27001'] },
          requirement: { type: 'string' },
          status: { type: 'string', enum: ['compliant', 'violation', 'review_required'] },
        },
      },
    },
    behaviorAnalysis: {
      type: 'object',
      properties: {
        sessionPurpose: { type: 'string', description: 'Inferred purpose of the session' },
        legitimateActivities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Normal administrative activities observed',
        },
        anomalies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Unusual patterns that deviate from normal behavior',
        },
        riskIndicators: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific indicators of potential risk',
        },
      },
    },
  },
  required: ['executiveSummary', 'riskClassification', 'findings', 'tags', 'behavioralFlags'],
};

// Model tiers for cost optimization
interface TierConfig {
  useSmallModel: boolean;
  maxTokens: number;
  temperature: number;
}

// Tier configuration is loaded from scoring.json via rule-loader

// Cost tracking
interface AnalysisCost {
  tier: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

class LLMService {
  private costLog: AnalysisCost[] = [];

  /**
   * Select analysis tier based on risk score
   * All sessions get analyzed - low risk uses small model, high risk uses large model
   */
  private selectAnalysisTier(riskScore: number): 'light' | 'full' {
    const threshold = ruleLoaderService.getRules().scoring.llmTierThreshold;
    if (riskScore > threshold) return 'full';
    return 'light';
  }

  /**
   * Generate fallback template summary when LLM is unavailable
   */
  private generateFallbackSummary(session: Session, keystrokes: KeystrokeEvent[]): SessionAnalysis {
    const keystrokeText = keystrokesToText(keystrokes);
    const commandCount = (keystrokeText.match(/\[ENTER\]/g) || []).length;
    const durationFormatted = this.formatDuration(session.duration_seconds || 0);

    return {
      summary: `The session on ${session.server?.name || 'the target server'} consisted of ${commandCount} commands executed over ${durationFormatted}. AI analysis unavailable - manual review recommended.`,
      riskLevel: 'low',
      riskFactors: [],
      recommendations: ['Manual review recommended - AI analysis was not available.'],
      suspiciousActivities: [],
      complianceFlags: [],
    };
  }

  /**
   * Analyze a session using tiered approach
   * All sessions are analyzed with LLM - small model for low risk, large model for high risk
   */
  async analyzeSession(
    session: Session,
    keystrokes: KeystrokeEvent[],
    precomputedAlerts?: RiskAlert[]
  ): Promise<SessionAnalysis> {
    // Calculate risk score from alerts
    const alerts = precomputedAlerts || riskDetectionService.detectRisks(session.id);
    const riskScore = riskDetectionService.calculateRiskScore(alerts);
    const tier = this.selectAnalysisTier(riskScore);

    console.log(`[LLM] Session ${session.id}: Risk score ${riskScore}, tier: ${tier}`);

    // Check API key
    if (!env.OPENROUTER_API_KEY) {
      console.warn('[LLM] API key not set, falling back to template');
      return this.generateFallbackSummary(session, keystrokes);
    }

    // Get tier configuration from scoring rules and select model from environment
    const tierConfig = ruleLoaderService.getRules().scoring.llmTiers[tier] as TierConfig;
    const modelToUse = tierConfig.useSmallModel ? env.OPENROUTER_MODEL_SMALL : env.OPENROUTER_MODEL_LARGE;

    console.log(`[LLM] Analyzing session ${session.id} with model: ${modelToUse} (${tier} tier)`);
    console.log(`[LLM] Keystrokes received: ${keystrokes.length}`);

    try {
      const prompt = this.buildPrompt(session, keystrokes, alerts);

      const requestBody: Record<string, unknown> = {
        model: modelToUse,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: tierConfig.maxTokens,
        temperature: tierConfig.temperature,
      };

      // Add structured output for supported models
      if (modelToUse.includes('claude') || modelToUse.includes('gpt-4')) {
        requestBody.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'security_analysis',
            strict: true,
            schema: ANALYSIS_SCHEMA,
          },
        };
      } else if (modelToUse.includes('gemini')) {
        // Gemini models use simpler JSON mode
        requestBody.response_format = {
          type: 'json_object',
        };
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': env.APP_URL || 'https://smartaiaudit.com',
          'X-Title': 'SmartAudit',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[LLM] API error:', error);
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Log cost tracking
      const usage = data.usage || {};
      this.logCost({
        tier,
        model: modelToUse,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        estimatedCost: this.estimateCost(modelToUse, usage.prompt_tokens || 0, usage.completion_tokens || 0),
      });

      return this.parseStructuredResponse(content, alerts);
    } catch (error) {
      console.error('[LLM] Failed to analyze session:', error);
      // Fall back to template with risk factors from regex
      const fallback = this.generateFallbackSummary(session, keystrokes);
      if (alerts.length > 0) {
        fallback.riskLevel = riskDetectionService.calculateRiskLevel(alerts);
        fallback.riskFactors = alerts.map((a) => a.pattern);
        fallback.summary = `Automated analysis identified ${alerts.length} potential security indicators during the session. Manual review recommended due to LLM analysis failure.`;
      }
      return fallback;
    }
  }

  /**
   * Build analysis prompt with session context
   */
  private buildPrompt(session: Session, keystrokes: KeystrokeEvent[], alerts: RiskAlert[]): string {
    let keystrokeText = keystrokesToText(keystrokes);

    // Fallback if keystrokesToText returns empty
    if (keystrokeText.length === 0 && keystrokes.length > 0) {
      keystrokeText = keystrokes
        .filter((k) => k.character && k.character.length > 0)
        .map((k) => k.character)
        .join('');
    }

    const durationSeconds = session.duration_seconds || 0;
    const keystrokesPerMinute =
      durationSeconds > 0 ? Math.round((session.keystroke_count || 0) / (durationSeconds / 60)) : 0;

    // Classify typing speed
    let typingSpeedAssessment = 'normal typing pattern';
    if (keystrokesPerMinute > 300) {
      typingSpeedAssessment = 'EXTREMELY HIGH - indicates automated script or copy/paste operations';
    } else if (keystrokesPerMinute > 200) {
      typingSpeedAssessment = 'HIGH - possible paste operations or script execution';
    } else if (keystrokesPerMinute < 10 && keystrokesPerMinute > 0) {
      typingSpeedAssessment = 'LOW - intermittent activity or monitoring session';
    }

    // Format pre-detected alerts for context
    const alertsSummary =
      alerts.length > 0
        ? alerts
            .slice(0, 10)
            .map(
              (a) =>
                `- [${a.level.toUpperCase()}] ${a.pattern}${a.mitreTechnique ? ` (${a.mitreTechnique})` : ''}: ${a.matchedText}`
            )
            .join('\n')
        : 'No high-confidence patterns detected by automated scanning.';

    return `Analyze this remote desktop session for security risks and produce a formal audit report.

## SESSION METADATA
- Session ID: ${session.id}
- Protocol: ${session.server?.protocol?.toUpperCase() || 'Unknown'}
- Target Server: ${session.server?.name || 'Unknown'}
- Host/IP: ${session.server?.hostname || 'Unknown'}
- Session Duration: ${this.formatDuration(durationSeconds)}
- Final Status: ${session.status}
- Total Keystrokes: ${session.keystroke_count || 0}
- Keystrokes/Minute: ${keystrokesPerMinute} (${typingSpeedAssessment})

## AUTOMATED PATTERN DETECTION (Pre-Analysis)
${alertsSummary}

## CAPTURED COMMAND/KEYSTROKE SEQUENCE
\`\`\`
${keystrokeText.length > 0 ? keystrokeText.substring(0, 10000) : '(no keystrokes captured during this session)'}
\`\`\`
${keystrokeText.length > 10000 ? '\n[NOTE: Output truncated - full session contained additional data]' : ''}

## ANALYSIS REQUIREMENTS
1. Identify all commands executed and classify their purpose
2. Assess whether observed activities align with legitimate administrative tasks
3. Flag any suspicious sequences, risky operations, or policy violations
4. Consider the protocol context (SSH terminal operations vs RDP/VNC graphical interface)
5. Map findings to MITRE ATT&CK framework where applicable
6. Provide specific, actionable security recommendations
7. Note any compliance implications (PCI-DSS, HIPAA, SOX, GDPR, ISO 27001)

## REQUIRED JSON OUTPUT FORMAT
You MUST respond with ONLY a valid JSON object. Do not include any text before or after the JSON. Use this exact structure:

{
  "executiveSummary": "Two to three sentence summary written in third-person professional voice",
  "riskClassification": "low" | "medium" | "high" | "critical",
  "tags": ["tag-one", "tag-two", "tag-three"],
  "behavioralFlags": {
    "privilegeEscalation": false,
    "dataExfiltration": false,
    "persistence": false,
    "lateralMovement": false,
    "credentialAccess": false,
    "defenseEvasion": false
  },
  "indicators": {
    "ipAddresses": [],
    "domains": [],
    "fileHashes": [],
    "urls": [],
    "userAccounts": []
  },
  "findings": [
    {
      "id": "F001",
      "severity": "info" | "low" | "medium" | "high" | "critical",
      "title": "Brief finding title",
      "description": "Detailed description",
      "evidence": "Specific commands or actions observed",
      "mitreTactic": "MITRE ATT&CK tactic name",
      "mitreTechniqueId": "T1059.001",
      "mitreTechniqueName": "PowerShell",
      "commandRiskScore": 7
    }
  ],
  "recommendations": ["Specific recommendation 1", "Specific recommendation 2"],
  "complianceImplications": [
    { "framework": "PCI-DSS" | "HIPAA" | "SOX" | "GDPR" | "ISO27001", "requirement": "Requirement text", "status": "compliant" | "violation" | "review_required" }
  ],
  "behaviorAnalysis": {
    "sessionPurpose": "Inferred purpose of the session",
    "legitimateActivities": ["Activity 1"],
    "anomalies": ["Anomaly 1"],
    "riskIndicators": ["Risk indicator 1"]
  }
}

CRITICAL REQUIREMENTS:
1. "tags": REQUIRED. Generate 2-5 descriptive tags. Use lowercase kebab-case format (max 24 chars).
2. "behavioralFlags": REQUIRED. Set each flag to true ONLY if there is clear evidence in the keystroke data.
   - privilegeEscalation: sudo, su, runas, setuid, UAC bypass, privilege token manipulation
   - dataExfiltration: scp/sftp uploads, curl/wget POST, base64 encoding data, cloud storage uploads
   - persistence: crontab edits, systemd unit creation, registry run keys, startup scripts
   - lateralMovement: ssh/rdp to other hosts, psexec, WMI remote execution
   - credentialAccess: reading /etc/shadow, mimikatz, credential file access, password dumping
   - defenseEvasion: history -c, rm logs, disabling antivirus, timestomping
3. "indicators": Extract any IoCs observed. Include IPs (not localhost), domains, hashes, URLs, user accounts.
4. "findings": Each finding MUST include mitreTechniqueId (format: T####.### or T####) when a MITRE technique applies.`;
  }

  /**
   * Parse structured response from LLM
   */
  private parseStructuredResponse(content: string, alerts: RiskAlert[]): SessionAnalysis {
    console.log(`[LLM] Parsing response, content length: ${content.length}`);
    console.log(`[LLM] First 500 chars of response:`, content.substring(0, 500));

    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`[LLM] Parsed JSON keys:`, Object.keys(parsed));

        // Map structured response to SessionAnalysis
        const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];

        // Transform findings to SessionFinding format
        const findings: SessionFinding[] = rawFindings.map((f: any) => ({
          id: f.id || 'F000',
          severity: this.validateFindingSeverity(f.severity),
          title: f.title || 'Untitled finding',
          description: f.description || '',
          evidence: f.evidence || '',
          mitreTactic: f.mitreTactic,
          mitreTechniqueId: f.mitreTechniqueId || f.mitreTechnique, // Support both old and new field names
          mitreTechniqueName: f.mitreTechniqueName,
          timestamp: f.timestamp,
          commandRiskScore: typeof f.commandRiskScore === 'number' ? f.commandRiskScore : undefined,
        }));

        const suspiciousActivities = rawFindings
          .filter((f: { severity: string }) => ['medium', 'high', 'critical'].includes(f.severity))
          .map(
            (f: { timestamp?: string; title?: string; description?: string; severity: string; evidence?: string }) => ({
              timestamp: this.parseTimestamp(f.timestamp),
              description: f.title || f.description || 'Unspecified finding',
              severity: this.validateRiskLevel(f.severity),
              context: f.evidence,
            })
          );

        // Extract risk factors from findings
        const riskFactors = rawFindings
          .filter((f: { severity: string }) => f.severity !== 'info')
          .map(
            (f: { title?: string; mitreTechniqueId?: string; mitreTechnique?: string }) =>
              `${f.title}${f.mitreTechniqueId || f.mitreTechnique ? ` (${f.mitreTechniqueId || f.mitreTechnique})` : ''}`
          );

        // Add any critical/high alerts from regex that were not in LLM findings
        const alertFactors = alerts
          .filter((a) => ['critical', 'high'].includes(a.level))
          .map((a) => `${a.pattern}${a.mitreTechnique ? ` (${a.mitreTechnique})` : ''}`);

        const combinedFactors = Array.from(new Set([...riskFactors, ...alertFactors]));

        // Extract compliance flags
        const complianceFlags = Array.isArray(parsed.complianceImplications)
          ? parsed.complianceImplications
              .filter((c: { status: string }) => c.status !== 'compliant')
              .map((c: { framework?: string; requirement?: string; status?: string }) => `${c.framework}: ${c.requirement} (${c.status})`)
          : [];

        // Extract and normalize tags
        const tags = Array.isArray(parsed.tags)
          ? parsed.tags.map((t: string) => t.toLowerCase().trim().replace(/\s+/g, '-')).slice(0, 5)
          : this.generateFallbackTags(parsed, alerts);

        // Extract behavioral flags
        const behavioralFlags: BehavioralFlags = this.extractBehavioralFlags(parsed, alerts);

        // Extract indicators of compromise
        const indicators: Indicators = this.extractIndicators(parsed);

        return {
          summary: parsed.executiveSummary || 'Analysis completed without summary.',
          riskLevel: this.validateRiskLevel(parsed.riskClassification),
          riskFactors: combinedFactors,
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
          suspiciousActivities,
          complianceFlags,
          tags,
          behavioralFlags,
          findings,
          indicators,
        };
      }
    } catch (error) {
      console.error('[LLM] Failed to parse structured response:', error);
    }

    // Fallback parsing for non-structured responses
    return this.parseLegacyResponse(content, alerts);
  }

  /**
   * Validate finding severity
   */
  private validateFindingSeverity(severity: string): 'info' | 'low' | 'medium' | 'high' | 'critical' {
    const valid = ['info', 'low', 'medium', 'high', 'critical'];
    const normalized = (severity || '').toLowerCase().trim();
    return valid.includes(normalized) ? (normalized as any) : 'info';
  }

  /**
   * Extract behavioral flags from LLM response and alerts
   */
  private extractBehavioralFlags(parsed: any, alerts: RiskAlert[]): BehavioralFlags {
    // Start with LLM-provided flags
    const llmFlags = parsed.behavioralFlags || {};

    // Default all to false
    const flags: BehavioralFlags = {
      privilegeEscalation: llmFlags.privilegeEscalation === true,
      dataExfiltration: llmFlags.dataExfiltration === true,
      persistence: llmFlags.persistence === true,
      lateralMovement: llmFlags.lateralMovement === true,
      credentialAccess: llmFlags.credentialAccess === true,
      defenseEvasion: llmFlags.defenseEvasion === true,
    };

    // Also check alerts for flags that LLM might have missed
    for (const alert of alerts) {
      const technique = (alert.mitreTechnique || '').toLowerCase();
      const pattern = alert.pattern.toLowerCase();

      // Map MITRE techniques to behavioral flags
      if (technique.includes('t1548') || technique.includes('t1068') || pattern.includes('privilege') || pattern.includes('sudo')) {
        flags.privilegeEscalation = true;
      }
      if (technique.includes('t1041') || technique.includes('t1048') || pattern.includes('exfil') || pattern.includes('upload')) {
        flags.dataExfiltration = true;
      }
      if (technique.includes('t1098') || technique.includes('t1136') || technique.includes('t1053') || pattern.includes('cron') || pattern.includes('persist')) {
        flags.persistence = true;
      }
      if (technique.includes('t1021') || technique.includes('t1563') || pattern.includes('lateral') || pattern.includes('ssh ')) {
        flags.lateralMovement = true;
      }
      if (technique.includes('t1003') || technique.includes('t1552') || pattern.includes('credential') || pattern.includes('password')) {
        flags.credentialAccess = true;
      }
      if (technique.includes('t1070') || technique.includes('t1036') || pattern.includes('evasion') || pattern.includes('history -c')) {
        flags.defenseEvasion = true;
      }
    }

    return flags;
  }

  /**
   * Extract indicators of compromise from LLM response
   */
  private extractIndicators(parsed: any): Indicators {
    const llmIndicators = parsed.indicators || {};

    return {
      ipAddresses: Array.isArray(llmIndicators.ipAddresses)
        ? llmIndicators.ipAddresses.filter((ip: string) => this.isValidIP(ip))
        : [],
      domains: Array.isArray(llmIndicators.domains)
        ? llmIndicators.domains.filter((d: string) => this.isValidDomain(d))
        : [],
      fileHashes: Array.isArray(llmIndicators.fileHashes)
        ? llmIndicators.fileHashes.filter((h: string) => this.isValidHash(h))
        : [],
      urls: Array.isArray(llmIndicators.urls)
        ? llmIndicators.urls.filter((u: string) => typeof u === 'string' && u.startsWith('http'))
        : [],
      userAccounts: Array.isArray(llmIndicators.userAccounts)
        ? llmIndicators.userAccounts.filter((a: string) => typeof a === 'string' && a.length > 0)
        : [],
    };
  }

  /**
   * Validate IP address
   */
  private isValidIP(ip: string): boolean {
    if (typeof ip !== 'string') return false;
    // Skip localhost and private ranges for IoC purposes
    if (ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.') || ip === 'localhost') {
      return false;
    }
    // Basic IPv4 validation
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    return parts.every((p) => {
      const num = parseInt(p, 10);
      return !isNaN(num) && num >= 0 && num <= 255;
    });
  }

  /**
   * Validate domain
   */
  private isValidDomain(domain: string): boolean {
    if (typeof domain !== 'string') return false;
    // Basic domain validation
    return /^[a-zA-Z0-9][a-zA-Z0-9-_.]+\.[a-zA-Z]{2,}$/.test(domain);
  }

  /**
   * Validate hash (MD5, SHA1, SHA256)
   */
  private isValidHash(hash: string): boolean {
    if (typeof hash !== 'string') return false;
    // MD5 (32), SHA1 (40), SHA256 (64) hex characters
    return /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/.test(hash);
  }

  /**
   * Generate fallback tags based on findings and alerts when AI doesn't provide tags
   */
  private generateFallbackTags(parsed: any, alerts: RiskAlert[]): string[] {
    const tags: string[] = [];

    // Add tag based on risk level
    const riskLevel = this.validateRiskLevel(parsed.riskClassification || parsed.riskLevel);
    if (riskLevel === 'critical' || riskLevel === 'high') {
      tags.push('needs-review');
    }

    // Add tags based on alert patterns
    const alertPatterns = alerts.map((a) => a.pattern.toLowerCase());
    if (alertPatterns.some((p) => p.includes('sudo') || p.includes('privilege'))) {
      tags.push('privilege-escalation');
    }
    if (alertPatterns.some((p) => p.includes('password') || p.includes('credential'))) {
      tags.push('credential-access');
    }
    if (alertPatterns.some((p) => p.includes('rm ') || p.includes('delete'))) {
      tags.push('data-deletion');
    }
    if (alertPatterns.some((p) => p.includes('ssh') || p.includes('network'))) {
      tags.push('network-activity');
    }
    if (alertPatterns.some((p) => p.includes('cat ') || p.includes('file'))) {
      tags.push('file-access');
    }

    // Default tag if no specific patterns matched
    if (tags.length === 0) {
      tags.push('routine-admin');
    }

    return tags.slice(0, 5);
  }

  /**
   * Parse legacy/unstructured response format
   */
  private parseLegacyResponse(content: string, alerts: RiskAlert[]): SessionAnalysis {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || parsed.executiveSummary || 'No summary available',
          riskLevel: this.validateRiskLevel(parsed.riskLevel || parsed.riskClassification),
          riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [],
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
          suspiciousActivities: Array.isArray(parsed.suspiciousActivities) ? parsed.suspiciousActivities : [],
          complianceFlags: Array.isArray(parsed.complianceFlags) ? parsed.complianceFlags : [],
        };
      }
    } catch (error) {
      console.error('[LLM] Failed to parse legacy response:', error);
    }

    // Ultimate fallback
    const fallbackRiskLevel = riskDetectionService.calculateRiskLevel(alerts);
    return {
      summary: content.substring(0, 500),
      riskLevel: fallbackRiskLevel,
      riskFactors: alerts.map((a) => a.pattern),
      recommendations: ['Manual review recommended due to parsing failure.'],
      suspiciousActivities: [],
      complianceFlags: [],
    };
  }

  /**
   * Parse timestamp string to number
   */
  private parseTimestamp(ts?: string): number {
    if (!ts) return 0;
    // Handle formats like "0:30", "1:45", "00:01:30"
    const parts = ts.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  /**
   * Validate and normalize risk level
   */
  private validateRiskLevel(level: string): RiskLevel {
    const valid: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    const normalized = (level || '').toLowerCase().trim();
    return valid.includes(normalized as RiskLevel) ? (normalized as RiskLevel) : 'low';
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  /**
   * Estimate cost for a model call
   */
  private estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    // Pricing per million tokens (approximate, check OpenRouter for current prices)
    const pricing: Record<string, { input: number; output: number }> = {
      // Anthropic models
      'anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
      'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
      'anthropic/claude-3-opus': { input: 15, output: 75 },
      // Google Gemini models
      'google/gemini-3-flash-preview': { input: 0.1, output: 0.4 },
      'google/gemini-3-pro-preview': { input: 1.25, output: 5 },
      'google/gemini-2.5-flash-preview': { input: 0.1, output: 0.4 },
      'google/gemini-2.5-pro-preview': { input: 1.25, output: 5 },
    };

    // Default to mid-range pricing if model not found
    const modelPricing = pricing[model] || { input: 1, output: 4 };
    return (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1000000;
  }

  /**
   * Log cost for tracking
   */
  private logCost(cost: AnalysisCost): void {
    this.costLog.push(cost);
    console.log(
      `[LLM] Cost: ${cost.tier} tier, ${cost.model}, ${cost.inputTokens}/${cost.outputTokens} tokens, $${cost.estimatedCost.toFixed(6)}`
    );
  }

  /**
   * Get cost statistics
   */
  getCostStats(): { totalCost: number; analysisByTier: Record<string, number> } {
    const totalCost = this.costLog.reduce((sum, c) => sum + c.estimatedCost, 0);
    const analysisByTier = this.costLog.reduce(
      (acc, c) => {
        acc[c.tier] = (acc[c.tier] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return { totalCost, analysisByTier };
  }

}

// Export singleton
export const llmService = new LLMService();
