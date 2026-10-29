import {NextRequest, NextResponse} from 'next/server';
import {SESSION_COOKIE, validSession} from './lib/auth';

// The cron route checks its own CRON_SECRET.
const OPEN = ['/login', '/api/login', '/api/cron/review-cards'];

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  const {pathname} = request.nextUrl;
  if (OPEN.includes(pathname)) return NextResponse.next();
  if (!password) {
    // Fail closed in production; allow local development without a password.
    if (process.env.NODE_ENV !== 'production') return NextResponse.next();
    return new NextResponse('APP_PASSWORD is not set', {status: 503});
  }
  if (validSession(request.cookies.get(SESSION_COOKIE)?.value, password)) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({error: 'Please sign in'}, {status: 401});
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
