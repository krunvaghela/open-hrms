import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { AuthRequest, Roles } from './auth';
import { DatabaseService } from './database.service';
import { decrypt, encrypt } from './security';
import { companySchema, email, name, parse } from './validation';

const smtpSchema = z
  .object({
    host: z
      .string()
      .trim()
      .min(1)
      .max(253)
      .regex(/^[a-zA-Z0-9.-]+$/, 'Enter a hostname'),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    username: z.string().trim().max(254),
    password: z.string().max(1000).optional(),
    clearPassword: z.boolean().default(false),
    fromName: name,
    fromEmail: email,
  })
  .strict();

@Controller('settings')
@Roles('SUPER_ADMIN')
export class SettingsController {
  constructor(private readonly db: DatabaseService) {}

  @Put('company')
  async company(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = parse(companySchema, body);
    await this.db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(427010)');
      await client.query(
        'UPDATE company SET name=$1,state=$2,city=$3,address=$4,timezone=$5 WHERE id=1',
        [input.name, input.state, input.city, input.address, input.timezone],
      );
      await client.query(
        "INSERT INTO audit_log (actor_id,action,target_id) VALUES ($1,'company.updated','1')",
        [request.user.id],
      );
    });
    return { ok: true };
  }

  @Get('email')
  async email() {
    return (
      (
        await this.db
          .query(`SELECT host,port,secure,username,from_name AS "fromName",from_email AS "fromEmail",
      (password_encrypted IS NOT NULL) AS "hasPassword" FROM email_settings WHERE id=1`)
      ).rows[0] ?? null
    );
  }

  @Put('email')
  async saveEmail(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = parse(smtpSchema, body);
    await this.db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(427010)');
      await client.query('SELECT pg_advisory_xact_lock(427005)');
      const existing = (
        await client.query('SELECT password_encrypted FROM email_settings WHERE id=1')
      ).rows[0];
      const secret = input.clearPassword
        ? null
        : input.password
          ? encrypt(input.password)
          : (existing?.password_encrypted ?? null);
      await client.query(
        `INSERT INTO email_settings (id,host,port,secure,username,password_encrypted,from_name,from_email)
        VALUES (1,$1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET host=$1,port=$2,secure=$3,username=$4,password_encrypted=$5,from_name=$6,from_email=$7,updated_at=now()`,
        [
          input.host,
          input.port,
          input.secure,
          input.username,
          secret,
          input.fromName,
          input.fromEmail,
        ],
      );
      await client.query(
        "INSERT INTO audit_log (actor_id,action,target_id) VALUES ($1,'email.configured','1')",
        [request.user.id],
      );
    });
    return { ok: true };
  }

  @Post('email/test')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async testEmail(@Req() request: AuthRequest) {
    const settings = (await this.db.query('SELECT * FROM email_settings WHERE id=1')).rows[0];
    if (!settings) throw new BadRequestException('Save email settings first');
    const transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: !settings.secure,
      auth: settings.username
        ? {
            user: settings.username,
            pass: settings.password_encrypted ? decrypt(settings.password_encrypted) : '',
          }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    try {
      await transport.sendMail({
        from: { name: settings.from_name, address: settings.from_email },
        to: request.user.email,
        subject: 'Open HRMS — email connection successful',
        text: 'Your Open HRMS email provider is connected. This test was requested from your workspace settings.',
      });
    } catch {
      throw new ServiceUnavailableException(
        'Could not send the test email. Check the SMTP host, port, TLS mode, credentials, and sender permissions.',
      );
    } finally {
      transport.close();
    }
    await this.db.query(
      "INSERT INTO audit_log (actor_id,action,target_id) VALUES ($1,'email.test_sent','1')",
      [request.user.id],
    );
    return { ok: true, recipient: request.user.email };
  }
}
