import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { eq, desc, and, gte } from 'drizzle-orm';
import { db } from '@/src/db/index';
import {
  wallets,
  ledgerEntries,
  deposits,
  withdrawals,
  users,
  selfExclusions,
  notifications,
} from '@/src/db/schema';
import { authenticatePlayerRequest, recordAuditLog, getClientIp } from '@/src/lib/auth';
import { executeLedgerTransfer } from '@/src/lib/ledger';
import { getPaymentProvider } from '@/src/lib/payments';

export async function GET(req: NextRequest) {
  const authResult = await authenticatePlayerRequest(req);
  if (!authResult.ok) return authResult.response;
  const user = authResult.user;

  try {
    const userWallets = await db.select().from(wallets).where(eq(wallets.userId, user.id));
    const wallet = userWallets[0] || {
      balanceMinor: 0,
      lockedMinor: 0,
      playBalanceMinor: 100000,
    };

    const historyEntries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, user.id))
      .orderBy(desc(ledgerEntries.id))
      .limit(40);

    const userDepositsRaw = await db
      .select({
        id: deposits.id,
        userId: deposits.userId,
        amountMinor: deposits.amountMinor,
        provider: deposits.provider,
        transactionRef: deposits.transactionRef,
        status: deposits.status,
        decidedByAdminId: deposits.decidedByAdminId,
        decisionReason: deposits.decisionReason,
        createdAt: deposits.createdAt,
        decidedAt: deposits.decidedAt,
      })
      .from(deposits)
      .where(eq(deposits.userId, user.id))
      .orderBy(desc(deposits.id))
      .limit(20);

    const userWithdrawals = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, user.id))
      .orderBy(desc(withdrawals.id))
      .limit(20);

    return NextResponse.json({
      serverTimeUtc: new Date().toISOString(),
      wallet: {
        balanceMinor: wallet.balanceMinor,
        lockedMinor: wallet.lockedMinor,
        playBalanceMinor: wallet.playBalanceMinor,
      },
      ledger: historyEntries,
      deposits: userDepositsRaw,
      withdrawals: userWithdrawals,
    });
  } catch (error) {
    console.error('Error loading wallet data:', error);
    return NextResponse.json({ error: 'Failed to load wallet history' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const action = body?.action;

  // 1. DEPOSIT REQUEST (Status = PENDING; wallet is NOT credited until Admin approves!)
  if (action === 'request_deposit') {
    const authResult = await authenticatePlayerRequest(req, { checkSelfExclusion: true });
    if (!authResult.ok) return authResult.response;
    const user = authResult.user;

    const amountMinor = Number(body?.amountMinor);
    const providerName = String(body?.provider || 'TELEBIRR').toUpperCase();
    const rawRef = String(body?.transactionRef || '').trim().toUpperCase();
    const proofDataUrl = body?.proofDataUrl ? String(body.proofDataUrl) : null;

    // If player uploaded a screenshot without typing a reference ID, auto-generate a unique reference
    const transactionRef =
      rawRef.length >= 3
        ? rawRef.slice(0, 64)
        : proofDataUrl
        ? `SCR-${Date.now().toString().slice(-8)}-${user.id}`
        : '';

    const idempotencyKey = String(body?.idempotencyKey || `dep_req_${user.id}_${transactionRef}_${Date.now()}`);

    if (!Number.isInteger(amountMinor) || amountMinor < 1000 || amountMinor > 10000000) {
      return NextResponse.json(
        { error: 'የገቢ መጠን ከ 10.00 ብር እስከ 100,000.00 ብር መሆን አለበት (Deposit must be 10–100,000 Birr)' },
        { status: 400 }
      );
    }

    if (!proofDataUrl && transactionRef.length < 3) {
      return NextResponse.json(
        {
          error:
            'እባክዎ ገቢ ያደረጉበትን ደረሰኝ (Screenshot) ያያይዙ ወይም የትራንዛክሽን ቁጥር ያስገቡ (Please attach your payment screenshot or transaction reference)',
        },
        { status: 400 }
      );
    }

    if (proofDataUrl && proofDataUrl.length > 4500000) {
      return NextResponse.json(
        { error: 'የደረሰኝ ፎቶው መጠን በጣም ትልቅ ነው (Screenshot image is too large)' },
        { status: 400 }
      );
    }

    try {
      // Check Responsible Gaming Daily Deposit Limit (last 24h)
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentDeposits = await db
        .select()
        .from(deposits)
        .where(and(eq(deposits.userId, user.id), gte(deposits.createdAt, since24h)));

      const totalRecentMinor = recentDeposits
        .filter((d) => d.status !== 'REJECTED')
        .reduce((sum, d) => sum + d.amountMinor, 0);

      if (totalRecentMinor + amountMinor > user.dailyDepositLimitMinor) {
        return NextResponse.json(
          {
            error: `Daily deposit limit (${(user.dailyDepositLimitMinor / 100).toFixed(2)} Birr) exceeded. You can adjust limits in Responsible Gaming settings.`,
          },
          { status: 400 }
        );
      }

      // Check duplicate transactionRef so one payment cannot be claimed twice
      const existingRef = await db
        .select()
        .from(deposits)
        .where(eq(deposits.transactionRef, transactionRef));

      if (existingRef.length > 0) {
        return NextResponse.json(
          { error: 'ይህ የትራንዛክሽን ቁጥር ቀደም ብሎ ተልኳል (Duplicate transaction reference ID).' },
          { status: 409 }
        );
      }

      const provider = getPaymentProvider(providerName);
      const initInfo = await provider.initiateDeposit({
        userId: user.id,
        amountMinor,
        transactionRef,
      });

      const inserted = await db
        .insert(deposits)
        .values({
          userId: user.id,
          amountMinor,
          provider: provider.name,
          transactionRef,
          proofDataUrl,
          status: 'PENDING', // Mandatory Admin approval required!
          idempotencyKey,
        })
        .returning();

      await recordAuditLog({
        actorUserId: user.id,
        actorUsername: user.displayUsername,
        action: 'DEPOSIT_REQUEST_SUBMITTED',
        metadata: { depositId: inserted[0].id, amountMinor, provider: provider.name, transactionRef },
        ipAddress: ip,
      });

      return NextResponse.json({
        ok: true,
        deposit: inserted[0],
        instructionsEn: initInfo.instructionsEn,
        instructionsAm: initInfo.instructionsAm,
      });
    } catch (error) {
      console.error('Deposit request error:', error);
      return NextResponse.json({ error: 'Failed to submit deposit request' }, { status: 500 });
    }
  }

  // 2. WITHDRAWAL REQUEST (Immediately holds amount: balance -> locked, Status = PENDING)
  if (action === 'request_withdrawal') {
    const authResult = await authenticatePlayerRequest(req);
    if (!authResult.ok) return authResult.response;
    const user = authResult.user;

    const amountMinor = Number(body?.amountMinor);
    const providerName = String(body?.provider || 'TELEBIRR').toUpperCase();
    const payoutAccount = String(body?.payoutAccount || '').trim();
    const idempotencyKey = String(body?.idempotencyKey || `wd_req_${user.id}_${Date.now()}`);

    if (!Number.isInteger(amountMinor) || amountMinor < 10000 || amountMinor > 5000000) {
      return NextResponse.json(
        { error: 'ዝቅተኛው ወጪ ማዘዝ የሚቻለው መጠን 100.00 ብር ነው (ከ 100.00 ብር እስከ 50,000.00 ብር) · Minimum withdrawal is 100.00 Birr' },
        { status: 400 }
      );
    }

    if (payoutAccount.length < 5 || payoutAccount.length > 64) {
      return NextResponse.json(
        { error: 'እባክዎ ትክክለኛ የቴሌብር ስልክ ቁጥር ወይም የንግድ ባንክ አካውንት ያስገቡ (Please enter a valid phone or bank account)' },
        { status: 400 }
      );
    }

    try {
      // Rule: A player can have only ONE pending withdrawal at a time
      const pendingList = await db
        .select()
        .from(withdrawals)
        .where(and(eq(withdrawals.userId, user.id), eq(withdrawals.status, 'PENDING')));

      if (pendingList.length > 0) {
        return NextResponse.json(
          { error: 'You already have a pending withdrawal request awaiting admin review.' },
          { status: 409 }
        );
      }

      // Hold the funds immediately in the wallet & append-only ledger (SELECT ... FOR UPDATE)
      await executeLedgerTransfer({
        userId: user.id,
        type: 'WITHDRAW_HOLD',
        amountMinor,
        idempotencyKey: `hold_${idempotencyKey}`,
        note: `Withdrawal hold to ${providerName} (${payoutAccount})`,
      });

      const inserted = await db
        .insert(withdrawals)
        .values({
          userId: user.id,
          amountMinor,
          provider: providerName,
          payoutAccount,
          status: 'PENDING',
          idempotencyKey,
        })
        .returning();

      await recordAuditLog({
        actorUserId: user.id,
        actorUsername: user.displayUsername,
        action: 'WITHDRAWAL_REQUEST_SUBMITTED',
        metadata: { withdrawalId: inserted[0].id, amountMinor, provider: providerName, payoutAccount },
        ipAddress: ip,
      });

      return NextResponse.json({
        ok: true,
        withdrawal: inserted[0],
      });
    } catch (error: any) {
      if (error?.message?.includes('INSUFFICIENT_FUNDS')) {
        return NextResponse.json(
          { error: 'Insufficient available wallet balance for this withdrawal.' },
          { status: 400 }
        );
      }
      console.error('Withdrawal request error:', error);
      return NextResponse.json({ error: 'Failed to submit withdrawal request' }, { status: 500 });
    }
  }

  // 3. TOP UP FREE PRACTICE BALANCE
  if (action === 'topup_practice') {
    const authResult = await authenticatePlayerRequest(req);
    if (!authResult.ok) return authResult.response;
    const user = authResult.user;

    try {
      const userWallets = await db.select().from(wallets).where(eq(wallets.userId, user.id));
      if (userWallets[0]) {
        await db
          .update(wallets)
          .set({
            playBalanceMinor: userWallets[0].playBalanceMinor + 100000, // +1,000.00 Play ETB
            updatedAt: new Date(),
          })
          .where(eq(wallets.id, userWallets[0].id));
      }
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Failed to top up practice balance' }, { status: 500 });
    }
  }

  // 4. RESPONSIBLE GAMING: Deposit Limits & Self-Exclusion
  if (action === 'set_deposit_limit') {
    const authResult = await authenticatePlayerRequest(req);
    if (!authResult.ok) return authResult.response;
    const user = authResult.user;

    const newLimitMinor = Number(body?.dailyDepositLimitMinor);
    if (!Number.isInteger(newLimitMinor) || newLimitMinor < 5000 || newLimitMinor > 5000000) {
      return NextResponse.json(
        { error: 'Daily deposit limit must be between 50.00 Birr and 50,000.00 Birr' },
        { status: 400 }
      );
    }

    try {
      // Phase 8 Rule: Decrease takes effect immediately; increase takes effect after a 24-hour delay!
      if (newLimitMinor <= user.dailyDepositLimitMinor) {
        await db
          .update(users)
          .set({
            dailyDepositLimitMinor: newLimitMinor,
            pendingLimitMinor: null,
            pendingLimitEffectiveAt: null,
          })
          .where(eq(users.id, user.id));

        await recordAuditLog({
          actorUserId: user.id,
          actorUsername: user.displayUsername,
          action: 'DEPOSIT_LIMIT_DECREASED_IMMEDIATE',
          metadata: { oldLimitMinor: user.dailyDepositLimitMinor, newLimitMinor },
          ipAddress: ip,
        });

        return NextResponse.json({
          ok: true,
          immediate: true,
          message: 'Your lower daily deposit limit is now in effect immediately.',
        });
      } else {
        const effectiveAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db
          .update(users)
          .set({
            pendingLimitMinor: newLimitMinor,
            pendingLimitEffectiveAt: effectiveAt,
          })
          .where(eq(users.id, user.id));

        await recordAuditLog({
          actorUserId: user.id,
          actorUsername: user.displayUsername,
          action: 'DEPOSIT_LIMIT_INCREASE_SCHEDULED',
          metadata: {
            currentLimitMinor: user.dailyDepositLimitMinor,
            pendingLimitMinor: newLimitMinor,
            effectiveAt: effectiveAt.toISOString(),
          },
          ipAddress: ip,
        });

        return NextResponse.json({
          ok: true,
          immediate: false,
          effectiveAt: effectiveAt.toISOString(),
          message: 'Deposit limit increase scheduled. Per Responsible Gaming rules, increases take effect after a 24-hour cooling-off period.',
        });
      }
    } catch {
      return NextResponse.json({ error: 'Failed to update deposit limit' }, { status: 500 });
    }
  }

  if (action === 'self_exclude') {
    return NextResponse.json(
      { error: 'Self-Exclusion (Cool-Off Break) is disabled.' },
      { status: 400 }
    );
  }

  if (action === 'mark_notifications_read') {
    const authResult = await authenticatePlayerRequest(req);
    if (!authResult.ok) return authResult.response;

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, authResult.user.id));

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown wallet action' }, { status: 400 });
}
