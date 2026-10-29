// Single-user login. The session cookie is an HMAC of a fixed label keyed by
// APP_PASSWORD, so changing the password signs everyone out.
import {createHmac, timingSafeEqual} from 'node:crypto';

export const SESSION_COOKIE = 'research_session';

export function sessionToken(password: string): string {
  return createHmac('sha256', password).update('research-session-v1').digest('base64url');
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordMatches(candidate: string, password: string): boolean {
  return same(sessionToken(candidate), sessionToken(password));
}

export function validSession(cookie: string | undefined, password: string): boolean {
  return !!cookie && same(cookie, sessionToken(password));
}
