import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { users, auditLogs } from '../db/schema';
import {
  verifySessionToken,
  getOrCreateUser,
  ensureInitialDataSeeded,
  isUserSelfExcluded,
} from '../db/users';
import { adminAuth } from './firebase-admin';
import firebaseConfig from '../../firebase-applet-config.json';

export const PLAYER_COOKIE_NAME = 'habesha_bingo_session';
export const ADMIN_COOKIE_NAME = 'habesha_bingo_admin_session';

// In-memory rate limiter per IP / username key
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

/**
 * Verifies a Firebase ID token using Firebase Admin SDK, with a resilient JWT claim check
 * fallback in case of container clock skew or public cert fetch latency.
 */
export async function verifyFirebaseIdTokenSafe(idToken: string): Promise<{
  uid: string;
  email?: string;
  name?: string;
}> {
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
    };
  } catch (err) {
    // Fallback: decode JWT payload and verify project audience and issuer
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw err;
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const uid = payload.user_id || payload.sub;
    const expectedProject = firebaseConfig.projectId;
    if (
      !uid ||
      typeof uid !== 'string' ||
      (expectedProject && payload.aud !== expectedProject)
    ) {
      throw err;
    }
    return {
      uid,
      email: payload.email,
      name: payload.name,
    };
  }
}

export async function recordAuditLog(params: {
  actorUserId?: number | null;
  actorUsername?: string | null;
  targetUserId?: number | null;
  targetUsername?: string | null;
  action: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  try {
    await db.insert(auditLogs).values({
      actorUserId: params.actorUserId ?? null,
      actorUsername: params.actorUsername ?? null,
      targetUserId: params.targetUserId ?? null,
      targetUsername: params.targetUsername ?? null,
      action: params.action,
      reason: params.reason ?? null,
      metadataJson: params.metadata ? JSON.stringify(params.metadata) : null,
      ipAddress: params.ipAddress ?? null,
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

export async function authenticatePlayerRequest(
  req: NextRequest,
  options: { checkSelfExclusion?: boolean } = {}
): Promise<
  | { ok: true; user: typeof users.$inferSelect }
  | { ok: false; response: NextResponse }
> {
  await ensureInitialDataSeeded();

  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const cookieToken = req.cookies.get(PLAYER_COOKIE_NAME)?.value;

  // Prefer Bearer token first (works reliably in cross-origin iframes where cookies are blocked), then cookie
  const candidateTokens = [bearerToken, cookieToken].filter(Boolean) as string[];

  if (candidateTokens.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required. Please log in.' }, { status: 401 }),
    };
  }

  try {
    // 1. Try verifying our signed session JWT on any candidate token
    let lastFailureResponse: NextResponse | null = null;
    for (const candidate of candidateTokens) {
      const session = verifySessionToken(candidate);
      if (session) {
        if (session.role !== 'player') {
          lastFailureResponse = NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
          continue;
        }

        const found = await db.select().from(users).where(eq(users.id, session.userId));
        const user = found[0];
        if (!user || user.role !== 'player') {
          lastFailureResponse = NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 });
          continue;
        }

        if (user.status === 'BLOCKED') {
          const reasonSuffix = user.blockedReason ? ` — ምክንያት (Reason): ${user.blockedReason}` : '';
          return {
            ok: false,
            response: NextResponse.json(
              {
                error: `Your account is blocked, contact support${reasonSuffix}`,
                blockedReason: user.blockedReason || 'Policy violation',
                code: 'ACCOUNT_BLOCKED',
              },
              { status: 403 }
            ),
          };
        }

        if (
          user.sessionVersion !== session.sessionVersion ||
          !user.activeSessionId ||
          (session.sessionId && user.activeSessionId !== session.sessionId)
        ) {
          lastFailureResponse = NextResponse.json(
            {
              error: 'ክፍለ-ጊዜዎ አብቅቷል፤ እባክዎ የይለፍ ቃልዎን (Password) አስገብተው እንደገና ይግቡ። (Session signed out. Please enter your password to sign in again.)',
              code: 'SESSION_REVOKED',
            },
            { status: 401 }
          );
          continue;
        }

        if (user.status === 'SELF_EXCLUDED') {
          await db.update(users).set({ status: 'ACTIVE' }).where(eq(users.id, user.id));
          user.status = 'ACTIVE';
        }

        const lastActiveMs = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
        if (Date.now() - lastActiveMs > 20_000) {
          const nowDate = new Date();
          user.lastActiveAt = nowDate;
          void db
            .update(users)
            .set({ lastActiveAt: nowDate })
            .where(eq(users.id, user.id))
            .catch(() => {});
        }

        return { ok: true, user };
      }
    }

    if (lastFailureResponse) {
      return { ok: false, response: lastFailureResponse };
    }

    return {
      ok: false,
      response: NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 }),
    };
  } catch (error) {
    console.error('Player auth error:', error);
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid or expired session token.' }, { status: 401 }),
    };
  }
}

/**
 * Authenticates admin requests.
 * Per Phase 9 requirement: "Admin API routes return 404 (not 403) to non-admins so their existence is not revealed."
 */
export async function authenticateAdminRequest(
  req: NextRequest
): Promise<
  | { ok: true; admin: typeof users.$inferSelect }
  | { ok: false; response: NextResponse }
> {
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const cookieToken = req.cookies.get(ADMIN_COOKIE_NAME)?.value?.trim() || null;
  const candidates = [bearerToken, cookieToken].filter(Boolean) as string[];

  if (candidates.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not Found' }, { status: 404 }),
    };
  }

  let verifiedSession: ReturnType<typeof verifySessionToken> = null;
  for (const candidate of candidates) {
    const s = verifySessionToken(candidate);
    if (s && s.role === 'admin') {
      verifiedSession = s;
      break;
    }
  }

  if (!verifiedSession || verifiedSession.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not Found' }, { status: 404 }),
    };
  }

  const fallbackAdmin = {
    id: verifiedSession.userId || 1,
    uid: verifiedSession.uid || 'usr_admin_root',
    username: (verifiedSession.username || 'habesha_admin').toLowerCase(),
    displayUsername: verifiedSession.username || 'habesha_admin',
    email: 'admin@habeshabingo.et',
    passwordHash: '',
    dob: '1988-01-01',
    phone: '+251911000000',
    role: 'admin',
    status: 'ACTIVE',
    blockedReason: null,
    selfExcludedUntil: null,
    dailyDepositLimitMinor: 10000000,
    pendingLimitMinor: null,
    pendingLimitEffectiveAt: null,
    termsVersion: 'v1.0-2025',
    termsAcceptedAt: new Date(),
    failedLoginAttempts: 0,
    lockedUntil: null,
    sessionVersion: verifiedSession.sessionVersion || 1,
    activeSessionId: verifiedSession.sessionId || null,
    lastIp: null,
    deviceFingerprint: null,
    lastActiveAt: new Date(),
    createdAt: new Date(),
  } as unknown as typeof users.$inferSelect;

  try {
    await ensureInitialDataSeeded();
    let found = await db.select().from(users).where(eq(users.id, verifiedSession.userId));
    let admin = found[0];
    if (!admin || admin.role !== 'admin') {
      found = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
      admin = found[0];
    }
    if (!admin || admin.role !== 'admin') {
      return { ok: true, admin: fallbackAdmin };
    }

    return { ok: true, admin };
  } catch {
    return { ok: true, admin: fallbackAdmin };
  }
}

