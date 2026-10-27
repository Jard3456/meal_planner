import type { RequestHandler } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { config } from './config.js';
import { HttpError } from './errors.js';

const key = new TextEncoder().encode(config.jwtSecret);
const issuer = 'meal-planner-api';
const audience = 'meal-planner-mobile';

export async function createToken(userId: number) {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(String(userId))
    .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('8h').sign(key);
}

export const requireUser: RequestHandler = async (req, res, next) => {
  const value = req.headers.authorization;
  if (!value?.startsWith('Bearer ')) return next(new HttpError(401, 'Inicia sesión para continuar.'));
  try {
    const { payload } = await jwtVerify(value.slice(7), key, { algorithms: ['HS256'], issuer, audience });
    const id = Number(payload.sub);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Subject invalido');
    res.locals.userId = id;
    next();
  } catch {
    next(new HttpError(401, 'Tu sesión venció. Inicia sesión de nuevo.'));
  }
};
