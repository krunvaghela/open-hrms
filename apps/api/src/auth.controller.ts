import {
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  AllowPasswordChange,
  AuthRequest,
  AuthService,
  Public,
  clearSession,
  sessionToken,
} from './auth';
import { DatabaseService } from './database.service';
import { hashPassword, tokenHash, verifyPassword } from './security';
import { companySchema, email, name, parse, password } from './validation';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Get('setup')
  async setupState() {
    return (await this.db.query('SELECT EXISTS(SELECT 1 FROM company) AS configured')).rows[0];
  }

  @Public()
  @Post('setup')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async setup(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = parse(z.object({ company: companySchema, name, email, password }).strict(), body);
    const hashed = await hashPassword(input.password);
    const id = randomUUID();
    await this.db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(427002)');
      if ((await client.query('SELECT id FROM company')).rowCount)
        throw new ConflictException('Your workspace is already set up. Please sign in.');
      await client.query(
        'INSERT INTO company (id,name,state,city,address,timezone) VALUES (1,$1,$2,$3,$4,$5)',
        [
          input.company.name,
          input.company.state,
          input.company.city,
          input.company.address,
          input.company.timezone,
        ],
      );
      await client.query(
        "INSERT INTO users (id,name,email,password_hash,role) VALUES ($1,$2,$3,$4,'SUPER_ADMIN')",
        [id, input.name, input.email, hashed],
      );
      await client.query(
        "INSERT INTO employees (id,designation,department,joining_date) VALUES ($1,'Workspace owner','Management',CURRENT_DATE)",
        [id],
      );
      await client.query(
        "INSERT INTO audit_log (actor_id,action,target_id) VALUES ($1,'workspace.created','1')",
        [id],
      );
    });
    await this.auth.start(id, response);
    return { ok: true };
  }

  @Public()
  @Post('login')
  @Throttle({
    default: {
      limit: 10,
      ttl: 60000,
      getTracker: (request) =>
        tokenHash(
          String(request.body?.email ?? '')
            .trim()
            .toLowerCase()
            .slice(0, 254),
        ),
    },
  })
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = parse(z.object({ email, password: z.string().min(1).max(128) }).strict(), body);
    const { rows } = await this.db.query(
      'SELECT id,password_hash,active FROM users WHERE email = $1',
      [input.email],
    );
    const valid = rows[0]
      ? await verifyPassword(input.password, rows[0].password_hash)
      : (await hashPassword(input.password), false);
    if (!valid || !rows[0]?.active)
      throw new UnauthorizedException('Email or password is incorrect');
    await this.auth.start(rows[0].id, response);
    return { ok: true };
  }

  @AllowPasswordChange()
  @Get('me')
  async me(@Req() request: AuthRequest) {
    return {
      user: request.user,
      company: (await this.db.query('SELECT * FROM company WHERE id = 1')).rows[0],
    };
  }

  @AllowPasswordChange()
  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [
      tokenHash(sessionToken(request)),
    ]);
    clearSession(response);
    return { ok: true };
  }

  @AllowPasswordChange()
  @Post('password')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async changePassword(
    @Req() request: AuthRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = parse(
      z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict(),
      body,
    );
    const user = (
      await this.db.query('SELECT password_hash FROM users WHERE id = $1', [request.user.id])
    ).rows[0];
    if (!(await verifyPassword(input.currentPassword, user.password_hash)))
      throw new UnauthorizedException('Your current password is incorrect');
    if (input.currentPassword === input.newPassword)
      throw new ConflictException('Choose a different password');
    const hashed = await hashPassword(input.newPassword);
    await this.db.transaction(async (client) => {
      await client.query(
        'UPDATE users SET password_hash=$1,must_change_password=false WHERE id=$2',
        [hashed, request.user.id],
      );
      await client.query('DELETE FROM sessions WHERE user_id=$1', [request.user.id]);
      await client.query(
        "INSERT INTO audit_log (actor_id,action,target_id) VALUES ($1,'password.changed',$2)",
        [request.user.id, request.user.id],
      );
    });
    await this.auth.start(request.user.id, response);
    return { ok: true };
  }
}
