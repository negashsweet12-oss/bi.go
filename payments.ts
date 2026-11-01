import crypto from 'crypto';

export const OFFICIAL_TELEBIRR_NUMBER = '0915306343';
export const OFFICIAL_CBE_ACCOUNT = '1000389879928';

export interface DepositInitPayload {
  userId: number;
  amountMinor: number;
  transactionRef: string;
}

export interface PayoutInitPayload {
  withdrawalId: number;
  userId: number;
  amountMinor: number;
  payoutAccount: string;
}

export interface PaymentProvider {
  readonly name: 'MOCK' | 'TELEBIRR' | 'CHAPA' | 'CBE_BIRR';
  initiateDeposit(payload: DepositInitPayload): Promise<{
    providerRef: string;
    instructionsEn: string;
    instructionsAm: string;
  }>;
  verifyWebhook(rawBody: string, signatureHeader: string): boolean;
  initiatePayout(payload: PayoutInitPayload): Promise<{
    payoutRef: string;
    dispatchedAt: string;
  }>;
}

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'telebirr-chapa-webhook-hmac-secret';

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'MOCK' as const;

  async initiateDeposit(payload: DepositInitPayload) {
    return {
      providerRef: `MOCK-DEP-${payload.transactionRef}`,
      instructionsEn: 'Deposit request submitted. Waiting for Admin verification & approval.',
      instructionsAm: 'የገቢ ጥያቄዎ ወደ አድሚን ተልኳል። አድሚኑ ሲያጸድቀው ወደ ቦርሳዎ ይገባል።',
    };
  }

  verifyWebhook(rawBody: string, signatureHeader: string): boolean {
    const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
    return signatureHeader === expected;
  }

  async initiatePayout(payload: PayoutInitPayload) {
    return {
      payoutRef: `MOCK-PAYOUT-${payload.withdrawalId}-${Date.now()}`,
      dispatchedAt: new Date().toISOString(),
    };
  }
}

export class TelebirrChapaPaymentProvider implements PaymentProvider {
  readonly name: 'TELEBIRR' | 'CHAPA' | 'CBE_BIRR';

  constructor(providerName: 'TELEBIRR' | 'CHAPA' | 'CBE_BIRR' = 'TELEBIRR') {
    this.name = providerName;
  }

  async initiateDeposit(payload: DepositInitPayload) {
    const methodLabelAm =
      this.name === 'TELEBIRR'
        ? `ቴሌብር (${OFFICIAL_TELEBIRR_NUMBER})`
        : this.name === 'CBE_BIRR'
        ? `የኢትዮጵያ ንግድ ባንክ CBE (${OFFICIAL_CBE_ACCOUNT})`
        : this.name;
    return {
      providerRef: `${this.name}-${payload.transactionRef}`,
      instructionsEn: `Your deposit request & screenshot via ${this.name} (Ref: ${payload.transactionRef}) has been sent to the Admin. Your wallet will be credited as soon as the Admin approves it.`,
      instructionsAm: `በ ${methodLabelAm} የላኩት የገቢ ጥያቄ እና ደረሰኝ (Screenshot) ወደ አድሚን ተልኳል (ቁጥር: ${payload.transactionRef})። አድሚኑ ሲያጸድቀው ወዲያውኑ ወደ ቦርሳዎ ይገባል!`,
    };
  }

  verifyWebhook(rawBody: string, signatureHeader: string): boolean {
    try {
      const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
      const a = Buffer.from(signatureHeader);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  async initiatePayout(payload: PayoutInitPayload) {
    return {
      payoutRef: `${this.name}-OUT-${payload.withdrawalId}-${Date.now()}`,
      dispatchedAt: new Date().toISOString(),
    };
  }
}

export function getPaymentProvider(providerName: string): PaymentProvider {
  if (providerName === 'MOCK') return new MockPaymentProvider();
  if (providerName === 'CHAPA') return new TelebirrChapaPaymentProvider('CHAPA');
  if (providerName === 'CBE_BIRR' || providerName === 'CBE') return new TelebirrChapaPaymentProvider('CBE_BIRR');
  return new TelebirrChapaPaymentProvider('TELEBIRR');
}
