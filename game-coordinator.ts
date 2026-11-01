import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { db } from '../db/index';
import {
  rooms,
  rounds,
  roundDraws,
  tickets,
  payouts,
  wallets,
  users,
  notifications,
  systemSettings,
} from '../db/schema';
import {
  BingoPattern,
  BingoCardGrid,
  generateServerSeed,
  hashServerSeed,
  deriveDrawOrder,
  generateTargetedDrawSequence,
  getPoolCard,
  validateClaim,
  calculateRoundPayouts,
  formatEtb,
} from './bingo-engine';
import { executeLedgerTransfer } from './ledger';
import { recordAuditLog } from './auth';

export interface PredeterminedWinnerTarget {
  enabled: boolean;
  roomId: number | 'ALL';
  targetType: 'CARD' | 'PLAYER';
  targetCardIndex: number | null;
  targetUserId: number | null;
  targetUsername: string | null;
  autoClearAfterWin: boolean;
  appliedRoundIds?: number[];
  updatedAt: string;
  updatedBy?: string;
}

const PREDETERMINED_SETTINGS_KEY = 'predetermined_winner_targets_v1';

const gState = globalThis as unknown as {
  __winnerBingoCardLocks?: Map<string, LiveCardReservation>;
  __winnerBingoPredeterminedTargets?: Record<string, PredeterminedWinnerTarget>;
};

export async function getAllPredeterminedWinnerTargets(): Promise<
  Record<string, PredeterminedWinnerTarget>
> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, PREDETERMINED_SETTINGS_KEY));
    if (rows[0]?.value) {
      const parsed = JSON.parse(rows[0].value) as Record<string, PredeterminedWinnerTarget>;
      gState.__winnerBingoPredeterminedTargets = parsed;
      return parsed;
    }
  } catch {
    // Fallback to in-memory cache if needed
  }
  return gState.__winnerBingoPredeterminedTargets || {};
}

export async function getPredeterminedWinnerForRoom(
  roomId: number
): Promise<PredeterminedWinnerTarget | null> {
  const all = await getAllPredeterminedWinnerTargets();
  const roomSpecific = all[String(roomId)];
  if (roomSpecific && roomSpecific.enabled) {
    return roomSpecific;
  }
  const globalTarget = all['ALL'];
  if (globalTarget && globalTarget.enabled) {
    return globalTarget;
  }
  return null;
}

export async function savePredeterminedWinnerTarget(
  target: PredeterminedWinnerTarget
): Promise<Record<string, PredeterminedWinnerTarget>> {
  const all = await getAllPredeterminedWinnerTargets();
  const key = String(target.roomId);
  if (!target.enabled) {
    delete all[key];
    if (key === 'ALL') {
      for (const k of Object.keys(all)) {
        delete all[k];
      }
    }
  } else {
    all[key] = {
      ...target,
      appliedRoundIds: target.appliedRoundIds || [],
      updatedAt: new Date().toISOString(),
    };
  }
  gState.__winnerBingoPredeterminedTargets = all;
  await db
    .insert(systemSettings)
    .values({
      key: PREDETERMINED_SETTINGS_KEY,
      value: JSON.stringify(all),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: JSON.stringify(all),
        updatedAt: new Date(),
      },
    });
  return all;
}

/**
 * Resolves the target card grid and competitor card grids for a round based on the Admin's
 * predetermined winner selection (Card ID #1-#120 or Player ID) and returns the targeted 75-ball sequence.
 */
export function computeTargetedSequenceForRound(params: {
  target: PredeterminedWinnerTarget;
  roundTickets: Array<typeof tickets.$inferSelect>;
  pattern: BingoPattern | string;
  alreadyDrawn?: number[];
}): {
  matched: boolean;
  sequence: number[] | null;
  resolvedCardIndex: number | null;
  resolvedUserId: number | null;
} {
  const { target, roundTickets, pattern, alreadyDrawn = [] } = params;
  if (!target || !target.enabled) {
    return { matched: false, sequence: null, resolvedCardIndex: null, resolvedUserId: null };
  }

  let targetCardGrid: BingoCardGrid | null = null;
  let resolvedCardIndex: number | null = null;
  let resolvedUserId: number | null = null;
  const competitorGrids: BingoCardGrid[] = [];

  if (target.targetType === 'PLAYER' && target.targetUserId) {
    const playerTickets = roundTickets.filter((t) => t.userId === target.targetUserId);
    if (playerTickets.length > 0) {
      const chosenTicket = playerTickets[0];
      targetCardGrid = JSON.parse(chosenTicket.cardGridJson) as BingoCardGrid;
      resolvedCardIndex = chosenTicket.cardIndex;
      resolvedUserId = chosenTicket.userId;

      for (const t of roundTickets) {
        if (t.userId !== target.targetUserId) {
          competitorGrids.push(JSON.parse(t.cardGridJson) as BingoCardGrid);
        }
      }
    }
  } else if (target.targetType === 'CARD' && target.targetCardIndex) {
    const cardIdx = target.targetCardIndex;
    const matchingTicket = roundTickets.find((t) => t.cardIndex === cardIdx);
    if (matchingTicket) {
      targetCardGrid = JSON.parse(matchingTicket.cardGridJson) as BingoCardGrid;
      resolvedCardIndex = matchingTicket.cardIndex;
      resolvedUserId = matchingTicket.userId;
    } else if (cardIdx >= 1 && cardIdx <= 400) {
      targetCardGrid = getPoolCard(cardIdx);
      resolvedCardIndex = cardIdx;
    }

    for (const t of roundTickets) {
      if (t.cardIndex !== cardIdx) {
        competitorGrids.push(JSON.parse(t.cardGridJson) as BingoCardGrid);
      }
    }
  }

  if (!targetCardGrid) {
    return { matched: false, sequence: null, resolvedCardIndex: null, resolvedUserId: null };
  }

  const sequence = generateTargetedDrawSequence({
    targetCardGrid,
    competitorGrids,
    pattern,
    alreadyDrawn,
  });

  return {
    matched: true,
    sequence,
    resolvedCardIndex,
    resolvedUserId,
  };
}

export async function isMaintenanceModeEnabled(): Promise<boolean> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'maintenance_mode'));
    return rows[0]?.value === 'true';
  } catch {
    return false;
  }
}

export async function getGlobalHouseCommissionBps(defaultBps = 2000): Promise<number> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'house_commission_bps'));
    if (rows[0]?.value !== undefined) {
      const parsed = Number(rows[0].value);
      if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 5000) {
        return parsed;
      }
    }
  } catch {
    // Fallback
  }
  return defaultBps;
}

export async function setGlobalHouseCommissionBps(bps: number): Promise<number> {
  const clamped = Math.min(5000, Math.max(0, Math.round(Number(bps))));
  await db
    .insert(systemSettings)
    .values({
      key: 'house_commission_bps',
      value: String(clamped),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: String(clamped),
        updatedAt: new Date(),
      },
    });
  return clamped;
}

// ============================================================================
// ADMIN GAME SCHEDULING & BETTING CONTROL
// ============================================================================
export interface GameBettingSchedule {
  isBettingOpen: boolean;
  isPracticeModeOpen: boolean;
  practiceOffReason?: string;
  practiceResumeTime?: string;
  isRealGameModeOpen: boolean;
  realGameOffReason?: string;
  realGameResumeTime?: string;
  scheduledGameTime: string | null; // ISO string e.g. "2026-10-28T19:00:00.000Z"
  customNoticeEn?: string;
  customNoticeAm?: string;
  updatedAt: string;
  updatedBy?: string;
}

const BETTING_SCHEDULE_KEY = 'game_betting_schedule_v1';

export async function getGameBettingSchedule(): Promise<GameBettingSchedule> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, BETTING_SCHEDULE_KEY));
    if (rows[0]?.value) {
      const parsed = JSON.parse(rows[0].value) as GameBettingSchedule;
      const isBettingOpen = parsed.isBettingOpen ?? true;
      const isRealGameModeOpen = parsed.isRealGameModeOpen ?? isBettingOpen;
      const isPracticeModeOpen = parsed.isPracticeModeOpen ?? true;
      return {
        isBettingOpen,
        isPracticeModeOpen,
        practiceOffReason: parsed.practiceOffReason ?? '',
        practiceResumeTime: parsed.practiceResumeTime ?? '',
        isRealGameModeOpen,
        realGameOffReason: parsed.realGameOffReason ?? '',
        realGameResumeTime: parsed.realGameResumeTime ?? '',
        scheduledGameTime: parsed.scheduledGameTime ?? null,
        customNoticeEn: parsed.customNoticeEn ?? '',
        customNoticeAm: parsed.customNoticeAm ?? '',
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        updatedBy: parsed.updatedBy || 'ADMIN',
      };
    }
  } catch {
    // Fallback
  }
  return {
    isBettingOpen: true,
    isPracticeModeOpen: true,
    practiceOffReason: '',
    practiceResumeTime: '',
    isRealGameModeOpen: true,
    realGameOffReason: '',
    realGameResumeTime: '',
    scheduledGameTime: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function setGameBettingSchedule(
  update: Partial<GameBettingSchedule>,
  updatedBy = 'ADMIN'
): Promise<GameBettingSchedule> {
  const current = await getGameBettingSchedule();
  const nextIsBettingOpen =
    update.isBettingOpen !== undefined ? Boolean(update.isBettingOpen) : current.isBettingOpen;
  const nextIsRealGameModeOpen =
    update.isRealGameModeOpen !== undefined
      ? Boolean(update.isRealGameModeOpen)
      : update.isBettingOpen !== undefined
      ? Boolean(update.isBettingOpen)
      : current.isRealGameModeOpen;
  const nextIsPracticeModeOpen =
    update.isPracticeModeOpen !== undefined
      ? Boolean(update.isPracticeModeOpen)
      : current.isPracticeModeOpen;

  const next: GameBettingSchedule = {
    isBettingOpen: nextIsBettingOpen,
    isPracticeModeOpen: nextIsPracticeModeOpen,
    practiceOffReason:
      update.practiceOffReason !== undefined ? update.practiceOffReason : current.practiceOffReason,
    practiceResumeTime:
      update.practiceResumeTime !== undefined
        ? update.practiceResumeTime
        : current.practiceResumeTime,
    isRealGameModeOpen: nextIsRealGameModeOpen,
    realGameOffReason:
      update.realGameOffReason !== undefined ? update.realGameOffReason : current.realGameOffReason,
    realGameResumeTime:
      update.realGameResumeTime !== undefined
        ? update.realGameResumeTime
        : current.realGameResumeTime,
    scheduledGameTime:
      update.scheduledGameTime !== undefined
        ? update.scheduledGameTime
          ? new Date(update.scheduledGameTime).toISOString()
          : null
        : current.scheduledGameTime,
    customNoticeEn:
      update.customNoticeEn !== undefined ? update.customNoticeEn : current.customNoticeEn,
    customNoticeAm:
      update.customNoticeAm !== undefined ? update.customNoticeAm : current.customNoticeAm,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  await db
    .insert(systemSettings)
    .values({
      key: BETTING_SCHEDULE_KEY,
      value: JSON.stringify(next),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: JSON.stringify(next),
        updatedAt: new Date(),
      },
    });

  // If a scheduled game time is set in the future, synchronize any active OPEN rounds so the countdown timer aligns
  if (next.scheduledGameTime) {
    const targetDate = new Date(next.scheduledGameTime);
    if (!Number.isNaN(targetDate.getTime()) && targetDate.getTime() > Date.now()) {
      const openRds = await db.select().from(rounds).where(eq(rounds.status, 'OPEN'));
      for (const ord of openRds) {
        await db.update(rounds).set({ startsAt: targetDate }).where(eq(rounds.id, ord.id));
      }
    }
  }

  return next;
}

export function getRoomCountdownSeconds(cadenceSeconds: number): number {
  // Pre-game cartela selection countdown defaults to 90 seconds (configurable 10 to 300 seconds)
  if (!cadenceSeconds || cadenceSeconds <= 0) return 90;
  return Math.min(300, Math.max(10, cadenceSeconds));
}

function computeNextStartsAt(cadenceSeconds: number, nowMs = Date.now(), scheduledTimeIso?: string | null): Date {
  if (scheduledTimeIso) {
    const sDate = new Date(scheduledTimeIso);
    if (!Number.isNaN(sDate.getTime()) && sDate.getTime() > nowMs) {
      return sDate;
    }
  }
  const countdownSec = getRoomCountdownSeconds(cadenceSeconds);
  return new Date(nowMs + countdownSec * 1000);
}

// ============================================================================
// REAL-TIME CARTELA SELECTION LOCKING (Prevents two players from picking the same card)
// ============================================================================
interface LiveCardReservation {
  roundId: number;
  cardIndex: number;
  userId: number;
  username: string;
  expiresAtMs: number;
}

if (!gState.__winnerBingoCardLocks) {
  gState.__winnerBingoCardLocks = new Map<string, LiveCardReservation>();
}
const liveCardLocks = gState.__winnerBingoCardLocks;

function pruneExpiredLocks(nowMs = Date.now()) {
  for (const [key, lock] of liveCardLocks.entries()) {
    if (lock.expiresAtMs <= nowMs) {
      liveCardLocks.delete(key);
    }
  }
}

export function getRoundCardLocks(roundId: number, nowMs = Date.now()): LiveCardReservation[] {
  pruneExpiredLocks(nowMs);
  const list: LiveCardReservation[] = [];
  for (const lock of liveCardLocks.values()) {
    if (lock.roundId === roundId) {
      list.push(lock);
    }
  }
  return list;
}

export function clearUserRoundReservations(roundId: number, userId: number) {
  for (const [key, lock] of liveCardLocks.entries()) {
    if (lock.roundId === roundId && lock.userId === userId) {
      liveCardLocks.delete(key);
    }
  }
}

export function reserveRoundCards(params: {
  roundId: number;
  userId: number;
  username: string;
  cardIndices: number[];
  maxCards: number;
  purchasedCardIndices: number[];
  roundStartsAtMs: number;
}): { ok: boolean; error?: string; reservedIndices: number[] } {
  const nowMs = Date.now();
  pruneExpiredLocks(nowMs);

  const purchasedSet = new Set(params.purchasedCardIndices);
  const desired = Array.from(new Set(params.cardIndices)).slice(0, params.maxCards);

  const validDesired: number[] = [];
  let conflictError: string | undefined;

  // Check if any desired card is already purchased or locked by another player
  for (const idx of desired) {
    if (purchasedSet.has(idx)) {
      conflictError = `ካርቴላ #${idx} ቀድሞ ተይዟል! እባክዎ ሌላ ካርቴላ ይምረጡ። (Card #${idx} is already taken)`;
      continue;
    }
    const key = `${params.roundId}:${idx}`;
    const existingLock = liveCardLocks.get(key);
    if (existingLock && existingLock.userId !== params.userId && existingLock.expiresAtMs > nowMs) {
      conflictError = `ካርቴላ #${idx} በሌላ ተጫዋች ተመርጧል (ተይዟል)! እባክዎ ሌላ ካርቴላ ይምረጡ። (Card #${idx} is locked by another player)`;
      continue;
    }
    validDesired.push(idx);
  }

  // Clear previous locks for this user in this round and set all valid selected ones
  clearUserRoundReservations(params.roundId, params.userId);
  const expiresAtMs = Math.max(nowMs + 95000, params.roundStartsAtMs + 5000);

  for (const idx of validDesired) {
    const key = `${params.roundId}:${idx}`;
    liveCardLocks.set(key, {
      roundId: params.roundId,
      cardIndex: idx,
      userId: params.userId,
      username: params.username,
      expiresAtMs,
    });
  }

  if (conflictError) {
    return { ok: false, error: conflictError, reservedIndices: validDesired };
  }

  return { ok: true, reservedIndices: validDesired };
}

/**
 * Refunds all tickets for a cancelled round inside idempotent ledger transactions.
 */
export async function cancelRoundAndRefundTickets(
  roundId: number,
  reason: string,
  actorUsername = 'SYSTEM'
): Promise<void> {
  const roundRows = await db.select().from(rounds).where(eq(rounds.id, roundId));
  const round = roundRows[0];
  if (!round || round.status === 'SETTLED' || round.status === 'CANCELLED') {
    return;
  }

  const roomRows = await db.select().from(rooms).where(eq(rooms.id, round.roomId));
  const room = roomRows[0];
  const roundTickets = await db.select().from(tickets).where(eq(tickets.roundId, roundId));

  for (const t of roundTickets) {
    if (t.pricePaidMinor > 0) {
      if (room?.isPractice) {
        // Refund practice play-money balance
        const userWallets = await db.select().from(wallets).where(eq(wallets.userId, t.userId));
        if (userWallets[0]) {
          await db
            .update(wallets)
            .set({
              playBalanceMinor: userWallets[0].playBalanceMinor + t.pricePaidMinor,
              updatedAt: new Date(),
            })
            .where(eq(wallets.id, userWallets[0].id));
        }
      } else {
        await executeLedgerTransfer({
          userId: t.userId,
          type: 'REFUND',
          amountMinor: t.pricePaidMinor,
          idempotencyKey: `refund_round_${roundId}_ticket_${t.id}`,
          referenceId: `round:${roundId}`,
          note: `Refund for cancelled Round #${roundId}: ${reason}`,
        });
      }
    }
  }

  // Notify distinct participants
  const distinctUserIds = Array.from(new Set(roundTickets.map((t) => t.userId)));
  for (const uid of distinctUserIds) {
    await db.insert(notifications).values({
      userId: uid,
      type: 'ROUND_REFUNDED',
      titleEn: `Round #${roundId} Cancelled & Refunded`,
      titleAm: `ዙር #${roundId} ተሰርዟል — ክፍያዎ ተመልሷል`,
      bodyEn: `Round #${roundId} was cancelled (${reason}). Your ticket purchase has been refunded in full.`,
      bodyAm: `ዙር #${roundId} በ (${reason}) ምክንያት ተሰርዟል። የካርቴላ ክፍያዎ ሙሉ በሙሉ ወደ ቦርሳዎ ተመልሷል።`,
    });
  }

  await db
    .update(rounds)
    .set({
      status: 'CANCELLED',
      cancelReason: reason,
      settledAt: new Date(),
    })
    .where(eq(rounds.id, roundId));

  await recordAuditLog({
    actorUsername,
    action: 'ROUND_CANCELLED_AND_REFUNDED',
    reason,
    metadata: { roundId, refundedTickets: roundTickets.length },
  });
}

/**
 * Ensures the room has an up-to-date synchronized round in PostgreSQL, advances draw state based on UTC clock,
 * enforces the minimum players check (at least 2 players required before starting, otherwise resets timer),
 * and AUTOMATICALLY stops the game and settles the round the moment any player completes the winning pattern (ዝግ).
 */
export async function syncRoomState(
  roomId: number,
  options?: { forceNewRound?: boolean }
) {
  const roomRows = await db.select().from(rooms).where(eq(rooms.id, roomId));
  let room = roomRows[0];
  if (!room) {
    throw new Error('Room not found');
  }

  // Ensure legacy 20s/25s cartela selection timers are upgraded to 90 seconds (never overwrite admin-configured houseFeeBps!)
  if (room.cadenceSeconds === 20 || room.cadenceSeconds === 25) {
    const newCadence = 90;
    const updatedRm = await db
      .update(rooms)
      .set({ cadenceSeconds: newCadence })
      .where(eq(rooms.id, room.id))
      .returning();
    if (updatedRm[0]) {
      room = updatedRm[0];
    }
    const openRds = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.roomId, room.id), eq(rounds.status, 'OPEN')));
    for (const ord of openRds) {
      await db
        .update(rounds)
        .set({ startsAt: computeNextStartsAt(newCadence, Date.now()) })
        .where(eq(rounds.id, ord.id));
    }
  }

  // Keep real-money room houseFeeBps strictly synced with Admin's saved global house commission
  if (!room.isPractice) {
    const savedCommissionBps = await getGlobalHouseCommissionBps(room.houseFeeBps);
    if (savedCommissionBps !== room.houseFeeBps) {
      const updatedRm = await db
        .update(rooms)
        .set({ houseFeeBps: savedCommissionBps })
        .where(eq(rooms.id, room.id))
        .returning();
      if (updatedRm[0]) {
        room = updatedRm[0];
      }
    }
  }

  const maintenance = await isMaintenanceModeEnabled();
  const bettingSchedule = await getGameBettingSchedule();
  const now = new Date();
  const nowMs = now.getTime();

  // Find active round (OPEN, LOCKED, or DRAWING)
  const activeRounds = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.roomId, roomId), inArray(rounds.status, ['OPEN', 'LOCKED', 'DRAWING'])))
    .orderBy(desc(rounds.id));

  let activeRound = activeRounds[0];

  // If no active round exists, check if a round was JUST settled within the last 12 seconds so all players see the stopped game & winner announcement
  if (!activeRound && !options?.forceNewRound) {
    const recentSettled = await db
      .select()
      .from(rounds)
      .where(and(eq(rounds.roomId, roomId), eq(rounds.status, 'SETTLED')))
      .orderBy(desc(rounds.id))
      .limit(1);

    const lastSettled = recentSettled[0];
    if (
      lastSettled?.settledAt &&
      nowMs - lastSettled.settledAt.getTime() < 15000
    ) {
      activeRound = lastSettled;
    }
  }

  // Create a new OPEN round if none exists and not in maintenance mode
  if (!activeRound && !maintenance && room.isActive) {
    const seed = generateServerSeed();
    const seedHash = hashServerSeed(seed);
    const startsAt = computeNextStartsAt(room.cadenceSeconds, nowMs, bettingSchedule.scheduledGameTime);

    const inserted = await db
      .insert(rounds)
      .values({
        roomId: room.id,
        status: 'OPEN',
        startsAt,
        serverSeed: seed,
        serverSeedHash: seedHash,
        drawSequenceJson: '[]',
        drawnCount: 0,
        potMinor: 0,
        houseFeeMinor: 0,
        prizeMinor: 0,
        winningPattern: room.pattern,
        winnerUserIdsJson: '[]',
      })
      .returning();

    const created = inserted[0];
    const derivedSeq = deriveDrawOrder(seed, created.id);
    const updated = await db
      .update(rounds)
      .set({ drawSequenceJson: JSON.stringify(derivedSeq) })
      .where(eq(rounds.id, created.id))
      .returning();
    activeRound = updated[0];
  }

  if (!activeRound) {
    return { room, round: null, tickets: [], draws: [], maintenance, bettingSchedule };
  }

  // Keep activeRound.winningPattern synced with room.pattern while round is still OPEN
  if (activeRound.status === 'OPEN' && activeRound.winningPattern !== room.pattern) {
    const updatedPatternRound = await db
      .update(rounds)
      .set({ winningPattern: room.pattern })
      .where(eq(rounds.id, activeRound.id))
      .returning();
    if (updatedPatternRound[0]) {
      activeRound = updatedPatternRound[0];
    }
  }

  const roundTickets = await db
    .select()
    .from(tickets)
    .where(eq(tickets.roundId, activeRound.id))
    .orderBy(asc(tickets.id));

  const predeterminedTarget = await getPredeterminedWinnerForRoom(room.id);
  const hasTargetedTicketInRound = Boolean(
    predeterminedTarget?.enabled &&
      ((predeterminedTarget.targetType === 'PLAYER' &&
        predeterminedTarget.targetUserId &&
        roundTickets.some((t) => t.userId === predeterminedTarget.targetUserId)) ||
        (predeterminedTarget.targetType === 'CARD' &&
          predeterminedTarget.targetCardIndex &&
          roundTickets.some((t) => t.cardIndex === predeterminedTarget.targetCardIndex)))
  );

  const distinctPlayerCount = new Set(roundTickets.map((t) => t.userId)).size;
  const minRequiredPlayers = Math.max(2, room.minPlayers || 2);
  // A single player cannot play alone unless a predetermined winner target is active and matched in this round
  const hasEnoughToStart =
    distinctPlayerCount >= minRequiredPlayers ||
    (roundTickets.length >= 1 && hasTargetedTicketInRound);

  // Check transition from OPEN -> DRAWING when countdown hits zero (or extend early if <3s left and not enough players yet)
  if (
    activeRound.status === 'OPEN' &&
    (nowMs >= activeRound.startsAt.getTime() ||
      (!hasEnoughToStart && activeRound.startsAt.getTime() - nowMs <= 3000))
  ) {
    if (!hasEnoughToStart) {
      if (maintenance || !room.isActive) {
        if (roundTickets.length === 0) {
          await db
            .update(rounds)
            .set({ status: 'CANCELLED', cancelReason: 'Maintenance mode enabled', settledAt: now })
            .where(eq(rounds.id, activeRound.id));
          return { room, round: null, tickets: [], draws: [], maintenance, bettingSchedule };
        }
      }
      // If 0 cartelas (or fewer than minRequiredPlayers) have been selected when the timer expires (or is within 3s of expiring),
      // DO NOT start an empty game — automatically reset the countdown timer so players can buy tickets cleanly!
      const nextStartsAt = computeNextStartsAt(room.cadenceSeconds, nowMs, bettingSchedule.scheduledGameTime);
      const updated = await db
        .update(rounds)
        .set({ startsAt: nextStartsAt })
        .where(eq(rounds.id, activeRound.id))
        .returning();
      activeRound = updated[0];
    } else if (nowMs >= activeRound.startsAt.getTime()) {
      // Enough players have purchased cartelas and the countdown timer reached 00:00:
      // Clear temporary selection locks and automatically start the live round for all players!
      for (const [key, lock] of liveCardLocks.entries()) {
        if (lock.roundId === activeRound.id) {
          liveCardLocks.delete(key);
        }
      }

      const lockedTicketPriceMinor =
        roundTickets.length > 0 ? roundTickets[0].pricePaidMinor : room.ticketPriceMinor;
      const math = calculateRoundPayouts({
        ticketCount: roundTickets.length,
        ticketPriceMinor: lockedTicketPriceMinor,
        houseFeeBps: room.houseFeeBps,
        winnerIds: [],
      });

      let nextDrawSequenceJson = activeRound.drawSequenceJson;
      if (predeterminedTarget?.enabled) {
        const targeted = computeTargetedSequenceForRound({
          target: predeterminedTarget,
          roundTickets,
          pattern: room.pattern,
          alreadyDrawn: [],
        });
        if (targeted.matched && targeted.sequence && targeted.sequence.length === 75) {
          nextDrawSequenceJson = JSON.stringify(targeted.sequence);
          await savePredeterminedWinnerTarget({
            ...predeterminedTarget,
            appliedRoundIds: Array.from(
              new Set([...(predeterminedTarget.appliedRoundIds || []), activeRound.id])
            ),
          });
        }
      }

      const updated = await db
        .update(rounds)
        .set({
          status: 'DRAWING',
          startsAt: now,
          winningPattern: room.pattern,
          drawSequenceJson: nextDrawSequenceJson,
          potMinor: math.potMinor,
          houseFeeMinor: math.baseHouseFeeMinor,
          prizeMinor: math.netPrizeMinor,
          lastDrawAt: now,
        })
        .where(eq(rounds.id, activeRound.id))
        .returning();
      activeRound = updated[0];
    }
  }

  // Advance ball draws if round is in DRAWING state & AUTOMATICALLY stop the game when the winning pattern (ዝግ) is completed!
  if (activeRound.status === 'DRAWING') {
    let drawSeq: number[] = JSON.parse(activeRound.drawSequenceJson || '[]');
    const pattern = (activeRound.winningPattern || room.pattern || 'ONE_LINE') as BingoPattern;

    // If Admin set or updated a predetermined winner while DRAWING is in progress, dynamically recalculate remaining balls
    if (
      predeterminedTarget?.enabled &&
      !(predeterminedTarget.appliedRoundIds || []).includes(activeRound.id)
    ) {
      const existingDrawsNow = await db
        .select()
        .from(roundDraws)
        .where(eq(roundDraws.roundId, activeRound.id))
        .orderBy(asc(roundDraws.drawOrder));
      const alreadyCalled = existingDrawsNow.map((d) => d.ballNumber);
      const targeted = computeTargetedSequenceForRound({
        target: predeterminedTarget,
        roundTickets,
        pattern,
        alreadyDrawn: alreadyCalled,
      });
      if (targeted.matched && targeted.sequence && targeted.sequence.length === 75) {
        drawSeq = targeted.sequence;
        const updatedSeqRound = await db
          .update(rounds)
          .set({ drawSequenceJson: JSON.stringify(drawSeq) })
          .where(eq(rounds.id, activeRound.id))
          .returning();
        if (updatedSeqRound[0]) {
          activeRound = updatedSeqRound[0];
        }
        await savePredeterminedWinnerTarget({
          ...predeterminedTarget,
          appliedRoundIds: Array.from(
            new Set([...(predeterminedTarget.appliedRoundIds || []), activeRound.id])
          ),
        });
      }
    }

    const elapsedMs = Math.max(0, nowMs - activeRound.startsAt.getTime());
    // Call numbers automatically every 3–5 seconds (default 3–4s per room configuration)
    const clampedDrawSec = Math.min(5, Math.max(3, room.drawIntervalSeconds || 3));
    const intervalMs = clampedDrawSec * 1000;
    const targetBallsCount = Math.min(75, Math.floor(elapsedMs / intervalMs) + 1);

    // Step ball-by-ball up to targetBallsCount to detect the exact ball where any ticket completes the winning pattern (ዝግ)
    let winningBallOrder: number | null = null;
    let winningTicketsAtOrder: Array<typeof tickets.$inferSelect> = [];

    if (drawSeq.length === 75 && roundTickets.length > 0) {
      for (let order = 1; order <= targetBallsCount; order++) {
        const calledSoFar = drawSeq.slice(0, order);
        const winners = roundTickets.filter(
          (t) => validateClaim(JSON.parse(t.cardGridJson), calledSoFar, pattern).valid
        );
        if (winners.length > 0) {
          winningBallOrder = order;
          winningTicketsAtOrder = winners;
          break; // Stop drawing further balls immediately once the winning pattern (ዝግ) is achieved!
        }
      }
    }

    const effectiveBallsCount = winningBallOrder !== null ? winningBallOrder : targetBallsCount;

    if (effectiveBallsCount > activeRound.drawnCount && drawSeq.length === 75) {
      const existingDraws = await db
        .select()
        .from(roundDraws)
        .where(eq(roundDraws.roundId, activeRound.id));
      const existingOrders = new Set(existingDraws.map((d) => d.drawOrder));

      const toInsert: Array<{ roundId: number; drawOrder: number; ballNumber: number; drawnAt: Date }> = [];
      for (let order = activeRound.drawnCount + 1; order <= effectiveBallsCount; order++) {
        if (!existingOrders.has(order)) {
          toInsert.push({
            roundId: activeRound.id,
            drawOrder: order,
            ballNumber: drawSeq[order - 1],
            drawnAt: new Date(activeRound.startsAt.getTime() + (order - 1) * intervalMs),
          });
        }
      }
      if (toInsert.length > 0) {
        await db.insert(roundDraws).values(toInsert);
      }

      const updated = await db
        .update(rounds)
        .set({
          drawnCount: effectiveBallsCount,
          lastDrawAt: now,
        })
        .where(eq(rounds.id, activeRound.id))
        .returning();
      activeRound = updated[0];
    }

    // If any player completed the winning pattern (ዝግ), automatically settle the round and stop the game!
    if (winningBallOrder !== null && winningTicketsAtOrder.length > 0) {
      activeRound = await settleRoundWithWinners(
        activeRound,
        room,
        roundTickets,
        winningTicketsAtOrder.map((t) => t.id)
      );

      if (predeterminedTarget?.enabled && predeterminedTarget.autoClearAfterWin) {
        await savePredeterminedWinnerTarget({
          ...predeterminedTarget,
          enabled: false,
        });
      }

      await recordAuditLog({
        actorUsername: 'SYSTEM',
        action: 'BINGO_AUTO_WON_AND_SETTLED',
        metadata: {
          roundId: activeRound.id,
          roomId: room.id,
          winningTicketIds: winningTicketsAtOrder.map((t) => t.id),
          ballsDrawn: effectiveBallsCount,
          pattern,
        },
      });
    } else if (effectiveBallsCount >= 75 && elapsedMs > 75 * intervalMs + 5000) {
      // All 75 balls exhausted with no winner
      await cancelRoundAndRefundTickets(
        activeRound.id,
        'Round completed 75 balls with no winner — auto-refunded'
      );
      return syncRoomState(roomId, { forceNewRound: true });
    }
  }

  const RefreshedTickets = await db
    .select()
    .from(tickets)
    .where(eq(tickets.roundId, activeRound.id))
    .orderBy(asc(tickets.id));

  const calledDraws = await db
    .select()
    .from(roundDraws)
    .where(eq(roundDraws.roundId, activeRound.id))
    .orderBy(asc(roundDraws.drawOrder));

  return {
    room,
    round: activeRound,
    tickets: RefreshedTickets,
    draws: calledDraws,
    maintenance,
    bettingSchedule,
  };
}

/**
 * Settles a round atomically, splitting the prize pool deterministically across all winning tickets,
 * recording house fee and winner payouts in the append-only ledger, and revealing serverSeed.
 */
export async function settleRoundWithWinners(
  round: typeof rounds.$inferSelect,
  room: typeof rooms.$inferSelect,
  allRoundTickets: Array<typeof tickets.$inferSelect>,
  winningTicketIds: number[]
) {
  if (round.status === 'SETTLED' || round.status === 'CANCELLED') {
    return round;
  }

  const settledTicketPriceMinor =
    allRoundTickets.length > 0 ? allRoundTickets[0].pricePaidMinor : room.ticketPriceMinor;
  const calc = calculateRoundPayouts({
    ticketCount: allRoundTickets.length,
    ticketPriceMinor: settledTicketPriceMinor,
    houseFeeBps: room.houseFeeBps,
    winnerIds: winningTicketIds,
  });

  const winningTicketSet = new Set(winningTicketIds);
  const winningTickets = allRoundTickets.filter((t) => winningTicketSet.has(t.id));
  const winnerUserIds = Array.from(new Set(winningTickets.map((t) => t.userId)));

  for (const winTicket of winningTickets) {
    const shareMinor = calc.perWinnerMinor;
    await db
      .update(tickets)
      .set({
        claimedAt: new Date(),
        claimValid: true,
        payoutMinor: shareMinor,
      })
      .where(eq(tickets.id, winTicket.id));

    if (shareMinor > 0) {
      if (room.isPractice) {
        const wRows = await db.select().from(wallets).where(eq(wallets.userId, winTicket.userId));
        if (wRows[0]) {
          await db
            .update(wallets)
            .set({
              playBalanceMinor: wRows[0].playBalanceMinor + shareMinor,
              updatedAt: new Date(),
            })
            .where(eq(wallets.id, wRows[0].id));
        }
      } else {
        await executeLedgerTransfer({
          userId: winTicket.userId,
          type: 'PAYOUT',
          amountMinor: shareMinor,
          idempotencyKey: `payout_round_${round.id}_ticket_${winTicket.id}`,
          referenceId: `round:${round.id}`,
          note: `Bingo Win Payout in ${room.nameEn} (Round #${round.id}, Card #${winTicket.cardIndex})`,
        });
      }

      await db
        .insert(payouts)
        .values({
          roundId: round.id,
          ticketId: winTicket.id,
          userId: winTicket.userId,
          amountMinor: shareMinor,
          idempotencyKey: `payout_rec_round_${round.id}_ticket_${winTicket.id}`,
        })
        .onConflictDoNothing();

      await db.insert(notifications).values({
        userId: winTicket.userId,
        type: 'ROUND_WON',
        titleEn: `BINGO! You won ${formatEtb(shareMinor, 'en')}!`,
        titleAm: `ቢንጎ! ${formatEtb(shareMinor, 'am')} አሸንፈዋል!`,
        bodyEn: `Card #${winTicket.cardIndex} won Round #${round.id} in ${room.nameEn}. Prize credited to your wallet.`,
        bodyAm: `ካርቴላ #${winTicket.cardIndex} በ ${room.nameAm} (ዙር #${round.id}) አሸንፏል። ሽልማቱ ወደ ቦርሳዎ ገብቷል።`,
      });
    }
  }

  const updated = await db
    .update(rounds)
    .set({
      status: 'SETTLED',
      potMinor: calc.potMinor,
      houseFeeMinor: calc.effectiveHouseFeeMinor,
      prizeMinor: calc.netPrizeMinor,
      winnerUserIdsJson: JSON.stringify(winnerUserIds),
      settledAt: new Date(),
    })
    .where(eq(rounds.id, round.id))
    .returning();

  if (!room.isPractice) {
    const commissionPct = Number((room.houseFeeBps / 100).toFixed(2));
    await recordAuditLog({
      actorUsername: 'SYSTEM',
      action: 'GAME_COMMISSION_DEDUCTED',
      reason: `Round #${round.id} (${room.nameEn}): Pot ${formatEtb(calc.potMinor, 'en')} - House Commission ${commissionPct}% (${formatEtb(calc.effectiveHouseFeeMinor, 'en')}) = Winner Prize ${formatEtb(calc.netPrizeMinor, 'en')}`,
      metadata: {
        roundId: round.id,
        roomId: room.id,
        roomNameEn: room.nameEn,
        ticketsCount: allRoundTickets.length,
        ticketPriceMinor: settledTicketPriceMinor,
        potMinor: calc.potMinor,
        houseFeeBps: room.houseFeeBps,
        commissionPercent: commissionPct,
        houseFeeMinor: calc.effectiveHouseFeeMinor,
        netPrizeMinor: calc.netPrizeMinor,
        winnerUserIds,
        winningCardIndices: winningTickets.map((t) => t.cardIndex),
      },
    });
  }

  return updated[0];
}

/**
 * Formats a public round payload for players:
 * CRITICAL PROVABLY FAIR RULE: Never expose serverSeed while status is OPEN, LOCKED, or DRAWING!
 * Only reveal serverSeed when status is SETTLED or CANCELLED.
 */
export async function buildClientRoomState(
  roomId: number,
  currentUserId: number,
  options?: {
    forceNewRound?: boolean;
    preSynced?: Awaited<ReturnType<typeof syncRoomState>>;
  }
) {
  const synced = options?.preSynced || (await syncRoomState(roomId, options));
  const { room, round, tickets: roundTickets, draws, maintenance } = synced;

  // Also fetch recent settled/cancelled rounds for this room so players can see the latest result & verify fairness
  const recentRoundsRaw = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.roomId, roomId), inArray(rounds.status, ['SETTLED', 'CANCELLED'])))
    .orderBy(desc(rounds.id))
    .limit(2);

  // Fetch winning tickets for recent settled rounds so every client can display the Winner Popup Modal
  const recentRoundIds = recentRoundsRaw.map((r) => r.id);
  const recentWinningTicketsRaw =
    recentRoundIds.length > 0
      ? await db
          .select()
          .from(tickets)
          .where(and(inArray(tickets.roundId, recentRoundIds), eq(tickets.claimValid, true)))
          .orderBy(asc(tickets.id))
      : [];

  // Map usernames only for relevant winner userIds instead of querying the entire users table
  const relevantUserIds = new Set<number>();
  for (const r of recentRoundsRaw) {
    const wIds: number[] = JSON.parse(r.winnerUserIdsJson || '[]');
    for (const id of wIds) relevantUserIds.add(id);
  }
  for (const t of recentWinningTicketsRaw) {
    relevantUserIds.add(t.userId);
  }
  if (round) {
    const activeWinIds: number[] = JSON.parse(round.winnerUserIdsJson || '[]');
    for (const id of activeWinIds) relevantUserIds.add(id);
    for (const t of roundTickets) {
      if (t.claimValid) relevantUserIds.add(t.userId);
    }
  }

  const relevantUsers =
    relevantUserIds.size > 0
      ? await db
          .select({ id: users.id, displayUsername: users.displayUsername })
          .from(users)
          .where(inArray(users.id, Array.from(relevantUserIds)))
      : [];
  const usernameMap = new Map(relevantUsers.map((u) => [u.id, u.displayUsername]));

  const recentRounds = recentRoundsRaw.map((r) => {
    const winIds: number[] = JSON.parse(r.winnerUserIdsJson || '[]');
    const fullSeq: number[] = JSON.parse(r.drawSequenceJson || '[]');
    const rWinTickets = recentWinningTicketsRaw.filter((t) => t.roundId === r.id);
    return {
      id: r.id,
      status: r.status,
      startsAt: r.startsAt.toISOString(),
      settledAt: r.settledAt?.toISOString() || null,
      serverSeedHash: r.serverSeedHash,
      serverSeed: r.serverSeed, // Safe to reveal because status is SETTLED or CANCELLED
      drawnNumbers: fullSeq.slice(0, r.drawnCount),
      drawnCount: r.drawnCount,
      potMinor: r.potMinor,
      houseFeeMinor: r.houseFeeMinor,
      prizeMinor: r.prizeMinor,
      winningPattern: r.winningPattern,
      winnerUsernames: winIds.map((id) => usernameMap.get(id) || `Player #${id}`),
      winningCardIndices: rWinTickets.map((t) => t.cardIndex),
      winningTicketsDetails: rWinTickets.map((t) => ({
        ticketId: t.id,
        cardIndex: t.cardIndex,
        userId: t.userId,
        username: usernameMap.get(t.userId) || `Player #${t.userId}`,
        cardGrid: JSON.parse(t.cardGridJson) as BingoCardGrid,
        payoutMinor: t.payoutMinor,
      })),
      didCurrentUserWin: winIds.includes(currentUserId),
      cancelReason: r.cancelReason,
    };
  });

  if (!round) {
    return {
      serverTimeUtc: new Date().toISOString(),
      maintenance,
      room,
      activeRound: null,
      recentRounds,
      bettingSchedule: synced.bettingSchedule || (await getGameBettingSchedule()),
    };
  }

  const myTickets = roundTickets
    .filter((t) => t.userId === currentUserId)
    .map((t) => ({
      id: t.id,
      cardIndex: t.cardIndex,
      cardGrid: JSON.parse(t.cardGridJson) as BingoCardGrid,
      pricePaidMinor: t.pricePaidMinor,
      claimedAt: t.claimedAt?.toISOString() || null,
      claimValid: t.claimValid,
      payoutMinor: t.payoutMinor,
    }));

  const myPurchasedCardIndices = myTickets.map((t) => t.cardIndex);
  const purchasedByOthersCardIndices = roundTickets
    .filter((t) => t.userId !== currentUserId)
    .map((t) => t.cardIndex);
  const purchasedCardIndices = roundTickets.map((t) => t.cardIndex);
  const activeLocks = round.status === 'OPEN' ? getRoundCardLocks(round.id) : [];
  const reservedByOthersCardIndices = activeLocks
    .filter((l) => l.userId !== currentUserId && !purchasedCardIndices.includes(l.cardIndex))
    .map((l) => l.cardIndex);
  const myReservedCardIndices = activeLocks
    .filter((l) => l.userId === currentUserId && !purchasedCardIndices.includes(l.cardIndex))
    .map((l) => l.cardIndex);

  const takenByOthersCardIndices = Array.from(
    new Set([...purchasedByOthersCardIndices, ...reservedByOthersCardIndices])
  );
  // Union of purchased cards and cards actively selected/reserved by other players in real time
  const takenCardIndices = Array.from(
    new Set([...purchasedCardIndices, ...reservedByOthersCardIndices])
  );

  const distinctPlayersCount = new Set(roundTickets.map((t) => t.userId)).size;
  const minRequiredPlayers = Math.max(2, room.minPlayers || 2);
  const hasEnoughToStart = distinctPlayersCount >= minRequiredPlayers;
  const waitingForMinPlayers = round.status === 'OPEN' && !hasEnoughToStart;

  const calledNumbers = draws.map((d) => d.ballNumber);
  const currentBall = calledNumbers.length > 0 ? calledNumbers[calledNumbers.length - 1] : null;
  const last5Balls = calledNumbers.slice(-5).reverse();

  // Determine participant vs spectator mode:
  // If round is LOCKED or DRAWING and the user holds 0 tickets in this round, they are a SPECTATOR!
  const isParticipant = myTickets.length > 0;
  const isSpectator =
    (round.status === 'LOCKED' || round.status === 'DRAWING' || round.status === 'SETTLED') &&
    !isParticipant;

  const effectiveTicketPriceMinor =
    round.status === 'OPEN'
      ? room.ticketPriceMinor
      : roundTickets.length > 0
      ? roundTickets[0].pricePaidMinor
      : room.ticketPriceMinor;
  const math = calculateRoundPayouts({
    ticketCount: roundTickets.length,
    ticketPriceMinor: effectiveTicketPriceMinor,
    houseFeeBps: room.houseFeeBps,
    winnerIds: [],
  });

  const roundWinUserIds: number[] = JSON.parse(round.winnerUserIdsJson || '[]');
  const roundWinnerUsernames = roundWinUserIds.map((id) => usernameMap.get(id) || `Player #${id}`);
  const winningTicketsList = roundTickets.filter((t) => t.claimValid);
  const winningCardIndices = winningTicketsList.map((t) => t.cardIndex);
  const winningTicketsDetails = winningTicketsList.map((t) => ({
    ticketId: t.id,
    cardIndex: t.cardIndex,
    userId: t.userId,
    username: usernameMap.get(t.userId) || `Player #${t.userId}`,
    cardGrid: JSON.parse(t.cardGridJson) as BingoCardGrid,
    payoutMinor: t.payoutMinor,
  }));
  const didCurrentUserWin = roundWinUserIds.includes(currentUserId);
  const nextRoundOpensAt =
    round.status === 'SETTLED' && round.settledAt
      ? new Date(round.settledAt.getTime() + 15000).toISOString()
      : null;

  return {
    serverTimeUtc: new Date().toISOString(),
    maintenance,
    room: {
      id: room.id,
      slug: room.slug,
      nameEn: room.nameEn,
      nameAm: room.nameAm,
      ticketPriceMinor: room.ticketPriceMinor,
      pattern: room.pattern,
      minPlayers: minRequiredPlayers,
      minCardsPerPlayer: room.minCardsPerPlayer,
      maxCardsPerPlayer: room.maxCardsPerPlayer,
      houseFeeBps: room.houseFeeBps,
      drawIntervalSeconds: room.drawIntervalSeconds,
      cadenceSeconds: room.cadenceSeconds,
      isPractice: room.isPractice,
    },
    activeRound: {
      id: round.id,
      status: round.status,
      startsAt: round.startsAt.toISOString(),
      settledAt: round.settledAt?.toISOString() || null,
      nextRoundOpensAt,
      winningPattern: round.winningPattern || room.pattern,
      serverSeedHash: round.serverSeedHash,
      // NEVER expose serverSeed while round is active!
      serverSeed: round.status === 'SETTLED' || round.status === 'CANCELLED' ? round.serverSeed : null,
      drawnCount: calledNumbers.length,
      calledNumbers,
      currentBall,
      last5Balls,
      totalTickets: roundTickets.length,
      playerCount: distinctPlayersCount,
      minRequiredPlayers,
      waitingForMinPlayers,
      potMinor: math.potMinor,
      houseFeeMinor: math.baseHouseFeeMinor,
      prizeMinor: math.netPrizeMinor,
      takenCardIndices,
      takenByOthersCardIndices,
      myPurchasedCardIndices,
      purchasedCardIndices,
      reservedByOthersCardIndices,
      myReservedCardIndices,
      myTickets,
      isParticipant,
      isSpectator,
      winnerUsernames: roundWinnerUsernames,
      winningCardIndices,
      winningTicketsDetails,
      didCurrentUserWin,
    },
    recentRounds,
    bettingSchedule: synced.bettingSchedule || (await getGameBettingSchedule()),
  };
}
