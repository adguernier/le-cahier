import "~/lib/env.server";
import bcrypt from "bcryptjs";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Attempt = { count: number; firstAt: number };
const attempts = new Map<string, Attempt>();

export function verifyPassword(plain: string): boolean {
  const hash = process.env.HOUSEHOLD_PASSWORD_HASH;
  if (!hash) return false;
  return bcrypt.compareSync(plain, hash);
}

export function isRateLimited(ip: string): boolean {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function recordLoginAttempt(ip: string): void {
  const entry = attempts.get(ip);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function resetRateLimit(ip?: string): void {
  if (ip) attempts.delete(ip);
  else attempts.clear();
}
