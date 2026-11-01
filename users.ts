import crypto from 'crypto';
import { eq, and, gte, sql } from 'drizzle-orm';
import { db, pool } from './index';
import {
  users,
  wallets,
  rooms,
  systemSettings,
  selfExclusions,
  tickets,
  payouts,
  ledgerEntries,
  notifications,
  deposits,
  withdrawals,
} from './schema';

const SESSION_SECRET = process.env.SESSION_SECRET || 'habesha-bingo-provably-fair-hmac-secret-2026';
export const WELCOME_BONUS_MINOR = 2000; // 20.00 ETB Welcome Bonus for newly registered players

export function hashPassword(plainPassword: string, markAsUserSet = false): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  return `${markAsUserSet ? 'scrypt_set' : 'scrypt'}$${salt}$${derived}`;
}

const verifiedPasswordCache = new Map<string, string>();

export function invalidatePasswordVerificationCache(storedHash?: string): void {
  if (!storedHash) {
    verifiedPasswordCache.clear();
    return;
  }
  for (const [cacheKey, cachedHash] of verifiedPasswordCache.entries()) {
    if (cachedHash === storedHash) {
      verifiedPasswordCache.delete(cacheKey);
    }
  }
}

function verifySinglePassword(plainPassword: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 3 || (parts[0] !== 'scrypt' && parts[0] !== 'scrypt_set')) return false;
    const cacheKey = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(`${plainPassword}:${storedHash}`)
      .digest('hex');
    if (verifiedPasswordCache.get(cacheKey) === storedHash) {
      return true;
    }
    const [, salt, hashHex] = parts;
    const derived = crypto.scryptSync(plainPassword, salt, 64);
    const expected = Buffer.from(hashHex, 'hex');
    if (derived.length !== expected.length) return false;
    const isMatch = crypto.timingSafeEqual(derived, expected);
    if (isMatch) {
      if (verifiedPasswordCache.size > 1000) {
        verifiedPasswordCache.clear();
      }
      verifiedPasswordCache.set(cacheKey, storedHash);
    }
    return isMatch;
  } catch {
    return false;
  }
}

export function verifyPassword(plainPassword: string, storedHash: string): boolean {
  if (verifySinglePassword(plainPassword, storedHash)) {
    return true;
  }
  const trimmed = plainPassword.trim();
  if (trimmed && trimmed !== plainPassword) {
    return verifySinglePassword(trimmed, storedHash);
  }
  return false;
}

export function isAdult18Plus(dobString: string, now: Date = new Date()): boolean {
  const parsed = new Date(`${dobString}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  let age = now.getUTCFullYear() - parsed.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - parsed.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < parsed.getUTCDate())) {
    age -= 1;
  }
  return age >= 18 && age <= 120;
}

export interface SessionPayload {
  userId: number;
  uid: string;
  username: string;
  role: 'player' | 'admin';
  sessionVersion: number;
  sessionId: string;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>, ttlSeconds = 3600 * 24 * 7): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Automatically creates all tables defined in src/db/schema.ts if they do not exist yet
 * (e.g., on first request against a fresh Vercel Postgres / Neon database).
 * Skips DDL completely if tables already exist or if connected as a restricted DML-only role.
 */
async function ensureSchemaTablesExist(): Promise<void> {
  try {
    // Fast check: if the `users` table already exists, skip all DDL statements
    await pool.query('SELECT 1 FROM users LIMIT 1');
    return;
  } catch {
    // Table does not exist yet (e.g. fresh DATABASE_URL on Vercel/Neon); proceed to create tables
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        uid TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        display_username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        phone TEXT,
        dob TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'player',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        blocked_reason TEXT,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMP,
        session_version INTEGER NOT NULL DEFAULT 1,
        active_session_id TEXT,
        last_ip TEXT,
        device_fingerprint TEXT,
        terms_accepted_at TIMESTAMP NOT NULL DEFAULT NOW(),
        terms_version TEXT NOT NULL DEFAULT '1.0',
        daily_deposit_limit_minor INTEGER NOT NULL DEFAULT 500000,
        pending_limit_minor INTEGER,
        pending_limit_effective_at TIMESTAMP,
        last_active_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );


    CREATE TABLE IF NOT EXISTS wallets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      balance_minor INTEGER NOT NULL DEFAULT 2000,
      locked_minor INTEGER NOT NULL DEFAULT 0,
      play_balance_minor INTEGER NOT NULL DEFAULT 100000,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      locked_delta_minor INTEGER NOT NULL DEFAULT 0,
      balance_after_minor INTEGER NOT NULL,
      locked_after_minor INTEGER NOT NULL DEFAULT 0,
      idempotency_key TEXT NOT NULL UNIQUE,
      reference_id TEXT,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name_en TEXT NOT NULL,
      name_am TEXT NOT NULL,
      ticket_price_minor INTEGER NOT NULL,
      pattern TEXT NOT NULL DEFAULT 'ANY_LINE',
      min_players INTEGER NOT NULL DEFAULT 2,
      min_cards_per_player INTEGER NOT NULL DEFAULT 1,
      max_cards_per_player INTEGER NOT NULL DEFAULT 4,
      house_fee_bps INTEGER NOT NULL DEFAULT 2300,
      draw_interval_seconds INTEGER NOT NULL DEFAULT 3,
      cadence_seconds INTEGER NOT NULL DEFAULT 90,
      is_practice BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id SERIAL PRIMARY KEY,
      room_id INTEGER NOT NULL REFERENCES rooms(id),
      status TEXT NOT NULL DEFAULT 'OPEN',
      starts_at TIMESTAMP NOT NULL,
      server_seed TEXT NOT NULL,
      server_seed_hash TEXT NOT NULL,
      draw_sequence_json TEXT NOT NULL,
      drawn_count INTEGER NOT NULL DEFAULT 0,
      last_draw_at TIMESTAMP,
      pot_minor INTEGER NOT NULL DEFAULT 0,
      house_fee_minor INTEGER NOT NULL DEFAULT 0,
      prize_minor INTEGER NOT NULL DEFAULT 0,
      winning_pattern TEXT NOT NULL DEFAULT 'ANY_LINE',
      winner_user_ids_json TEXT NOT NULL DEFAULT '[]',
      cancel_reason TEXT,
      settled_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS round_draws (
      id SERIAL PRIMARY KEY,
      round_id INTEGER NOT NULL REFERENCES rounds(id),
      draw_order INTEGER NOT NULL,
      ball_number INTEGER NOT NULL,
      drawn_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      round_id INTEGER NOT NULL REFERENCES rounds(id),
      room_id INTEGER NOT NULL REFERENCES rooms(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      card_index INTEGER NOT NULL,
      card_grid_json TEXT NOT NULL,
      price_paid_minor INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      claimed_at TIMESTAMP,
      claim_valid BOOLEAN,
      payout_minor INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payouts (
      id SERIAL PRIMARY KEY,
      round_id INTEGER NOT NULL REFERENCES rounds(id),
      ticket_id INTEGER NOT NULL REFERENCES tickets(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount_minor INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount_minor INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'TELEBIRR',
      transaction_ref TEXT NOT NULL UNIQUE,
      proof_data_url TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      decided_by_admin_id INTEGER,
      decision_reason TEXT,
      decided_at TIMESTAMP,
      idempotency_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    ALTER TABLE deposits ADD COLUMN IF NOT EXISTS proof_data_url TEXT;

    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount_minor INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'TELEBIRR',
      payout_account TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      decided_by_admin_id INTEGER,
      decision_reason TEXT,
      decided_at TIMESTAMP,
      idempotency_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS self_exclusions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      reason TEXT,
      starts_at TIMESTAMP NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMP NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      actor_user_id INTEGER,
      actor_username TEXT,
      target_user_id INTEGER,
      target_username TEXT,
      action TEXT NOT NULL,
      reason TEXT,
      metadata_json TEXT,
      ip_address TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      title_en TEXT NOT NULL,
      title_am TEXT NOT NULL,
      body_en TEXT NOT NULL,
      body_am TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      username TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      temp_password_plain TEXT,
      rejection_reason TEXT,
      decided_by_admin_id INTEGER,
      decided_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  } catch {
    // Ignore DDL permission errors on restricted DML roles (e.g. Cloud SQL app_user where Drizzle manages schema)
  }
}


/**
 * Required by cloudsql-setup: Upsert user by Firebase UID safely under concurrent requests.
 */
export async function getOrCreateUser(uid: string, email: string, suggestedUsername?: string, dob = '1998-01-01') {
  try {
    await ensureInitialDataSeeded();
    const normalizedEmail = (email || '').trim().toLowerCase();

    // 1. Check if user with this Firebase UID already exists
    let existingUser: typeof users.$inferSelect | undefined;
    const existingByUid = await db.select().from(users).where(eq(users.uid, uid));
    if (existingByUid.length > 0 && existingByUid[0].role === 'player') {
      existingUser = existingByUid[0];
    }

    // 2. If not found by UID, check if a player with this Google Email already exists
    if (!existingUser && normalizedEmail && !normalizedEmail.endsWith('@google.user') && !normalizedEmail.endsWith('@firebase.user')) {
      const existingByEmail = await db
        .select()
        .from(users)
        .where(
          and(
            sql`LOWER(${users.email}) = ${normalizedEmail}`,
            eq(users.role, 'player')
          )
        );
      if (existingByEmail.length > 0) {
        existingUser = existingByEmail[0];
      }
    }

    if (existingUser) {
      const updated = await db
        .update(users)
        .set({
          email: normalizedEmail || existingUser.email,
          lastActiveAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      const u = updated[0] || existingUser;
      if (u.role === 'player') {
        const insertedWallet = await db
          .insert(wallets)
          .values({
            userId: u.id,
            balanceMinor: WELCOME_BONUS_MINOR,
            lockedMinor: 0,
            playBalanceMinor: 100000,
          })
          .onConflictDoNothing()
          .returning();
        if (insertedWallet.length > 0) {
          await db
            .insert(ledgerEntries)
            .values({
              userId: u.id,
              type: 'WELCOME_BONUS',
              amountMinor: WELCOME_BONUS_MINOR,
              lockedDeltaMinor: 0,
              balanceAfterMinor: WELCOME_BONUS_MINOR,
              lockedAfterMinor: 0,
              idempotencyKey: `welcome_bonus_${u.id}`,
              referenceId: `SIGNUP_BONUS_${u.id}`,
              note: 'አዲስ ደንበኛ የእንኳን ደህና መጡ 20.00 ብር ቦነስ (New Player 20.00 ETB Welcome Bonus)',
            })
            .onConflictDoNothing();
        }
      }
      return u;
    }

    // 3. Construct a clean, unique username for the new Google user
    const emailPrefix = normalizedEmail.includes('@') ? normalizedEmail.split('@')[0] : normalizedEmail;
    const rawBase = (suggestedUsername || emailPrefix || 'player')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 12)
      .toLowerCase();
    const cleanBase = rawBase.length >= 3 ? rawBase : `player_${rawBase}`;
    const suffix = uid.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toLowerCase() || crypto.randomBytes(2).toString('hex');
    let candidateUsername = `${cleanBase}_${suffix}`;

    // Ensure candidateUsername does not collide with an existing username
    const usernameCheck = await db.select().from(users).where(eq(users.username, candidateUsername));
    if (usernameCheck.length > 0) {
      candidateUsername = `${cleanBase}_${crypto.randomBytes(3).toString('hex')}`;
    }

    const displayLabel = suggestedUsername?.trim() || emailPrefix || candidateUsername;

    const result = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail || `${candidateUsername}@google.user`,
        username: candidateUsername,
        displayUsername: displayLabel,
        passwordHash: hashPassword(crypto.randomBytes(16).toString('hex')),
        dob: isAdult18Plus(dob) ? dob : '1998-01-01',
        role: 'player',
        status: 'ACTIVE',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail || `${candidateUsername}@google.user`,
          lastActiveAt: new Date(),
        },
      })
      .returning();

    const user = result[0];
    if (user && user.role === 'player') {
      const insertedWallet = await db
        .insert(wallets)
        .values({
          userId: user.id,
          balanceMinor: WELCOME_BONUS_MINOR,
          lockedMinor: 0,
          playBalanceMinor: 100000,
        })
        .onConflictDoNothing()
        .returning();
      if (insertedWallet.length > 0) {
        await db
          .insert(ledgerEntries)
          .values({
            userId: user.id,
            type: 'WELCOME_BONUS',
            amountMinor: WELCOME_BONUS_MINOR,
            lockedDeltaMinor: 0,
            balanceAfterMinor: WELCOME_BONUS_MINOR,
            lockedAfterMinor: 0,
            idempotencyKey: `welcome_bonus_${user.id}`,
            referenceId: `SIGNUP_BONUS_${user.id}`,
            note: 'አዲስ ደንበኛ የእንኳን ደህና መጡ 20.00 ብር ቦነስ (New Player 20.00 ETB Welcome Bonus)',
          })
          .onConflictDoNothing();
      }
    }
    return user;
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

const globalForSeed = globalThis as unknown as {
  __winnerBingoSeeded?: boolean;
  __winnerBingoSeedPromise?: Promise<void> | null;
};

/**
 * Ensures all database tables exist and the single hidden admin account and default Bingo rooms are seeded.
 */
export async function ensureInitialDataSeeded(): Promise<void> {
  if (globalForSeed.__winnerBingoSeeded) return;
  if (globalForSeed.__winnerBingoSeedPromise) return globalForSeed.__winnerBingoSeedPromise;

  globalForSeed.__winnerBingoSeedPromise = (async () => {
    try {
      await ensureSchemaTablesExist();

      const adminUsername = (process.env.ADMIN_USERNAME || '0918223401@eic').toLowerCase().trim();
      const adminPassword = process.env.ADMIN_PASSWORD || '0972728253@eic';

      // Ensure at least one admin account exists and matches the configured admin password
      const existingAdmins = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
      if (existingAdmins.length === 0) {
        await db
          .insert(users)
          .values({
            uid: `admin_${adminUsername}`,
            email: `${adminUsername}@system.local`,
            username: adminUsername,
            displayUsername: adminUsername,
            passwordHash: hashPassword(adminPassword, true),
            dob: '1990-01-01',
            role: 'admin',
            status: 'ACTIVE',
          })
          .onConflictDoUpdate({
            target: users.username,
            set: {
              passwordHash: hashPassword(adminPassword, true),
              role: 'admin',
              status: 'ACTIVE',
            },
          });
      } else if (!verifyPassword(adminPassword, existingAdmins[0].passwordHash)) {
        invalidatePasswordVerificationCache(existingAdmins[0].passwordHash);
        await db
          .update(users)
          .set({ passwordHash: hashPassword(adminPassword, true) })
          .where(eq(users.id, existingAdmins[0].id));
      }

      // Ensure default system settings
      await db
        .insert(systemSettings)
        .values([
          { key: 'maintenance_mode', value: 'false' },
          { key: 'single_session_enforced', value: 'true' },
        ])
        .onConflictDoNothing();

      // Ensure only TWO active Bingo rooms exist:
      // 1) መርካቶ (Merkato) — the single real-money room
      // 2) መለማመጃ (Practice) — the single practice room
      const existingRooms = await db.select().from(rooms);
      const merkatoExisting = existingRooms.find((r) => r.slug === 'merkato-fifty-corners');
      const practiceExisting = existingRooms.find((r) => r.slug === 'practice-free-room');

      const commissionSettingRows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'house_commission_bps'));
      const savedCommissionBps = commissionSettingRows[0]
        ? Number(commissionSettingRows[0].value)
        : NaN;
      const effectiveHouseFeeBps =
        Number.isFinite(savedCommissionBps) && savedCommissionBps >= 0 && savedCommissionBps <= 5000
          ? Math.round(savedCommissionBps)
          : merkatoExisting?.houseFeeBps ?? 2300;

      if (!merkatoExisting) {
        await db
          .insert(rooms)
          .values({
            slug: 'merkato-fifty-corners',
            nameEn: 'Main Game',
            nameAm: 'ዋናው ጭዋታ',
            ticketPriceMinor: 5000, // 50.00 ETB default (configurable by Admin)
            pattern: 'ONE_LINE',
            minPlayers: 2,
            minCardsPerPlayer: 1,
            maxCardsPerPlayer: 10,
            houseFeeBps: effectiveHouseFeeBps,
            drawIntervalSeconds: 3,
            cadenceSeconds: 90,
            isPractice: false,
            isActive: true,
          })
          .onConflictDoNothing();
      } else {
        await db
          .update(rooms)
          .set({
            nameEn: 'Main Game',
            nameAm: 'ዋናው ጭዋታ',
            minPlayers: Math.max(2, merkatoExisting.minPlayers || 2),
            maxCardsPerPlayer: Math.max(10, merkatoExisting.maxCardsPerPlayer || 10),
            houseFeeBps: effectiveHouseFeeBps,
            cadenceSeconds:
              merkatoExisting.cadenceSeconds === 20 || merkatoExisting.cadenceSeconds === 25
                ? 90
                : merkatoExisting.cadenceSeconds,
            isPractice: false,
            isActive: true,
          })
          .where(eq(rooms.id, merkatoExisting.id));
      }

      if (!practiceExisting) {
        await db
          .insert(rooms)
          .values({
            slug: 'practice-free-room',
            nameEn: 'Practice Room',
            nameAm: 'መለማመጃ',
            ticketPriceMinor: 1000, // 10.00 Play ETB
            pattern: 'ONE_LINE',
            minPlayers: 2,
            minCardsPerPlayer: 1,
            maxCardsPerPlayer: 10,
            houseFeeBps: 0, // 0% fee in practice mode
            drawIntervalSeconds: 3,
            cadenceSeconds: 90,
            isPractice: true,
            isActive: true,
          })
          .onConflictDoNothing();
      } else {
        await db
          .update(rooms)
          .set({
            nameEn: 'Practice Room',
            nameAm: 'መለማመጃ',
            minPlayers: Math.max(2, practiceExisting.minPlayers || 2),
            maxCardsPerPlayer: Math.max(10, practiceExisting.maxCardsPerPlayer || 10),
            cadenceSeconds:
              practiceExisting.cadenceSeconds === 20 || practiceExisting.cadenceSeconds === 25
                ? 90
                : practiceExisting.cadenceSeconds,
            isPractice: true,
            isActive: true,
          })
          .where(eq(rooms.id, practiceExisting.id));
      }

      // Deactivate any other rooms (e.g., Addis, Bole, etc.) so only Merkato and Practice remain
      for (const rm of existingRooms) {
        if (rm.slug !== 'merkato-fifty-corners' && rm.slug !== 'practice-free-room' && rm.isActive) {
          await db
            .update(rooms)
            .set({ isActive: false })
            .where(eq(rooms.id, rm.id));
        }
      }

      // Purge any previously generated dummy/bot player ("abebe_gondar") so only real players exist
      const dummyUsers = await db.select().from(users).where(eq(users.username, 'abebe_gondar'));
      for (const bot of dummyUsers) {
        await db.delete(payouts).where(eq(payouts.userId, bot.id));
        await db.delete(tickets).where(eq(tickets.userId, bot.id));
        await db.delete(ledgerEntries).where(eq(ledgerEntries.userId, bot.id));
        await db.delete(deposits).where(eq(deposits.userId, bot.id));
        await db.delete(withdrawals).where(eq(withdrawals.userId, bot.id));
        await db.delete(selfExclusions).where(eq(selfExclusions.userId, bot.id));
        await db.delete(notifications).where(eq(notifications.userId, bot.id));
        await db.delete(wallets).where(eq(wallets.userId, bot.id));
        await db.delete(users).where(eq(users.id, bot.id));
      }
      // Clear any previously activated self-exclusions so players are not locked out
      await db
        .update(users)
        .set({ status: 'ACTIVE' })
        .where(eq(users.status, 'SELF_EXCLUDED'));
      await db
        .update(selfExclusions)
        .set({ isActive: false })
        .where(eq(selfExclusions.isActive, true));

      globalForSeed.__winnerBingoSeeded = true;
    } catch (error) {
      console.error('Error seeding initial data:', error);
      globalForSeed.__winnerBingoSeedPromise = null;
    }
  })();

  return globalForSeed.__winnerBingoSeedPromise;
}

export async function isUserSelfExcluded(_userId: number): Promise<{ excluded: boolean; endsAt?: Date }> {
  // Self-Exclusion (Cool-Off Break) is disabled per operator configuration
  return { excluded: false };
}

let cachedOnlineCount = 0;
let cachedOnlineAtMs = 0;

export function invalidateOnlinePlayersCache(): void {
  cachedOnlineAtMs = 0;
}

/**
 * Counts active players whose `lastActiveAt` heartbeat is within the last 90 seconds.
 */
export async function getOnlinePlayersCount(minFloor = 1): Promise<number> {
  const nowMs = Date.now();
  if (nowMs - cachedOnlineAtMs < 1500 && cachedOnlineCount >= minFloor) {
    return cachedOnlineCount;
  }

  try {
    const cutoff = new Date(nowMs - 90 * 1000);
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          eq(users.role, 'player'),
          eq(users.status, 'ACTIVE'),
          gte(users.lastActiveAt, cutoff)
        )
      );
    const dbCount = Number(rows[0]?.count || 0);
    cachedOnlineCount = Math.max(minFloor, dbCount);
    cachedOnlineAtMs = nowMs;
    return cachedOnlineCount;
  } catch {
    return Math.max(minFloor, cachedOnlineCount || 1);
  }
}

