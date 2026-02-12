import { readFileSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

// ── Zod Schemas ─────────────────────────────────────────────────────

const PatternEntrySchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  pattern: z.string(),
  description: z.string(),
  mitreTactic: z.string().optional(),
  mitreTechnique: z.string().optional(),
});

const PatternsFileSchema = z.object({
  version: z.string(),
  lastModified: z.string(),
  patterns: z.object({
    critical: z.array(PatternEntrySchema),
    high: z.array(PatternEntrySchema),
    medium: z.array(PatternEntrySchema),
    low: z.array(PatternEntrySchema),
  }),
});

const SequenceEntrySchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  name: z.string(),
  patterns: z.array(z.string()),
  risk: z.enum(['high', 'critical']),
  description: z.string(),
  mitreTactic: z.string().optional(),
});

const SequencesFileSchema = z.object({
  version: z.string(),
  lastModified: z.string(),
  sequences: z.array(SequenceEntrySchema),
});

const ScoringFileSchema = z.object({
  version: z.string(),
  lastModified: z.string(),
  alertWeights: z.object({
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
  }),
  riskLevelOrder: z.array(z.string()),
  llmTierThreshold: z.number(),
  llmTiers: z.record(
    z.string(),
    z.object({
      useSmallModel: z.boolean(),
      maxTokens: z.number(),
      temperature: z.number(),
    })
  ),
  userRiskScoring: z.object({
    sessionWeights: z.object({
      critical: z.number(),
      high: z.number(),
      medium: z.number(),
    }),
    perBehavioralFlag: z.number(),
    cap: z.number(),
  }),
});

// ── Compiled Types ──────────────────────────────────────────────────

export interface RiskPattern {
  pattern: RegExp;
  description: string;
  mitreTactic?: string;
  mitreTechnique?: string;
}

export interface AttackSequence {
  name: string;
  patterns: RegExp[];
  risk: 'high' | 'critical';
  description: string;
  mitreTactic?: string;
}

export interface ScoringConfig {
  alertWeights: Record<string, number>;
  riskLevelOrder: string[];
  llmTierThreshold: number;
  llmTiers: Record<string, { useSmallModel: boolean; maxTokens: number; temperature: number }>;
  userRiskScoring: {
    sessionWeights: Record<string, number>;
    perBehavioralFlag: number;
    cap: number;
  };
}

export interface CompiledRules {
  patterns: Record<string, RiskPattern[]>;
  sequences: AttackSequence[];
  scoring: ScoringConfig;
  metadata: {
    patternsVersion: string;
    sequencesVersion: string;
    scoringVersion: string;
    loadedAt: Date;
    patternCount: number;
    sequenceCount: number;
    disabledPatternIds: string[];
    disabledSequenceIds: string[];
  };
}

// ── Default fallback data ───────────────────────────────────────────

const DEFAULT_SCORING: ScoringConfig = {
  alertWeights: { critical: 40, high: 20, medium: 5, low: 1 },
  riskLevelOrder: ['low', 'medium', 'high', 'critical'],
  llmTierThreshold: 50,
  llmTiers: {
    light: { useSmallModel: true, maxTokens: 1500, temperature: 0.1 },
    full: { useSmallModel: false, maxTokens: 2500, temperature: 0.2 },
  },
  userRiskScoring: {
    sessionWeights: { critical: 30, high: 15, medium: 5 },
    perBehavioralFlag: 5,
    cap: 100,
  },
};

const EMPTY_RULES: CompiledRules = {
  patterns: { critical: [], high: [], medium: [], low: [] },
  sequences: [],
  scoring: DEFAULT_SCORING,
  metadata: {
    patternsVersion: '0.0.0',
    sequencesVersion: '0.0.0',
    scoringVersion: '0.0.0',
    loadedAt: new Date(),
    patternCount: 0,
    sequenceCount: 0,
    disabledPatternIds: [],
    disabledSequenceIds: [],
  },
};

// ── Service ─────────────────────────────────────────────────────────

class RuleLoaderService {
  private rules: CompiledRules = EMPTY_RULES;
  private rulesDir: string;

  constructor() {
    this.rulesDir = process.env.RULES_DIR || resolve(process.cwd(), 'rules');
    this.loadAllRules();
  }

  /** Return the currently loaded compiled rules */
  getRules(): CompiledRules {
    return this.rules;
  }

  /** Reload all rule files from disk. Returns status info. */
  reloadRules(): { success: boolean; error?: string; metadata?: CompiledRules['metadata'] } {
    try {
      this.loadAllRules();
      return { success: true, metadata: this.rules.metadata };
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[RuleLoader] Reload failed:', msg);
      return { success: false, error: msg };
    }
  }

  // ── Internal loaders ────────────────────────────────────────────

  private loadAllRules(): void {
    const patterns = this.loadPatterns();
    const sequences = this.loadSequences();
    const scoring = this.loadScoring();

    const disabledPatternIds: string[] = [];
    const disabledSequenceIds: string[] = [];
    let patternCount = 0;

    // Compile patterns
    const compiledPatterns: Record<string, RiskPattern[]> = {};
    for (const [level, entries] of Object.entries(patterns.raw)) {
      compiledPatterns[level] = [];
      for (const entry of entries) {
        if (!entry.enabled) {
          disabledPatternIds.push(entry.id);
          continue;
        }
        try {
          compiledPatterns[level].push({
            pattern: new RegExp(entry.pattern, 'i'),
            description: entry.description,
            mitreTactic: entry.mitreTactic,
            mitreTechnique: entry.mitreTechnique,
          });
          patternCount++;
        } catch (err) {
          console.error(`[RuleLoader] Invalid regex in pattern ${entry.id}: ${entry.pattern}`, err);
        }
      }
    }

    // Compile sequences
    const compiledSequences: AttackSequence[] = [];
    for (const entry of sequences.raw) {
      if (!entry.enabled) {
        disabledSequenceIds.push(entry.id);
        continue;
      }
      try {
        const regexPatterns = entry.patterns.map((p) => new RegExp(p, 'i'));
        compiledSequences.push({
          name: entry.name,
          patterns: regexPatterns,
          risk: entry.risk,
          description: entry.description,
          mitreTactic: entry.mitreTactic,
        });
      } catch (err) {
        console.error(`[RuleLoader] Invalid regex in sequence ${entry.id}: ${entry.patterns}`, err);
      }
    }

    this.rules = {
      patterns: compiledPatterns,
      sequences: compiledSequences,
      scoring: scoring.config,
      metadata: {
        patternsVersion: patterns.version,
        sequencesVersion: sequences.version,
        scoringVersion: scoring.version,
        loadedAt: new Date(),
        patternCount,
        sequenceCount: compiledSequences.length,
        disabledPatternIds,
        disabledSequenceIds,
      },
    };

    console.log(
      `[RuleLoader] Loaded ${patternCount} patterns, ${compiledSequences.length} sequences ` +
        `(disabled: ${disabledPatternIds.length} patterns, ${disabledSequenceIds.length} sequences)`
    );
  }

  private loadPatterns(): {
    version: string;
    raw: Record<string, z.infer<typeof PatternEntrySchema>[]>;
  } {
    try {
      const filePath = resolve(this.rulesDir, 'patterns.json');
      const content = readFileSync(filePath, 'utf-8');
      const parsed = PatternsFileSchema.parse(JSON.parse(content));
      return { version: parsed.version, raw: parsed.patterns };
    } catch (err) {
      console.error('[RuleLoader] Failed to load patterns.json:', err);
      return { version: '0.0.0', raw: { critical: [], high: [], medium: [], low: [] } };
    }
  }

  private loadSequences(): {
    version: string;
    raw: z.infer<typeof SequenceEntrySchema>[];
  } {
    try {
      const filePath = resolve(this.rulesDir, 'sequences.json');
      const content = readFileSync(filePath, 'utf-8');
      const parsed = SequencesFileSchema.parse(JSON.parse(content));
      return { version: parsed.version, raw: parsed.sequences };
    } catch (err) {
      console.error('[RuleLoader] Failed to load sequences.json:', err);
      return { version: '0.0.0', raw: [] };
    }
  }

  private loadScoring(): { version: string; config: ScoringConfig } {
    try {
      const filePath = resolve(this.rulesDir, 'scoring.json');
      const content = readFileSync(filePath, 'utf-8');
      const parsed = ScoringFileSchema.parse(JSON.parse(content));
      return {
        version: parsed.version,
        config: {
          alertWeights: parsed.alertWeights,
          riskLevelOrder: parsed.riskLevelOrder,
          llmTierThreshold: parsed.llmTierThreshold,
          llmTiers: parsed.llmTiers,
          userRiskScoring: parsed.userRiskScoring,
        },
      };
    } catch (err) {
      console.error('[RuleLoader] Failed to load scoring.json:', err);
      return { version: '0.0.0', config: DEFAULT_SCORING };
    }
  }
}

export const ruleLoaderService = new RuleLoaderService();
