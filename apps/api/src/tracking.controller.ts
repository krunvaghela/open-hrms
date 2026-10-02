import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest, Public } from './auth';
import { tokenHash } from './security';
import { parse } from './validation';
import { dateSchema } from './workforce-domain';
import { WorkforceService } from './workforce.service';
@Controller('tracking')
export class TrackingController implements OnModuleInit, OnApplicationShutdown {
  private cleanup?: ReturnType<typeof setInterval>;
  constructor(private readonly w: WorkforceService) {}
  onModuleInit() {
    this.cleanup = setInterval(() => void this.purge().catch(() => {}), 3600000);
    this.cleanup.unref();
    void this.purge().catch(() => {});
  }
  onApplicationShutdown() {
    if (this.cleanup) clearInterval(this.cleanup);
  }
  private async purge() {
    const p = await this.w.policy();
    await this.w.db.query(
      "DELETE FROM tracker_samples WHERE captured_at < now()-($1 * interval '1 day')",
      [p.retentionDays],
    );
    await this.w.db.query('DELETE FROM tracker_devices WHERE expires_at < now()');
  }
  @Get('devices') async devices(@Req() req: AuthRequest) {
    return (
      await this.w.db.query(
        'SELECT id,name,expires_at AS "expiresAt",(token_hash IS NOT NULL) AS paired FROM tracker_devices WHERE employee_id=$1 AND expires_at>now() ORDER BY created_at DESC',
        [req.user.id],
      )
    ).rows;
  }
  @Post('pair') async pair(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = parse(z.object({ name: z.string().trim().min(2).max(80) }).strict(), body);
    return this.w.write(async (c) => {
      if (!(await this.w.policy(c)).trackingEnabled)
        throw new ForbiddenException(
          'An administrator must enable desktop tracking in HR policies',
        );
      if (
        (
          await c.query(
            'SELECT id FROM tracker_devices WHERE employee_id=$1 AND expires_at>now()',
            [req.user.id],
          )
        ).rowCount! >= 5
      )
        throw new ConflictException('Revoke an existing device before pairing another (maximum 5)');
      const code = randomBytes(32).toString('hex'),
        id = randomUUID();
      await c.query(
        "INSERT INTO tracker_devices(id,employee_id,name,pair_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",
        [id, req.user.id, input.name, tokenHash(code)],
      );
      await this.w.audit(c, req.user.id, 'tracking.pair_created', id);
      return { code, expiresInMinutes: 5 };
    });
  }
  @Public() @Post('redeem') async redeem(@Body() body: unknown) {
    const { code } = parse(z.object({ code: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), body);
    return this.w.write(async (c) => {
      const device = (
        await c.query(
          `SELECT d.id,u.id AS employee_id,u.name FROM tracker_devices d JOIN users u ON u.id=d.employee_id
        WHERE pair_hash=$1 AND expires_at>now() AND u.active=true AND u.must_change_password=false`,
          [tokenHash(code)],
        )
      ).rows[0];
      if (!device) throw new ForbiddenException('Pairing code is invalid or expired');
      if (!(await this.w.policy(c)).trackingEnabled)
        throw new ForbiddenException('Tracking is disabled');
      const token = randomBytes(32).toString('hex');
      await c.query(
        "UPDATE tracker_devices SET token_hash=$2,pair_hash=NULL,expires_at=now()+interval '7 days' WHERE id=$1",
        [device.id, tokenHash(token)],
      );
      await this.w.audit(c, device.employee_id, 'tracking.paired', device.id);
      return { token, name: device.name };
    });
  }
  @Delete('devices/:id') async revoke(@Req() req: AuthRequest, @Param('id') raw: string) {
    const id = parse(z.uuid(), raw);
    return this.w.write(async (c) => {
      const result = await c.query('DELETE FROM tracker_devices WHERE id=$1 AND employee_id=$2', [
        id,
        req.user.id,
      ]);
      if (!result.rowCount) throw new NotFoundException();
      await this.w.audit(c, req.user.id, 'tracking.revoked', id);
      return { ok: true };
    });
  }
  @Get('device/config') async config(@Req() req: AuthRequest) {
    const p = await this.w.policy();
    const open = (
      await this.w.db.query(
        "SELECT day::text FROM attendance WHERE employee_id=$1 AND check_out IS NULL AND check_in>now()-interval '24 hours'",
        [req.user.id],
      )
    ).rows[0];
    return {
      enabled: p.trackingEnabled,
      screenshotsEnabled: p.screenshotsEnabled,
      intervalMinutes: p.screenshotIntervalMinutes,
      retentionDays: p.retentionDays,
      checkedIn: !!open,
      name: req.user.name,
    };
  }
  @Post('device/sample') async sample(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = parse(
      z
        .object({
          id: z.uuid(),
          activeSeconds: z.number().int().min(0).max(30),
          screenshot: z.string().max(220000).optional(),
        })
        .strict(),
      body,
    );
    return this.w.write(async (c) => {
      const p = await this.w.policy(c);
      if (!p.trackingEnabled) throw new ForbiddenException('Tracking is disabled');
      if (
        !(
          await c.query(
            "SELECT day FROM attendance WHERE employee_id=$1 AND check_out IS NULL AND check_in>now()-interval '24 hours'",
            [req.user.id],
          )
        ).rowCount
      )
        throw new ConflictException('Check in on the web portal before starting tracking');
      const token = req.headers.authorization?.slice(7);
      const device = token
        ? (
            await c.query(
              'SELECT id FROM tracker_devices WHERE token_hash=$1 AND expires_at>now()',
              [tokenHash(token)],
            )
          ).rows[0]
        : null;
      if (!device) throw new ForbiddenException('Use a paired desktop device');
      if ((await c.query('SELECT id FROM tracker_samples WHERE id=$1', [input.id])).rowCount)
        return { ok: true };
      if (
        (
          await c.query(
            "SELECT id FROM tracker_samples WHERE employee_id=$1 AND captured_at>now()-interval '25 seconds'",
            [req.user.id],
          )
        ).rowCount
      )
        throw new ConflictException('Only one active tracker may send a sample every 30 seconds');
      let shot: Buffer | null = null;
      if (input.screenshot) {
        if (!p.screenshotsEnabled) throw new ForbiddenException('Screenshots are disabled');
        if (
          (
            await c.query(
              "SELECT id FROM tracker_samples WHERE employee_id=$1 AND screenshot IS NOT NULL AND captured_at>now()-($2 * interval '1 minute')",
              [req.user.id, p.screenshotIntervalMinutes],
            )
          ).rowCount
        )
          throw new ConflictException('Screenshot interval has not elapsed');
        shot = Buffer.from(input.screenshot, 'base64');
        if (
          shot.length > 160000 ||
          shot.length < 4 ||
          shot[0] !== 255 ||
          shot[1] !== 216 ||
          shot.at(-2) !== 255 ||
          shot.at(-1) !== 217
        )
          throw new BadRequestException('Expected a JPEG screenshot up to 160 KB');
      }
      await c.query(
        'INSERT INTO tracker_samples(id,employee_id,device_id,active_seconds,screenshot) VALUES($1,$2,$3,$4,$5)',
        [input.id, req.user.id, device.id, input.activeSeconds, shot],
      );
      return { ok: true };
    });
  }
  @Get('report') async report(@Req() req: AuthRequest, @Query('day') raw: string) {
    const day = parse(dateSchema, raw),
      p = await this.w.policy(),
      company = await this.w.company(),
      own = req.user.role === 'EMPLOYEE' ? req.user.id : null;
    const rows = (
      await this.w.db.query(
        `SELECT s.employee_id AS "employeeId",u.name,count(*)::int*30 AS "observedSeconds",sum(s.active_seconds)::int AS "activeSeconds",count(s.screenshot)::int AS screenshots
      FROM tracker_samples s JOIN users u ON u.id=s.employee_id WHERE (s.captured_at AT TIME ZONE $2)::date=$1::date AND ($3::uuid IS NULL OR s.employee_id=$3)
      AND s.captured_at>now()-($4 * interval '1 day') GROUP BY s.employee_id,u.name ORDER BY u.name`,
        [day, company.timezone, own, p.retentionDays],
      )
    ).rows;
    const screenshots = p.screenshotsEnabled
      ? (
          await this.w.db.query(
            `SELECT s.id,u.name,s.captured_at AS "capturedAt" FROM tracker_samples s JOIN users u ON u.id=s.employee_id
      WHERE (s.captured_at AT TIME ZONE $2)::date=$1::date AND ($3::uuid IS NULL OR s.employee_id=$3) AND s.screenshot IS NOT NULL
      AND s.captured_at>now()-($4 * interval '1 day') ORDER BY s.captured_at DESC LIMIT 100`,
            [day, company.timezone, own, p.retentionDays],
          )
        ).rows
      : [];
    return { rows, screenshots, policy: p };
  }
  @Get('screenshots/:id') async screenshot(
    @Req() req: AuthRequest,
    @Param('id') raw: string,
    @Res() res: Response,
  ) {
    const id = parse(z.uuid(), raw),
      p = await this.w.policy();
    if (!p.screenshotsEnabled) throw new NotFoundException();
    const row = (
      await this.w.db.query(
        "SELECT screenshot FROM tracker_samples WHERE id=$1 AND ($2::uuid IS NULL OR employee_id=$2) AND captured_at>now()-($3 * interval '1 day')",
        [id, req.user.role === 'EMPLOYEE' ? req.user.id : null, p.retentionDays],
      )
    ).rows[0];
    if (!row?.screenshot) throw new NotFoundException();
    res.type('image/jpeg').send(row.screenshot);
  }
}
