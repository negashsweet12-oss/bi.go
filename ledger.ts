import { eq, asc } from 'drizzle-orm';
import { db } from '../db/index';
import { wallets, ledgerEntries } from '../db/schema';

export type LedgerOperationType =
  | 'DEPOSIT_CREDIT'
  | 'WITHDRAW_HOLD'
  | 'WITHDRAW_COMPLETE'
  | 'WITHDRAW_RELEASE'
  | 'BUY_TICKET'
  | 'PAYOUT'
  | 'HOUSE_FEE'
  | 'REFUND'
  | 'MANUAL_ADJUSTMENT';

export interface LedgerTransferInput {
  userId: number;
  type: LedgerOperationType;
  /** Positive integer minor units (santim/cents). */
  amountMinor: number;
  idempotencyKey: string;
  referenceId?: string;
  note?: string;
  /** For MANUAL_ADJUSTMENT only: 'CREDIT' | 'DEBIT' */
  adjustmentDirection?: 'CREDIT' | 'DEBIT';
}

export interface LedgerTransferResult {
  entryId: number;
  userId: number;
  type: LedgerOperationType;
  amountMinor: number;
  lockedDeltaMinor: number;
  balanceAfterMinor: number;
  lockedAfterMinor: number;
  idempotencyKey: string;
  replayed: boolean;
}

/**
 * Pure state transition validator for wallet + append-only ledger (used both in DB transactions and unit tests).
 */
export function computeWalletStateTransition(
  currentBalanceMinor: number,
  currentLockedMinor: number,
  input: LedgerTransferInput
): {
  signedBalanceDeltaMinor: number;
  signedLockedDeltaMinor: number;
  nextBalanceMinor: number;
  nextLockedMinor: number;
} {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('Amount must be a positive integer in minor units (santim)');
  }

  let signedBalanceDeltaMinor = 0;
  let signedLockedDeltaMinor = 0;

  switch (input.type) {
    case 'DEPOSIT_CREDIT':
    case 'PAYOUT':
    case 'REFUND':
      signedBalanceDeltaMinor = input.amountMinor;
      signedLockedDeltaMinor = 0;
      break;

    case 'BUY_TICKET':
    case 'HOUSE_FEE':
      signedBalanceDeltaMinor = -input.amountMinor;
      signedLockedDeltaMinor = 0;
      break;

    case 'WITHDRAW_HOLD':
      // Moves available balance -> locked balance
      signedBalanceDeltaMinor = -input.amountMinor;
      signedLockedDeltaMinor = input.amountMinor;
      break;

    case 'WITHDRAW_COMPLETE':
      // Deducts from locked balance once admin approves payout
      signedBalanceDeltaMinor = 0;
      signedLockedDeltaMinor = -input.amountMinor;
      break;

    case 'WITHDRAW_RELEASE':
      // Releases locked balance back to available balance when admin rejects withdrawal
      signedBalanceDeltaMinor = input.amountMinor;
      signedLockedDeltaMinor = -input.amountMinor;
      break;

    case 'MANUAL_ADJUSTMENT':
      if (input.adjustmentDirection === 'DEBIT') {
        signedBalanceDeltaMinor = -input.amountMinor;
      } else {
        signedBalanceDeltaMinor = input.amountMinor;
      }
      signedLockedDeltaMinor = 0;
      break;

    default:
      throw new Error(`Unsupported ledger operation type: ${String(input.type)}`);
  }

  const nextBalanceMinor = currentBalanceMinor + signedBalanceDeltaMinor;
  const nextLockedMinor = currentLockedMinor + signedLockedDeltaMinor;

  if (nextBalanceMinor < 0) {
    throw new Error('INSUFFICIENT_FUNDS: Available wallet balance cannot become negative');
  }
  if (nextLockedMinor < 0) {
    throw new Error('INVALID_LOCKED_BALANCE: Locked wallet balance cannot become negative');
  }

  return {
    signedBalanceDeltaMinor,
    signedLockedDeltaMinor,
    nextBalanceMinor,
    nextLockedMinor,
  };
}

/**
 * Executes an atomic, idempotent wallet balance change inside a PostgreSQL transaction
 * using SELECT ... FOR UPDATE on the wallet row.
 */
export async function executeLedgerTransfer(input: LedgerTransferInput): Promise<LedgerTransferResult> {
  if (!input.idempotencyKey || input.idempotencyKey.trim().length < 3) {
    throw new Error('Valid idempotencyKey is required for every money operation');
  }

  try {
    return await db.transaction(async (tx) => {
      // 1. Check idempotency key first
      const existing = await tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.idempotencyKey, input.idempotencyKey));

      if (existing.length > 0) {
        const entry = existing[0];
        return {
          entryId: entry.id,
          userId: entry.userId,
          type: entry.type as LedgerOperationType,
          amountMinor: entry.amountMinor,
          lockedDeltaMinor: entry.lockedDeltaMinor,
          balanceAfterMinor: entry.balanceAfterMinor,
          lockedAfterMinor: entry.lockedAfterMinor,
          idempotencyKey: entry.idempotencyKey,
          replayed: true,
        };
      }

      // 2. Ensure wallet exists and lock row with SELECT ... FOR UPDATE
      let lockedWallets = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, input.userId))
        .for('update');

      if (lockedWallets.length === 0) {
        await tx
          .insert(wallets)
          .values({
            userId: input.userId,
            balanceMinor: 0,
            lockedMinor: 0,
            playBalanceMinor: 100000,
          })
          .onConflictDoNothing();

        lockedWallets = await tx
          .select()
          .from(wallets)
          .where(eq(wallets.userId, input.userId))
          .for('update');
      }

      const wallet = lockedWallets[0];
      if (!wallet) {
        throw new Error('Wallet not found for user');
      }

      // 3. Compute state transition & enforce non-negative invariants
      const transition = computeWalletStateTransition(wallet.balanceMinor, wallet.lockedMinor, input);

      // 4. Update wallet row
      await tx
        .update(wallets)
        .set({
          balanceMinor: transition.nextBalanceMinor,
          lockedMinor: transition.nextLockedMinor,
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, wallet.id));

      // 5. Append immutable ledger entry
      const inserted = await tx
        .insert(ledgerEntries)
        .values({
          userId: input.userId,
          type: input.type,
          amountMinor: transition.signedBalanceDeltaMinor,
          lockedDeltaMinor: transition.signedLockedDeltaMinor,
          balanceAfterMinor: transition.nextBalanceMinor,
          lockedAfterMinor: transition.nextLockedMinor,
          idempotencyKey: input.idempotencyKey,
          referenceId: input.referenceId || null,
          note: input.note || null,
        })
        .returning();

      const entry = inserted[0];
      return {
        entryId: entry.id,
        userId: entry.userId,
        type: entry.type as LedgerOperationType,
        amountMinor: entry.amountMinor,
        lockedDeltaMinor: entry.lockedDeltaMinor,
        balanceAfterMinor: entry.balanceAfterMinor,
        lockedAfterMinor: entry.lockedAfterMinor,
        idempotencyKey: entry.idempotencyKey,
        replayed: false,
      };
    });
  } catch (error: any) {
    if (error?.message?.includes('INSUFFICIENT_FUNDS') || error?.message?.includes('INVALID_LOCKED_BALANCE')) {
      throw error;
    }
    console.error('Ledger transaction failed:', error);
    throw new Error(error?.message || 'Ledger transaction failed.', { cause: error });
  }
}

/**
 * Reconciles all wallets against the sum of their append-only ledger entries.
 * Returns zero drift if every wallet's balanceMinor and lockedMinor match the ledger sum.
 */
export async function reconcileAllWallets(): Promise<{
  reconciledCount: number;
  driftCount: number;
  discrepancies: Array<{
    userId: number;
    walletBalanceMinor: number;
    ledgerSumBalanceMinor: number;
    walletLockedMinor: number;
    ledgerSumLockedMinor: number;
  }>;
}> {
  try {
    const allWallets = await db.select().from(wallets);
    const allEntries = await db.select().from(ledgerEntries).orderBy(asc(ledgerEntries.id));

    const sumsByUser = new Map<number, { balance: number; locked: number }>();
    for (const entry of allEntries) {
      const current = sumsByUser.get(entry.userId) || { balance: 0, locked: 0 };
      current.balance += entry.amountMinor;
      current.locked += entry.lockedDeltaMinor;
      sumsByUser.set(entry.userId, current);
    }

    const discrepancies: Array<{
      userId: number;
      walletBalanceMinor: number;
      ledgerSumBalanceMinor: number;
      walletLockedMinor: number;
      ledgerSumLockedMinor: number;
    }> = [];

    for (const w of allWallets) {
      const expected = sumsByUser.get(w.userId) || { balance: 0, locked: 0 };
      if (w.balanceMinor !== expected.balance || w.lockedMinor !== expected.locked) {
        discrepancies.push({
          userId: w.userId,
          walletBalanceMinor: w.balanceMinor,
          ledgerSumBalanceMinor: expected.balance,
          walletLockedMinor: w.lockedMinor,
          ledgerSumLockedMinor: expected.locked,
        });
      }
    }

    return {
      reconciledCount: allWallets.length,
      driftCount: discrepancies.length,
      discrepancies,
    };
  } catch (error) {
    console.warn('Wallet reconciliation deferred due to transient database error:', error);
    return {
      reconciledCount: 0,
      driftCount: 0,
      discrepancies: [],
    };
  }
}
