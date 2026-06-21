import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { httpError } from './error.js';

/** Require a valid Bearer JWT. Sets req.userId on success. */
export function auth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(httpError(401, 'Authentication required'));

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    next(httpError(401, 'Invalid or expired token'));
  }
}

/** Sign a JWT for a user id. */
export function signToken(userId: string): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];
  return jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET as string, { expiresIn });
}
