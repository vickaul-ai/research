import {NextResponse} from 'next/server';
import {passwordMatches, SESSION_COOKIE, sessionToken} from '@/lib/auth';

export async function POST(request: Request) {
  const password = process.env.APP_PASSWORD;
  const form = await request.formData();
  const candidate = String(form.get('password') ?? '');
  if (!password || !passwordMatches(candidate, password)) {
    return NextResponse.redirect(new URL('/login?error=1', request.url), 303);
  }
  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.cookies.set(SESSION_COOKIE, sessionToken(password), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90,
  });
  return response;
}
