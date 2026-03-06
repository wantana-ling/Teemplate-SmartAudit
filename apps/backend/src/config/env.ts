import { config } from 'dotenv';
import { z } from 'zod';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from apps/backend/.env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('8080').transform(Number),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173'),

  // Supabase
  SUPABASE_PROJECT_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_API_KEY: z.string().startsWith('sb_publishable_'),
  SUPABASE_SECRET_KEY: z.string().startsWith('sb_secret_'),

  // OpenRouter
  OPENROUTER_API_KEY: z.string().startsWith('sk-or-v1-'),
  OPENROUTER_MODEL_SMALL: z.string().default('google/gemini-3-flash-preview'),
  OPENROUTER_MODEL_LARGE: z.string().default('google/gemini-3-pro-preview'),

  // Guacamole
  GUACD_HOST: z.string().default('localhost'),
  GUACD_PORT: z.string().default('4822').transform(Number),
  GUAC_RECORDING_PATH: z.string().default('/recordings'),

  // Security (required in production)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),

  // Optional
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  APP_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

export const env = validateEnv();

export function validateEnvOnStartup(log: (msg: string) => void): void {
  log('Environment variables validated');
  log(`  NODE_ENV: ${env.NODE_ENV}`);
  log(`  PORT: ${env.PORT}`);
  log(`  GUACD: ${env.GUACD_HOST}:${env.GUACD_PORT}`);
  log(`  Supabase: ${env.SUPABASE_PROJECT_URL}`);
  log(`  Recording path: ${env.GUAC_RECORDING_PATH}`);
}
