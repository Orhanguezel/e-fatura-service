import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(8210),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional().or(z.literal("")),
  WORKER_ENABLED: z.coerce.boolean().default(true),
  EFATURA_ENC_KEY: z.string().min(1),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().min(1).default("1 minute"),
  EFATURA_DEV_TENANT_API_KEY: z.string().optional(),
  EFATURA_DEV_INTEGRATOR_CREDENTIALS: z.string().default("{}"),
  EFATURA_DEV_WEBHOOK_SECRET: z.string().optional(),
  EFATURA_NILVERA_MOCK: z.coerce.boolean().default(false)
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
