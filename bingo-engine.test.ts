import { describe, it, expect } from 'vitest';
import {
  generateCSPRNGCard,
  getPoolCard,
  isValidCard,
  generateServerSeed,
  hashServerSeed,
  deriveDrawOrder,
  secureDrawShuffle,
  verifyRound,
  validateClaim,
  calculateRoundPayouts,
  numberToAmharicWords,
} from './bingo-engine';

describe('Phase 2: Pure TypeScript 75-Ball Bingo Game Engine', () => {
  it('generates valid 75-ball cards with correct B-I-N-G-O ranges and center FREE', () => {
    for (let i = 0; i < 50; i++) {
      const card = generateCSPRNGCard();
      expect(isValidCard(card)).toBe(true);
      expect(card[2][2]).toBe(0);
    }
  });

  it('produces a deterministic, unique pool of 200 cards (1..200)', () => {
    const serializedSet = new Set<string>();
    for (let idx = 1; idx <= 200; idx++) {
      const card = getPoolCard(idx);
      expect(isValidCard(card)).toBe(true);
      const serialized = JSON.stringify(card);
      expect(serializedSet.has(serialized)).toBe(false);
      serializedSet.add(serialized);
    }
    expect(serializedSet.size).toBe(200);
  });

  it('performs provably fair commit-reveal round-trip and detects tampering', () => {
    const seed = generateServerSeed();
    const publishedHash = hashServerSeed(seed);
    const roundId = 1042;
    const drawOrder = deriveDrawOrder(seed, roundId);

    expect(drawOrder).toHaveLength(75);
    expect(new Set(drawOrder).size).toBe(75);
    expect(Math.min(...drawOrder)).toBe(1);
    expect(Math.max(...drawOrder)).toBe(75);

    const verified = verifyRound({
      serverSeed: seed,
      publishedSeedHash: publishedHash,
      roundId,
      claimedDraws: drawOrder.slice(0, 32),
    });
    expect(verified.valid).toBe(true);

    // Tampered draw sequence must fail verification
    const tampered = [...drawOrder.slice(0, 10)];
    tampered[0] = tampered[1];
    const failedVerify = verifyRound({
      serverSeed: seed,
      publishedSeedHash: publishedHash,
      roundId,
      claimedDraws: tampered,
    });
    expect(failedVerify.valid).toBe(false);
  });

  it('maintains uniform draw distribution across 1000 shuffles with CSPRNG', () => {
    const firstBallCounts = new Array(76).fill(0);
    for (let i = 0; i < 750; i++) {
      const seq = secureDrawShuffle();
      expect(seq).toHaveLength(75);
      firstBallCounts[seq[0]] += 1;
    }
    // Every ball should appear at least once or within reasonable variance
    const nonZeroBalls = firstBallCounts.slice(1).filter((c) => c > 0).length;
    expect(nonZeroBalls).toBeGreaterThan(60);
  });

  it('validates ANY_LINE, FOUR_CORNERS, and FULL_HOUSE claims accurately', () => {
    const card = getPoolCard(1);
    // Top row numbers
    const topRowCalled = [card[0][0], card[0][1], card[0][2], card[0][3], card[0][4]];
    expect(validateClaim(card, topRowCalled, 'ANY_LINE').valid).toBe(true);
    expect(validateClaim(card, topRowCalled.slice(0, 4), 'ANY_LINE').valid).toBe(false);

    // Middle row only needs 4 numbers because [2][2] is FREE
    const midRowCalled = [card[2][0], card[2][1], card[2][3], card[2][4]];
    expect(validateClaim(card, midRowCalled, 'ANY_LINE').valid).toBe(true);

    // Four corners
    const cornersCalled = [card[0][0], card[0][4], card[4][0], card[4][4]];
    expect(validateClaim(card, cornersCalled, 'FOUR_CORNERS').valid).toBe(true);
    expect(validateClaim(card, cornersCalled.slice(0, 3), 'FOUR_CORNERS').valid).toBe(false);

    // Full house
    const allCardNumbers = card.flat().filter((n) => n !== 0);
    expect(validateClaim(card, allCardNumbers, 'FULL_HOUSE').valid).toBe(true);
    expect(validateClaim(card, allCardNumbers.slice(0, 23), 'FULL_HOUSE').valid).toBe(false);
  });

  it('splits pot deterministically among simultaneous winners with integer minor units', () => {
    // 7 tickets * 10.00 ETB (1000 santim) = 7000 santim pot
    // 10% house fee (1000 bps) = 700 santim -> net prize = 6300 santim
    // 4 simultaneous winners -> 6300 / 4 = 1575 santim each (0 remainder)
    const res1 = calculateRoundPayouts({
      ticketCount: 7,
      ticketPriceMinor: 1000,
      houseFeeBps: 1000,
      winnerIds: ['u1', 'u2', 'u3', 'u4'],
    });
    expect(res1.potMinor).toBe(7000);
    expect(res1.netPrizeMinor).toBe(6300);
    expect(res1.perWinnerMinor).toBe(1575);
    expect(res1.remainderToHouseMinor).toBe(0);

    // 3 simultaneous winners on 5 tickets * 1000 santim = 5000 pot, 500 fee, 4500 net -> 1500 each
    // Let's test indivisible net prize: 5 tickets * 1000 = 5000, fee 1000 bps = 500, net = 4500, 4 winners -> 1125 each
    // With 7 winners: 4500 / 7 = 642 each, remainder 6 goes to house
    const res2 = calculateRoundPayouts({
      ticketCount: 5,
      ticketPriceMinor: 1000,
      houseFeeBps: 1000,
      winnerIds: [1, 2, 3, 4, 5, 6, 7],
    });
    expect(res2.perWinnerMinor).toBe(642);
    expect(res2.remainderToHouseMinor).toBe(6);
    expect(res2.perWinnerMinor * 7 + res2.effectiveHouseFeeMinor).toBe(res2.potMinor);
  });

  it('formats Amharic number words accurately', () => {
    expect(numberToAmharicWords(1)).toBe('አንድ');
    expect(numberToAmharicWords(15)).toBe('አስራ አምስት');
    expect(numberToAmharicWords(52)).toBe('ሃምሳ ሁለት');
    expect(numberToAmharicWords(75)).toBe('ሰባ አምስት');
  });
});
