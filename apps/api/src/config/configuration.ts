export interface AppConfig {
  env: string;
  port: number;
  apiPrefix: string;
  publicBaseUrl: string;
  uploadDir: string;
  maxFileSizeBytes: number;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
  redis: {
    url?: string;
    host: string;
    port: number;
    password?: string;
  };
  smtp: {
    host: string;
    port: number;
    user?: string;
    pass?: string;
    from: string;
  };
  seed: {
    tenantName: string;
    adminEmail: string;
    adminPassword: string;
  };
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES ?? '2097152', 10),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  redis: {
    // REDIS_URL (e.g. redis://… or rediss://…) takes precedence over host/port/password.
    // Managed Redis providers (Render, Upstash, Heroku) typically expose the URL form.
    url: process.env.REDIS_URL || undefined,
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  smtp: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from: process.env.SMTP_FROM ?? 'no-reply@docpilot.local',
  },
  seed: {
    tenantName: process.env.SEED_TENANT_NAME ?? 'UpTown Technical Service LLC',
    adminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@docpilot.com',
    adminPassword: process.env.SEED_ADMIN_PASSWORD ?? '123@gpms',
  },
});
