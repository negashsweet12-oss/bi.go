import { describe, it, expect } from 'vitest';
import { computeWalletStateTransition, LedgerTransferInput, LedgerTransferResult } from './ledger';

/**
 * In-memory mutex-serialized transactional simulator that mirrors PostgreSQL SELECT ... FOR UPDATE
 * to test 1000 parallel purchases, idempotency replay, withdrawal holds/releases, and zero-drift reconciliation.
 */
class TransactionalLedgerSimulator {
  private balanceMinor = 0;
  private lockedMinor = 0;
  private entries: LedgerTransferResult[] = [];
  private byIdempotencyKey = new Map<string, LedgerTransferResult>();
  private lockChain: Promise<void> = Promise.resolve();

  async transfer(input: LedgerTransferInput): Promise<LedgerTransferResult> {
    // Acquire row-level lock (simulates PostgreSQL SELECT ... FOR UPDATE)
    let release!: () => void;
    const prevLock = this.lockChain;
    this.lockChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prevLock;

    try {
      const existing = this.byIdempotencyKey.get(input.idempotencyKey);
      if (existing) {
        return { ...existing, replayed: true };
      }

      const transition = computeWalletStateTransition(this.balanceMinor, this.lockedMinor, input);
      this.balanceMinor = transition.nextBalanceMinor;
      this.lockedMinor = transition.nextLockedMinor;

      const entry: LedgerTransferResult = {
        entryId: this.entries.length + 1,
        userId: input.userId,
        type: input.type,
        amountMinor: transition.signedBalanceDeltaMinor,
        lockedDeltaMinor: transition.signedLockedDeltaMinor,
        balanceAfterMinor: this.balanceMinor,
        lockedAfterMinor: this.lockedMinor,
        idempotencyKey: input.idempotencyKey,
        replayed: false,
      };
      this.entries.push(entry);
      this.byIdempotencyKey.set(input.idempotencyKey, entry);
      return entry;
    } finally {
      release();
    }
  }

  reconcile() {
    const sumBalance = this.entries.reduce((acc, e) => acc + e.amountMinor, 0);
    const sumLocked = this.entries.reduce((acc, e) => acc + e.lockedDeltaMinor, 0);
    return {
      balanceMinor: this.balanceMinor,
      lockedMinor: this.lockedMinor,
      sumBalance,
      sumLocked,
      drift: Math.abs(this.balanceMinor - sumBalance) + Math.abs(this.lockedMinor - sumLocked),
    };
  }
}

describe('Phase 4: Wallet & Append-Only Integer Ledger', () => {
  it('replays the same idempotency key without double-crediting or double-spending', async () => {
    const sim = new TransactionalLedgerSimulator();

    const first = await sim.transfer({
      userId: 1,
      type: 'DEPOSIT_CREDIT',
      amountMinor: 50000, // 500.00 ETB
      idempotencyKey: 'dep-approve-101',
    });
    expect(first.replayed).toBe(false);
    expect(first.balanceAfterMinor).toBe(50000);

    const second = await sim.transfer({
      userId: 1,
      type: 'DEPOSIT_CREDIT',
      amountMinor: 50000,
      idempotencyKey: 'dep-approve-101',
    });
    expect(second.replayed).toBe(true);
    expect(second.balanceAfterMinor).toBe(50000);
    expect(sim.reconcile().drift).toBe(0);
  });

  it('handles 1000 parallel ticket purchases on one wallet without ever overdrawing or double-spending', async () => {
    const sim = new TransactionalLedgerSimulator();

    // Fund wallet with 100,000 santim (1,000.00 ETB), enough for exactly 100 tickets at 1,000 santim (10.00 ETB) each
    await sim.transfer({
      userId: 1,
      type: 'DEPOSIT_CREDIT',
      amountMinor: 100000,
      idempotencyKey: 'initial-deposit-1000-birr',
    });

    // Fire 1000 concurrent purchase requests of 1,000 santim each
    const results = await Promise.allSettled(
      Array.from({ length: 1000 }, (_, idx) =>
        sim.transfer({
          userId: 1,
          type: 'BUY_TICKET',
          amountMinor: 1000,
          idempotencyKey: `buy-ticket-concurrent-${idx}`,
        })
      )
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 100 purchases must succeed and 900 must fail with INSUFFICIENT_FUNDS
    expect(succeeded).toHaveLength(100);
    expect(rejected).toHaveLength(900);

    const rec = sim.reconcile();
    expect(rec.balanceMinor).toBe(0);
    expect(rec.sumBalance).toBe(0);
    expect(rec.drift).toBe(0);
  });

  it('correctly holds, releases, and completes withdrawals', async () => {
    const sim = new TransactionalLedgerSimulator();
    await sim.transfer({
      userId: 1,
      type: 'DEPOSIT_CREDIT',
      amountMinor: 20000, // 200.00 ETB
      idempotencyKey: 'dep-1',
    });

    // Request withdrawal of 80.00 ETB (8000 santim) -> held in lockedMinor
    const hold = await sim.transfer({
      userId: 1,
      type: 'WITHDRAW_HOLD',
      amountMinor: 8000,
      idempotencyKey: 'wd-hold-1',
    });
    expect(hold.balanceAfterMinor).toBe(12000);
    expect(hold.lockedAfterMinor).toBe(8000);

    // Reject withdrawal -> releases hold back to available balance
    const release = await sim.transfer({
      userId: 1,
      type: 'WITHDRAW_RELEASE',
      amountMinor: 8000,
      idempotencyKey: 'wd-release-1',
    });
    expect(release.balanceAfterMinor).toBe(20000);
    expect(release.lockedAfterMinor).toBe(0);

    // Second withdrawal request & approval -> completes hold
    await sim.transfer({
      userId: 1,
      type: 'WITHDRAW_HOLD',
      amountMinor: 5000,
      idempotencyKey: 'wd-hold-2',
    });
    const complete = await sim.transfer({
      userId: 1,
      type: 'WITHDRAW_COMPLETE',
      amountMinor: 5000,
      idempotencyKey: 'wd-complete-2',
    });
    expect(complete.balanceAfterMinor).toBe(15000);
    expect(complete.lockedAfterMinor).toBe(0);
    expect(sim.reconcile().drift).toBe(0);
  });
});
