import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as express from 'express';
import * as path from 'path';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { logger } from './common/logger/logger';
import { seedOnStart } from './seed-on-start';

async function bootstrap() {
  await seedOnStart();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<AppConfig, true>);

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  const corsOrigin = process.env.CORS_ORIGIN ?? '*';
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  });
  app.setGlobalPrefix(config.get('apiPrefix', { infer: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const uploadDir = path.resolve(config.get('uploadDir', { infer: true }));
  app.use('/uploads', express.static(uploadDir));

  const swaggerCfg = new DocumentBuilder()
    .setTitle('DocPilot API')
    .setDescription('DocPilot — Document & Compliance Operations — multi-tenant SaaS')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('users')
    .addTag('tenants')
    .addTag('subcontractor-orgs')
    .addTag('staff')
    .addTag('gate-passes')
    .addTag('uploads')
    .addTag('role-permissions')
    .addTag('notifications')
    .addTag('reference')
    .build();
  const doc = SwaggerModule.createDocument(app, swaggerCfg);
  SwaggerModule.setup('docs', app, doc);

  const port = config.get('port', { infer: true });
  await app.listen(port);
  logger.info({ port, env: config.get('env', { infer: true }) }, 'DocPilot API running');
}

bootstrap().catch((e) => {
  logger.error(e, 'Bootstrap failed');
  process.exit(1);
});
