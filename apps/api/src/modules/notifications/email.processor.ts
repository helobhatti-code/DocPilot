import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import * as nodemailer from 'nodemailer';
import { AppConfig } from '@/config/configuration';

export interface EmailJob {
  to: string;
  subject: string;
  body: string;
  tenantId: string;
  userId: string;
  type: string;
  entityId?: string;
}

@Processor('email')
@Injectable()
export class EmailProcessor implements OnModuleInit {
  private readonly logger = new Logger(EmailProcessor.name);
  private transporter: nodemailer.Transporter | null = null;
  private from!: string;
  private enabled = false;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    const smtp = this.config.get('smtp', { infer: true });
    this.from = smtp.from;

    if (!smtp.host || smtp.host === 'localhost') {
      this.logger.warn('SMTP host not configured — emails will be logged only');
      this.enabled = false;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: smtp.user && smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
    this.enabled = true;
    this.logger.log(`Email transport ready (${smtp.host}:${smtp.port})`);
  }

  /**
   * Send a single transactional email. Bull retries (3 attempts, exp backoff)
   * are configured at enqueue time; throwing here triggers the retry.
   */
  @Process('send')
  async send(job: Job<EmailJob>): Promise<{ ok: true; messageId?: string }> {
    const { to, subject, body, type, userId } = job.data;

    if (!this.enabled || !this.transporter) {
      this.logger.log(`[dry-run] would send ${type} to ${to} (user ${userId})`);
      return { ok: true };
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text: body,
      });
      this.logger.debug(`Sent ${type} to ${to} (${info.messageId})`);
      return { ok: true, messageId: info.messageId };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(
        `Email send failed (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1}): ${msg}`,
      );
      throw e;
    }
  }
}
