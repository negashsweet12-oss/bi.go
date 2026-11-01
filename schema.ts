import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  username: text('username').notNull().unique(),
  displayUsername: text('display_username').notNull(),
  passwordHash: text('password_hash').notNull(),
  phone: text('phone'),
  dob: text('dob').notNull(),
  role: text('role').notNull().default('player'), // 'player' | 'admin'
  status: text('status').notNull().default('ACTIVE'), // 'ACTIVE' | 'BLOCKED' | 'SELF_EXCLUDED'
  blockedReason: text('blocked_reason'),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until'),
  sessionVersion: integer('session_version').notNull().default(1),
  activeSessionId: text('active_session_id'),
  lastIp: text('last_ip'),
  deviceFingerprint: text('device_fingerprint'),
  termsAcceptedAt: timestamp('terms_accepted_at').defaultNow().notNull(),
  termsVersion: text('terms_version').notNull().default('1.0'),
  dailyDepositLimitMinor: integer('daily_deposit_limit_minor').notNull().default(500000), // 5,000.00 ETB default
  pendingLimitMinor: integer('pending_limit_minor'),
  pendingLimitEffectiveAt: timestamp('pending_limit_effective_at'),
  lastActiveAt: timestamp('last_active_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const wallets = pgTable('wallets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull()
    .unique(),
  balanceMinor: integer('balance_minor').notNull().default(2000), // 20.00 ETB Welcome Bonus for new players
  lockedMinor: integer('locked_minor').notNull().default(0),
  playBalanceMinor: integer('play_balance_minor').notNull().default(100000), // 1,000.00 Play ETB
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const ledgerEntries = pgTable('ledger_entries', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  type: text('type').notNull(), // 'WELCOME_BONUS' | 'DEPOSIT_CREDIT' | 'WITHDRAW_HOLD' | 'WITHDRAW_COMPLETE' | 'WITHDRAW_RELEASE' | 'BUY_TICKET' | 'PAYOUT' | 'HOUSE_FEE' | 'REFUND' | 'MANUAL_ADJUSTMENT'
  amountMinor: integer('amount_minor').notNull(),
  lockedDeltaMinor: integer('locked_delta_minor').notNull().default(0),
  balanceAfterMinor: integer('balance_after_minor').notNull(),
  lockedAfterMinor: integer('locked_after_minor').notNull().default(0),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  referenceId: text('reference_id'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const rooms = pgTable('rooms', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nameEn: text('name_en').notNull(),
  nameAm: text('name_am').notNull(),
  ticketPriceMinor: integer('ticket_price_minor').notNull(),
  pattern: text('pattern').notNull().default('ANY_LINE'), // 'ANY_LINE' | 'FOUR_CORNERS' | 'FULL_HOUSE'
  minPlayers: integer('min_players').notNull().default(2),
  minCardsPerPlayer: integer('min_cards_per_player').notNull().default(1),
  maxCardsPerPlayer: integer('max_cards_per_player').notNull().default(4),
  houseFeeBps: integer('house_fee_bps').notNull().default(2300), // 23%
  drawIntervalSeconds: integer('draw_interval_seconds').notNull().default(3),
  cadenceSeconds: integer('cadence_seconds').notNull().default(90),
  isPractice: boolean('is_practice').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const rounds = pgTable('rounds', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id')
    .references(() => rooms.id)
    .notNull(),
  status: text('status').notNull().default('OPEN'), // 'OPEN' | 'LOCKED' | 'DRAWING' | 'SETTLED' | 'CANCELLED'
  startsAt: timestamp('starts_at').notNull(),
  serverSeed: text('server_seed').notNull(),
  serverSeedHash: text('server_seed_hash').notNull(),
  drawSequenceJson: text('draw_sequence_json').notNull(),
  drawnCount: integer('drawn_count').notNull().default(0),
  lastDrawAt: timestamp('last_draw_at'),
  potMinor: integer('pot_minor').notNull().default(0),
  houseFeeMinor: integer('house_fee_minor').notNull().default(0),
  prizeMinor: integer('prize_minor').notNull().default(0),
  winningPattern: text('winning_pattern').notNull().default('ANY_LINE'),
  winnerUserIdsJson: text('winner_user_ids_json').notNull().default('[]'),
  cancelReason: text('cancel_reason'),
  settledAt: timestamp('settled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const roundDraws = pgTable('round_draws', {
  id: serial('id').primaryKey(),
  roundId: integer('round_id')
    .references(() => rounds.id)
    .notNull(),
  drawOrder: integer('draw_order').notNull(),
  ballNumber: integer('ball_number').notNull(),
  drawnAt: timestamp('drawn_at').defaultNow().notNull(),
});

export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  roundId: integer('round_id')
    .references(() => rounds.id)
    .notNull(),
  roomId: integer('room_id')
    .references(() => rooms.id)
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  cardIndex: integer('card_index').notNull(),
  cardGridJson: text('card_grid_json').notNull(),
  pricePaidMinor: integer('price_paid_minor').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  claimedAt: timestamp('claimed_at'),
  claimValid: boolean('claim_valid'),
  payoutMinor: integer('payout_minor').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const payouts = pgTable('payouts', {
  id: serial('id').primaryKey(),
  roundId: integer('round_id')
    .references(() => rounds.id)
    .notNull(),
  ticketId: integer('ticket_id')
    .references(() => tickets.id)
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  amountMinor: integer('amount_minor').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const deposits = pgTable('deposits', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  amountMinor: integer('amount_minor').notNull(),
  provider: text('provider').notNull().default('TELEBIRR'),
  transactionRef: text('transaction_ref').notNull().unique(),
  proofDataUrl: text('proof_data_url'),
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'APPROVED' | 'REJECTED'
  decidedByAdminId: integer('decided_by_admin_id'),
  decisionReason: text('decision_reason'),
  decidedAt: timestamp('decided_at'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const withdrawals = pgTable('withdrawals', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  amountMinor: integer('amount_minor').notNull(),
  provider: text('provider').notNull().default('TELEBIRR'),
  payoutAccount: text('payout_account').notNull(),
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'APPROVED' | 'REJECTED'
  decidedByAdminId: integer('decided_by_admin_id'),
  decisionReason: text('decision_reason'),
  decidedAt: timestamp('decided_at'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const selfExclusions = pgTable('self_exclusions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  reason: text('reason'),
  startsAt: timestamp('starts_at').defaultNow().notNull(),
  endsAt: timestamp('ends_at').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUserId: integer('actor_user_id'),
  actorUsername: text('actor_username'),
  targetUserId: integer('target_user_id'),
  targetUsername: text('target_username'),
  action: text('action').notNull(),
  reason: text('reason'),
  metadataJson: text('metadata_json'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  type: text('type').notNull(),
  titleEn: text('title_en').notNull(),
  titleAm: text('title_am').notNull(),
  bodyEn: text('body_en').notNull(),
  bodyAm: text('body_am').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const passwordResets = pgTable('password_resets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  username: text('username').notNull(),
  phone: text('phone'),
  notes: text('notes'),
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'RESOLVED' | 'REJECTED'
  tempPasswordPlain: text('temp_password_plain'),
  rejectionReason: text('rejection_reason'),
  decidedByAdminId: integer('decided_by_admin_id'),
  decidedAt: timestamp('decided_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  wallet: one(wallets, {
    fields: [users.id],
    references: [wallets.userId],
  }),
  ledgerEntries: many(ledgerEntries),
  tickets: many(tickets),
  deposits: many(deposits),
  withdrawals: many(withdrawals),
  notifications: many(notifications),
}));
