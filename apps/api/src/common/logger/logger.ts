import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
  redact: {
    paths: ['req.headers.authorization', '*.password', '*.passwordHash', '*.token', '*.refreshToken'],
    censor: '[REDACTED]',
  },
});
