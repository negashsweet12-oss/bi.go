import crypto from 'crypto';

export type BingoPattern =
  | 'ANY_LINE'
  | 'ONE_LINE'
  | 'TWO_LINES'
  | 'THREE_LINES'
  | 'FOUR_LINES'
  | 'FOUR_CORNERS'
  | 'FULL_HOUSE';

// 5x5 matrix indexed [row][col], where col 0=B, 1=I, 2=N, 3=G, 4=O. Center [2][2] is 0 (FREE).
export type BingoCardGrid = number[][];

export const COLUMN_RANGES: ReadonlyArray<{ letter: 'B' | 'I' | 'N' | 'G' | 'O'; min: number; max: number }> = [
  { letter: 'B', min: 1, max: 15 },
  { letter: 'I', min: 16, max: 30 },
  { letter: 'N', min: 31, max: 45 },
  { letter: 'G', min: 46, max: 60 },
  { letter: 'O', min: 61, max: 75 },
];

export const STANDARD_12_LINES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // 5 Horizontal Rows
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]],
  [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]],
  [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4]],
  [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4]],
  // 5 Vertical Columns
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
  [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]],
  [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3]],
  [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4]],
  // 2 Main Diagonals
  [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]],
  [[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]],
];

export const FOUR_CORNERS_MASK: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0, 4],
  [4, 0],
  [4, 4],
];

export const FULL_HOUSE_MASK: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
  [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
  [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
  [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
  [4, 0], [4, 1], [4, 2], [4, 3], [4, 4],
];

export const WINNING_PATTERN_OPTIONS: ReadonlyArray<{
  value: BingoPattern;
  labelAm: string;
  labelEn: string;
  descAm: string;
  descEn: string;
  requiredLines?: number;
}> = [
  {
    value: 'ONE_LINE',
    labelAm: 'አንድ ዝግ (1 Line / 4 Corners)',
    labelEn: '1 Line or 4 Corners (አንድ ዝግ)',
    descAm: 'ማንኛውም 1 መስመር (አግድም፣ ቁልቁል፣ ሰያፍ) ወይም 4 ማዕዘን (4 Corners) ሲዘጋ ያሸንፋሉ',
    descEn: 'Complete any 1 horizontal, vertical, diagonal line OR all 4 Corners to win',
    requiredLines: 1,
  },
  {
    value: 'TWO_LINES',
    labelAm: 'ሁለት ዝግ (2 Lines)',
    labelEn: '2 Lines (ሁለት ዝግ)',
    descAm: 'በአንድ ካርቴላ ላይ ማንኛውም 2 መስመሮች (4 ማዕዘንን ጨምሮ) ሲዘጉ ያሸንፋሉ',
    descEn: 'Complete any 2 lines/patterns (including 4 Corners) on the same cartela to win',
    requiredLines: 2,
  },
  {
    value: 'THREE_LINES',
    labelAm: 'ሶስት ዝግ (3 Lines)',
    labelEn: '3 Lines (ሶስት ዝግ)',
    descAm: 'በአንድ ካርቴላ ላይ ማንኛውም 3 መስመሮች (4 ማዕዘንን ጨምሮ) ሲዘጉ ያሸንፋሉ',
    descEn: 'Complete any 3 lines/patterns (including 4 Corners) on the same cartela to win',
    requiredLines: 3,
  },
  {
    value: 'FOUR_LINES',
    labelAm: 'አራት ዝግ (4 Lines)',
    labelEn: '4 Lines (አራት ዝግ)',
    descAm: 'በአንድ ካርቴላ ላይ ማንኛውም 4 መስመሮች (4 ማዕዘንን ጨምሮ) ሲዘጉ ያሸንፋሉ',
    descEn: 'Complete any 4 lines/patterns (including 4 Corners) on the same cartela to win',
    requiredLines: 4,
  },
  {
    value: 'FOUR_CORNERS',
    labelAm: 'አራት ማዕዘን ብቻ (4 Corners)',
    labelEn: 'Four Corners (አራት ማዕዘን)',
    descAm: 'የካርቴላው 4ቱም ጠርዞች (ማዕዘኖች) ሲዘጉ ያሸንፋሉ',
    descEn: 'Complete all 4 corner numbers on your cartela to win',
  },
  {
    value: 'FULL_HOUSE',
    labelAm: 'ሙሉ ዝግ / ሙሉ ካርቴላ (Full House)',
    labelEn: 'Full House (ሙሉ ዝግ)',
    descAm: 'በካርቴላው ላይ ያሉት ሁሉም 24 ቁጥሮች ሲዘጉ ያሸንፋሉ',
    descEn: 'Complete all numbers on the cartela to win',
  },
];

export function getPatternMeta(pattern: string) {
  const normalized = pattern === 'ANY_LINE' ? 'ONE_LINE' : pattern;
  return (
    WINNING_PATTERN_OPTIONS.find((p) => p.value === normalized) || WINNING_PATTERN_OPTIONS[0]
  );
}

export function getPatternLabel(pattern: string, lang: 'am' | 'en' = 'am'): string {
  const meta = getPatternMeta(pattern);
  return lang === 'am' ? meta.labelAm : meta.labelEn;
}

export function getPatternDescription(pattern: string, lang: 'am' | 'en' = 'am'): string {
  const meta = getPatternMeta(pattern);
  return lang === 'am' ? meta.descAm : meta.descEn;
}

/**
 * Generates an unbiased integer in [0, maxExclusive) from HMAC-SHA256 stream using rejection sampling.
 */
function createDeterministicUnbiasedRng(key: string, context: string): (maxExclusive: number) => number {
  let counter = 0;
  let buffer = Buffer.alloc(0);
  let offset = 0;

  const nextUint32 = (): number => {
    if (offset + 4 > buffer.length) {
      buffer = crypto
        .createHmac('sha256', key)
        .update(`${context}:${counter}`)
        .digest();
      counter += 1;
      offset = 0;
    }
    const val = buffer.readUInt32BE(offset);
    offset += 4;
    return val;
  };

  return (maxExclusive: number): number => {
    if (maxExclusive <= 1) return 0;
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    while (true) {
      const candidate = nextUint32();
      if (candidate < limit) {
        return candidate % maxExclusive;
      }
    }
  };
}

/**
 * Generates a 75-ball Bingo card using cryptographically secure RNG (crypto.randomInt, never Math.random).
 */
export function generateCSPRNGCard(): BingoCardGrid {
  const cols: number[][] = [];
  for (let c = 0; c < 5; c++) {
    const { min, max } = COLUMN_RANGES[c];
    const pool: number[] = [];
    for (let n = min; n <= max; n++) pool.push(n);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    cols.push(pool.slice(0, 5));
  }

  const grid: BingoCardGrid = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      grid[r][c] = r === 2 && c === 2 ? 0 : cols[c][r];
    }
  }
  return grid;
}

const FIXED_CARD_POOL_CACHE = new Map<number, BingoCardGrid>();

export function getPoolCard(cardIndex: number): BingoCardGrid {
  if (!Number.isInteger(cardIndex) || cardIndex < 1 || cardIndex > 400) {
    throw new Error('Card index must be an integer between 1 and 400');
  }
  const cached = FIXED_CARD_POOL_CACHE.get(cardIndex);
  if (cached) return cached;

  const rng = createDeterministicUnbiasedRng('HABESHA_BINGO_CARD_POOL_V1', `card:${cardIndex}`);
  const cols: number[][] = [];

  for (let c = 0; c < 5; c++) {
    const { min, max } = COLUMN_RANGES[c];
    const pool: number[] = [];
    for (let n = min; n <= max; n++) pool.push(n);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng(i + 1);
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    cols.push(pool.slice(0, 5));
  }

  const grid: BingoCardGrid = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      grid[r][c] = r === 2 && c === 2 ? 0 : cols[c][r];
    }
  }
  FIXED_CARD_POOL_CACHE.set(cardIndex, grid);
  return grid;
}

export function isValidCard(grid: BingoCardGrid): boolean {
  if (!Array.isArray(grid) || grid.length !== 5) return false;
  for (let r = 0; r < 5; r++) {
    if (!Array.isArray(grid[r]) || grid[r].length !== 5) return false;
  }
  if (grid[2][2] !== 0) return false;

  for (let c = 0; c < 5; c++) {
    const { min, max } = COLUMN_RANGES[c];
    const seen = new Set<number>();
    for (let r = 0; r < 5; r++) {
      if (r === 2 && c === 2) continue;
      const val = grid[r][c];
      if (!Number.isInteger(val) || val < min || val > max) return false;
      if (seen.has(val)) return false;
      seen.add(val);
    }
  }
  return true;
}

export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashServerSeed(serverSeed: string): string {
  return crypto.createHash('sha256').update(serverSeed, 'utf8').digest('hex');
}

export function deriveDrawOrder(serverSeed: string, roundId: string | number): number[] {
  const rng = createDeterministicUnbiasedRng(serverSeed, `round:${String(roundId)}`);
  const balls = Array.from({ length: 75 }, (_, idx) => idx + 1);
  for (let i = balls.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    const tmp = balls[i];
    balls[i] = balls[j];
    balls[j] = tmp;
  }
  return balls;
}

export function secureDrawShuffle(): number[] {
  const balls = Array.from({ length: 75 }, (_, idx) => idx + 1);
  for (let i = balls.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = balls[i];
    balls[i] = balls[j];
    balls[j] = tmp;
  }
  return balls;
}

/**
 * Dynamically calculates a 75-ball draw sequence so that `targetCardGrid` completes
 * the required `pattern` (e.g., 1 Line, 4 Corners, 2-4 Lines, or Full House) FIRST
 * before any card in `competitorGrids`, while interleaving natural random filler balls
 * so the call sequence looks completely organic and random to players.
 */
export function generateTargetedDrawSequence(params: {
  targetCardGrid: BingoCardGrid;
  competitorGrids?: BingoCardGrid[];
  pattern: BingoPattern | string;
  alreadyDrawn?: number[];
}): number[] {
  const { targetCardGrid, competitorGrids = [], pattern, alreadyDrawn = [] } = params;
  if (!isValidCard(targetCardGrid)) {
    return secureDrawShuffle();
  }

  const validCompetitors = competitorGrids.filter((g) => isValidCard(g));
  const alreadySet = new Set<number>(alreadyDrawn.filter((n) => n >= 1 && n <= 75));
  const prefix = Array.from(alreadySet);

  const getNumsForMask = (mask: ReadonlyArray<readonly [number, number]>): number[] => {
    const nums: number[] = [];
    for (const [r, c] of mask) {
      const val = targetCardGrid[r][c];
      if (val >= 1 && val <= 75 && !nums.includes(val)) {
        nums.push(val);
      }
    }
    return nums;
  };

  const shuffleArray = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  };

  const all13Masks: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    ...STANDARD_12_LINES,
    FOUR_CORNERS_MASK,
  ];
  const normalizedPattern = pattern === 'ANY_LINE' ? 'ONE_LINE' : pattern;

  let candidateWinningSets: number[][] = [];

  if (normalizedPattern === 'FOUR_CORNERS') {
    candidateWinningSets = [getNumsForMask(FOUR_CORNERS_MASK)];
  } else if (normalizedPattern === 'FULL_HOUSE') {
    candidateWinningSets = [getNumsForMask(FULL_HOUSE_MASK)];
  } else if (normalizedPattern === 'ONE_LINE') {
    const shuffledMasks = shuffleArray([...all13Masks]);
    candidateWinningSets = shuffledMasks.map((m) => getNumsForMask(m));
  } else {
    const requiredLinesMap: Record<string, number> = {
      TWO_LINES: 2,
      THREE_LINES: 3,
      FOUR_LINES: 4,
    };
    const reqCount = requiredLinesMap[normalizedPattern] ?? 1;
    for (let attempt = 0; attempt < 24; attempt++) {
      const pickedMasks = shuffleArray([...all13Masks]).slice(0, reqCount);
      const combined: number[] = [];
      for (const m of pickedMasks) {
        for (const n of getNumsForMask(m)) {
          if (!combined.includes(n)) combined.push(n);
        }
      }
      candidateWinningSets.push(combined);
    }
  }

  // Pick a winning set on the target card that minimizes (ideally 0) competitor wins when combined with alreadyDrawn
  let chosenWinSet = candidateWinningSets[0] || getNumsForMask(FOUR_CORNERS_MASK);
  let bestConflictCount = Number.POSITIVE_INFINITY;

  for (const cand of candidateWinningSets) {
    const testCalled = Array.from(new Set([...prefix, ...cand]));
    let conflicts = 0;
    for (const comp of validCompetitors) {
      if (validateClaim(comp, testCalled, normalizedPattern).valid) {
        conflicts += 1;
      }
    }
    if (conflicts < bestConflictCount) {
      bestConflictCount = conflicts;
      chosenWinSet = cand;
      if (conflicts === 0) break;
    }
  }

  const remainingToWin = shuffleArray(chosenWinSet.filter((n) => !alreadySet.has(n)));

  // If the target card has already completed the pattern, just append the remaining balls shuffled
  if (remainingToWin.length === 0) {
    const rest: number[] = [];
    for (let n = 1; n <= 75; n++) {
      if (!alreadySet.has(n)) rest.push(n);
    }
    return [...prefix, ...shuffleArray(rest)];
  }

  const clincherBall = remainingToWin[remainingToWin.length - 1];
  const preWinTargetBalls = remainingToWin.slice(0, -1);

  // Choose a natural total ball count for the winning moment so gameplay feels organic and suspenseful
  let naturalWinOrder: number;
  if (normalizedPattern === 'ONE_LINE' || normalizedPattern === 'FOUR_CORNERS') {
    naturalWinOrder = crypto.randomInt(15, 24); // Wins naturally around ball #15 - #23
  } else if (normalizedPattern === 'TWO_LINES') {
    naturalWinOrder = crypto.randomInt(22, 31);
  } else if (normalizedPattern === 'THREE_LINES') {
    naturalWinOrder = crypto.randomInt(28, 37);
  } else if (normalizedPattern === 'FOUR_LINES') {
    naturalWinOrder = crypto.randomInt(34, 43);
  } else {
    naturalWinOrder = crypto.randomInt(46, 56);
  }

  const desiredFillerCount =
    prefix.length === 0
      ? Math.max(6, naturalWinOrder - remainingToWin.length)
      : crypto.randomInt(4, 9);

  // Build candidate filler pool: mix some non-winning numbers from target & competitor cards with general balls
  const reservedSet = new Set<number>([...prefix, ...remainingToWin]);
  const allOtherBalls: number[] = [];
  for (let n = 1; n <= 75; n++) {
    if (!reservedSet.has(n)) {
      allOtherBalls.push(n);
    }
  }
  const shuffledCandidates = shuffleArray(allOtherBalls);

  const safeFillerBalls: number[] = [];
  const simulatedWithClincher = new Set<number>([...prefix, ...remainingToWin]);
  const simulatedPreClincher = new Set<number>([...prefix, ...preWinTargetBalls]);

  for (const candidateBall of shuffledCandidates) {
    if (safeFillerBalls.length >= desiredFillerCount) break;

    // 1. Ensure target card does NOT win prematurely before clincherBall
    const testTargetPre = [...simulatedPreClincher, candidateBall];
    if (validateClaim(targetCardGrid, testTargetPre, normalizedPattern).valid) {
      continue;
    }

    // 2. Ensure NO competitor card can win at any point up to and including clincherBall
    const testCompetitorFull = [...simulatedWithClincher, candidateBall];
    const anyCompetitorWins = validCompetitors.some(
      (comp) => validateClaim(comp, testCompetitorFull, normalizedPattern).valid
    );
    if (anyCompetitorWins) {
      continue;
    }

    safeFillerBalls.push(candidateBall);
    simulatedPreClincher.add(candidateBall);
    simulatedWithClincher.add(candidateBall);
  }

  // Shuffle preWinTargetBalls and safeFillerBalls together so target card hits are naturally spaced out
  const preClincherSequence = shuffleArray([...preWinTargetBalls, ...safeFillerBalls]);

  const usedBalls = new Set<number>([...prefix, ...preClincherSequence, clincherBall]);
  const postWinBalls: number[] = [];
  for (let n = 1; n <= 75; n++) {
    if (!usedBalls.has(n)) {
      postWinBalls.push(n);
    }
  }

  return [...prefix, ...preClincherSequence, clincherBall, ...shuffleArray(postWinBalls)];
}

export function verifyRound(params: {
  serverSeed: string;
  publishedSeedHash: string;
  roundId: string | number;
  claimedDraws?: number[];
}): {
  valid: boolean;
  computedHash: string;
  derivedSequence: number[];
  reason?: string;
} {
  const computedHash = hashServerSeed(params.serverSeed);
  if (computedHash.toLowerCase() !== params.publishedSeedHash.toLowerCase()) {
    return {
      valid: false,
      computedHash,
      derivedSequence: [],
      reason: 'SHA256(serverSeed) does not match published seed hash commitment',
    };
  }
  const derivedSequence = deriveDrawOrder(params.serverSeed, params.roundId);
  if (params.claimedDraws && params.claimedDraws.length > 0) {
    if (params.claimedDraws.length > 75) {
      return {
        valid: false,
        computedHash,
        derivedSequence,
        reason: 'Claimed draws exceed 75 balls',
      };
    }
    for (let i = 0; i < params.claimedDraws.length; i++) {
      if (params.claimedDraws[i] !== derivedSequence[i]) {
        return {
          valid: false,
          computedHash,
          derivedSequence,
          reason: `Draw mismatch at index ${i}: expected ${derivedSequence[i]}, got ${params.claimedDraws[i]}`,
        };
      }
    }
  }
  return {
    valid: true,
    computedHash,
    derivedSequence,
  };
}

/**
 * Counts how many lines/patterns (5 rows, 5 columns, 2 diagonals, plus 4 Corners = 13 possible patterns)
 * are completed on a 5x5 Bingo card, and validates against the active room/round Winning Pattern (ዝግ):
 * - 4 Corners ([0,0], [0,4], [4,0], [4,4]) counts as 1 Completed Line / Pattern (1 ዝግ)
 * - ONE_LINE / ANY_LINE: >= 1 line/pattern completed (including 4 Corners)
 * - TWO_LINES: >= 2 lines/patterns completed (including 4 Corners)
 * - THREE_LINES: >= 3 lines/patterns completed (including 4 Corners)
 * - FOUR_LINES: >= 4 lines/patterns completed (including 4 Corners)
 * - FOUR_CORNERS: all 4 corner cells completed
 * - FULL_HOUSE: all 25 cells completed
 */
export function validateClaim(
  cardGrid: BingoCardGrid,
  calledNumbers: ReadonlyArray<number>,
  pattern: BingoPattern | string
): {
  valid: boolean;
  completedLinesCount: number;
  requiredLinesCount: number;
  winningCells: [number, number][];
  fourCornersCompleted: boolean;
  matchedCornersCount: number;
} {
  if (!isValidCard(cardGrid)) {
    return {
      valid: false,
      completedLinesCount: 0,
      requiredLinesCount: 1,
      winningCells: [],
      fourCornersCompleted: false,
      matchedCornersCount: 0,
    };
  }
  const calledSet = new Set<number>(calledNumbers);
  calledSet.add(0); // Center FREE space is always daubed

  // 1. Count completed standard lines (5 horizontal rows + 5 vertical columns + 2 diagonals)
  const completedLineCells: [number, number][] = [];
  let completedLinesCount = 0;

  for (const lineMask of STANDARD_12_LINES) {
    const allDaubed = lineMask.every(([r, c]) => calledSet.has(cardGrid[r][c]));
    if (allDaubed) {
      completedLinesCount += 1;
      for (const [r, c] of lineMask) {
        completedLineCells.push([r, c]);
      }
    }
  }

  // 2. Check 4 Corners: Top-Left (0,0), Top-Right (0,4), Bottom-Left (4,0), Bottom-Right (4,4)
  let matchedCornersCount = 0;
  for (const [r, c] of FOUR_CORNERS_MASK) {
    if (calledSet.has(cardGrid[r][c])) {
      matchedCornersCount += 1;
    }
  }
  const fourCornersCompleted = matchedCornersCount === 4;

  // Treat all 4 Corners completed as 1 valid completed line / pattern (1 ዝግ)
  if (fourCornersCompleted) {
    completedLinesCount += 1;
    for (const [r, c] of FOUR_CORNERS_MASK) {
      completedLineCells.push([r, c]);
    }
  }

  const normalizedPattern = pattern === 'ANY_LINE' ? 'ONE_LINE' : pattern;

  if (normalizedPattern === 'FOUR_CORNERS') {
    return {
      valid: fourCornersCompleted,
      completedLinesCount: fourCornersCompleted ? Math.max(1, completedLinesCount) : 0,
      requiredLinesCount: 1,
      winningCells: fourCornersCompleted ? FOUR_CORNERS_MASK.map(([r, c]) => [r, c]) : [],
      fourCornersCompleted,
      matchedCornersCount,
    };
  }

  if (normalizedPattern === 'FULL_HOUSE') {
    const fullValid = FULL_HOUSE_MASK.every(([r, c]) => calledSet.has(cardGrid[r][c]));
    return {
      valid: fullValid,
      completedLinesCount,
      requiredLinesCount: 5,
      winningCells: fullValid ? FULL_HOUSE_MASK.map(([r, c]) => [r, c]) : completedLineCells,
      fourCornersCompleted,
      matchedCornersCount,
    };
  }

  const requiredLinesMap: Record<string, number> = {
    ONE_LINE: 1,
    TWO_LINES: 2,
    THREE_LINES: 3,
    FOUR_LINES: 4,
  };
  const requiredLinesCount = requiredLinesMap[normalizedPattern] ?? 1;
  const isValid = completedLinesCount >= requiredLinesCount;

  return {
    valid: isValid,
    completedLinesCount,
    requiredLinesCount,
    winningCells: completedLineCells,
    fourCornersCompleted,
    matchedCornersCount,
  };
}

export function calculateRoundPayouts(params: {
  ticketCount: number;
  ticketPriceMinor: number;
  houseFeeBps: number;
  winnerIds: ReadonlyArray<number | string>;
}): {
  potMinor: number;
  baseHouseFeeMinor: number;
  netPrizeMinor: number;
  perWinnerMinor: number;
  remainderToHouseMinor: number;
  effectiveHouseFeeMinor: number;
  payoutsByWinner: Array<{ winnerId: number | string; amountMinor: number }>;
} {
  if (
    !Number.isInteger(params.ticketCount) ||
    params.ticketCount < 0 ||
    !Number.isInteger(params.ticketPriceMinor) ||
    params.ticketPriceMinor < 0 ||
    !Number.isInteger(params.houseFeeBps) ||
    params.houseFeeBps < 0 ||
    params.houseFeeBps > 10000
  ) {
    throw new Error('All money and fee parameters must be valid non-negative integers');
  }

  const potMinor = params.ticketCount * params.ticketPriceMinor;
  const baseHouseFeeMinor = Math.floor((potMinor * params.houseFeeBps) / 10000);
  const netPrizeMinor = potMinor - baseHouseFeeMinor;

  const winnerCount = params.winnerIds.length;
  if (winnerCount === 0) {
    return {
      potMinor,
      baseHouseFeeMinor,
      netPrizeMinor,
      perWinnerMinor: 0,
      remainderToHouseMinor: 0,
      effectiveHouseFeeMinor: baseHouseFeeMinor,
      payoutsByWinner: [],
    };
  }

  const perWinnerMinor = Math.floor(netPrizeMinor / winnerCount);
  const remainderToHouseMinor = netPrizeMinor - perWinnerMinor * winnerCount;
  const effectiveHouseFeeMinor = baseHouseFeeMinor + remainderToHouseMinor;

  const payoutsByWinner = params.winnerIds.map((winnerId) => ({
    winnerId,
    amountMinor: perWinnerMinor,
  }));

  return {
    potMinor,
    baseHouseFeeMinor,
    netPrizeMinor,
    perWinnerMinor,
    remainderToHouseMinor,
    effectiveHouseFeeMinor,
    payoutsByWinner,
  };
}

export function getBallLetter(ball: number): 'B' | 'I' | 'N' | 'G' | 'O' {
  if (ball <= 15) return 'B';
  if (ball <= 30) return 'I';
  if (ball <= 45) return 'N';
  if (ball <= 60) return 'G';
  return 'O';
}

export function formatBallLabel(ball: number): string {
  return `${getBallLetter(ball)}-${ball}`;
}

export function formatEtb(minorUnits: number, lang: 'en' | 'am' = 'en'): string {
  const birr = minorUnits / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(birr);
  return lang === 'am' ? `${formatted} ብር` : `${formatted} Birr`;
}

const AMHARIC_TENS: Record<number, string> = {
  10: 'አስር',
  20: 'ሃያ',
  30: 'ሰላሳ',
  40: 'አርባ',
  50: 'ሃምሳ',
  60: 'ስልሳ',
  70: 'ሰባ',
};

const AMHARIC_ONES: Record<number, string> = {
  1: 'አንድ',
  2: 'ሁለት',
  3: 'ሶስት',
  4: 'አራት',
  5: 'አምስት',
  6: 'ስድስት',
  7: 'ሰባት',
  8: 'ስምንት',
  9: 'ዘጠኝ',
};

const AMHARIC_TENS_PHONETIC: Record<number, string> = {
  10: 'Asir',
  20: 'Haya',
  30: 'Selasa',
  40: 'Arba',
  50: 'Hamsa',
  60: 'Silsa',
  70: 'Seba',
};

const AMHARIC_ONES_PHONETIC: Record<number, string> = {
  1: 'Aand',
  2: 'Hulet',
  3: 'Sost',
  4: 'Arat',
  5: 'Amist',
  6: 'Sidist',
  7: 'Sebat',
  8: 'Simint',
  9: 'Zetegn',
};

export function numberToAmharicWords(n: number): string {
  if (n < 1 || n > 75) return String(n);
  if (n <= 9) return AMHARIC_ONES[n];
  if (n % 10 === 0) return AMHARIC_TENS[n];
  if (n < 20) {
    return `አስራ ${AMHARIC_ONES[n - 10]}`;
  }
  const ten = Math.floor(n / 10) * 10;
  const one = n % 10;
  return `${AMHARIC_TENS[ten]} ${AMHARIC_ONES[one]}`;
}

export function numberToAmharicPhonetic(n: number): string {
  if (n < 1 || n > 75) return String(n);
  if (n <= 9) return AMHARIC_ONES_PHONETIC[n];
  if (n % 10 === 0) return AMHARIC_TENS_PHONETIC[n];
  if (n < 20) {
    return `Asra ${AMHARIC_ONES_PHONETIC[n - 10]}`;
  }
  const ten = Math.floor(n / 10) * 10;
  const one = n % 10;
  return `${AMHARIC_TENS_PHONETIC[ten]} ${AMHARIC_ONES_PHONETIC[one]}`;
}

export function formatBallCallAmharic(n: number): string {
  return `${getBallLetter(n)} ${numberToAmharicWords(n)}`;
}

