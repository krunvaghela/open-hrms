import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from './database.service';
import { tokenHash } from './security';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'EMPLOYEE';
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
};
export type AuthRequest = Request & { user: User };
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const AllowPasswordChange = () => SetMetadata('allowPasswordChange', true);
const cookieName = 'hrms_session';
export function sessionToken(request: Request): string {
  return (
    request.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) ?? ''
  );
}
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.APP_ORIGIN?.startsWith('https://') ?? false,
    path: '/',
  };
}
export function clearSession(response: Response) {
  response.clearCookie(cookieName, cookieOptions());
}

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}
  async start(userId: string, response: Response) {
    const token = randomBytes(32).toString('hex');
    await this.db.query('DELETE FROM sessions WHERE expires_at < now()');
    await this.db.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '8 hours')",
      [tokenHash(token), userId],
    );
    response.cookie(cookieName, token, { ...cookieOptions(), maxAge: 8 * 60 * 60 * 1000 });
  }
}

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.headers['x-hrms-request'] !== '1')
        throw new ForbiddenException('Missing request protection header');
      if (request.headers.origin && request.headers.origin !== process.env.APP_ORIGIN)
        throw new ForbiddenException('Untrusted request origin');
    }
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('public', targets)) return true;
    const token = sessionToken(request);
    if (!/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException('Please sign in');
    const { rows } = await this.db.query(
      `SELECT u.id, u.name, u.email, u.role, u.must_change_password AS "mustChangePassword"
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active = true`,
      [tokenHash(token)],
    );
    if (!rows[0])
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    request.user = rows[0];
    if (
      request.user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>('allowPasswordChange', targets)
    )
      throw new ForbiddenException('Change your temporary password before continuing');
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', targets);
    if (roles && !roles.includes(request.user.role))
      throw new ForbiddenException('You do not have access to this action');
    return true;
  }
}
