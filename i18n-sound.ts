'use client';

export type Lang = 'am' | 'en';


export const DICT = {
  en: {
    brand: 'Winner Bingo',
    loginTitle: 'Sign In to Play',
    loginSub: 'Server-verified 75-ball multiplayer Bingo with provably fair draws.',
    registerTitle: 'Create Player Account (18+)',
    registerSub: 'Enter your full name (including father\'s name) and verify you are 18 years or older.',
    username: 'Full Name (with Father Name)',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    dob: 'Date of Birth (18+ Mandatory)',
    phone: 'Phone Number (Mandatory) *',
    termsCheck: 'I confirm I am 18+ years old and accept the Terms & Responsible Gaming Rules.',
    signInBtn: 'Sign In',
    createAccountBtn: 'Create Account',
    switchToRegister: 'New player? Create account',
    switchToLogin: 'Already have an account? Sign in',
    googleSignIn: 'Continue with Google (18+)',
    navLobby: 'Lobby',
    navLiveGame: 'Live Game',
    navWallet: 'Wallet',
    navHistory: 'Fairness & History',
    navResponsible: '18+ & Limits',
    logout: 'Sign Out',
    logoutAll: 'Sign Out All Devices',
    realBalance: 'Real Balance',
    lockedBalance: 'Locked (Withdrawal)',
    playBalance: 'Practice Balance',
    startsIn: 'Starts in',
    drawingLive: 'DRAWING LIVE',
    openForTickets: 'OPEN — BUY CARDS',
    spectatorTitle: 'Game in Progress — Please Wait for the Next Round',
    spectatorBody:
      'A live game has already started and cartela selection is locked. Please wait for the current round to finish — the next round will open automatically.',
    calledSoFar: 'Called so far',
    currentBall: 'Current Ball',
    last5Balls: 'Last 5',
    prizeMath: 'Prize Math',
    pot: 'Pot',
    houseFee: 'House Fee',
    netPrize: 'Instant Prize',
    players: 'Players',
    tickets: 'Tickets',
    claimBingo: 'CLAIM BINGO!',
    soundOn: 'Male Voice ON',
    soundOff: 'Voice Muted',
    pickCardsTitle: 'Select Your Cartela (Pool 1–120)',
    buySelectedCards: 'Confirm & Lock Selected Cartela(s)',
    startDrawNow: 'Auto-Starts on Timer',
    myCartelas: 'My Cartela(s)',
    masterBoard: 'Master Board (1–75)',
    depositTitle: 'Deposit Funds (Admin Approval Required)',
    withdrawTitle: 'Request Withdrawal (Immediate Hold)',
    ledgerTitle: 'Append-Only Wallet Ledger',
    verifyTitle: 'Provably Fair Round Verifier (HMAC-SHA256)',
    responsibleTitle: 'Responsible Gaming & Player Protection',
  },
  am: {
    brand: 'Winner Bingo',
    loginTitle: 'ለመጫወት ይግቡ',
    loginSub: 'ፍትሃዊነቱ የተረጋገጠ የ75-ኳስ የቀጥታ ቢንጎ ጨዋታ።',
    registerTitle: 'አዲስ አካውንት ይክፈቱ (18+)',
    registerSub: 'ሙሉ ስምዎን (እስከ አባት ስም) ያስገቡ እና እድሜዎ ከ18 ዓመት በላይ መሆኑን ያረጋግጡ።',
    username: 'ሙሉ ስም (እስከ አባት ስም)',
    password: 'የይለፍ ቃል (Password)',
    confirmPassword: 'የይለፍ ቃል ያረጋግጡ',
    dob: 'የትውልድ ቀን (18+ ግዴታ)',
    phone: 'ስልክ ቁጥር (ግዴታ) *',
    termsCheck: 'እድሜዬ 18+ መሆኑን አረጋግጣለሁ፤ እንዲሁም ደንቦችን እቀበላለሁ።',
    signInBtn: 'ግባ (Sign In)',
    createAccountBtn: 'አካውንት ክፈት',
    switchToRegister: 'አዲስ ተጫዋች ነዎት? አካውንት ይክፈቱ',
    switchToLogin: 'አካውንት አለዎት? ይግቡ',
    googleSignIn: 'በ Google ይግቡ (18+)',
    navLobby: 'መጫወቻ ክፍሎች',
    navLiveGame: 'የቀጥታ ጨዋታ',
    navWallet: 'ቦርሳ (Wallet)',
    navHistory: 'ፍትሃዊነት እና ታሪክ',
    navResponsible: '18+ እና ገደቦች',
    logout: 'ውጣ',
    logoutAll: 'ከሁሉም ስልኮች ውጣ',
    realBalance: 'ዋና ቀሪ ሂሳብ',
    lockedBalance: 'የተያዘ (ለወጪ)',
    playBalance: 'የልምምድ ብር',
    startsIn: 'ጨዋታው የሚጀምረው በ',
    drawingLive: 'ኳስ በመውጣት ላይ',
    openForTickets: 'ክፍት ነው — ካርቴላ ይምረጡ',
    spectatorTitle: 'ጨዋታ ተጀምሯል፣ እባክዎ ቀጣዩን ዙር ይጠብቁ',
    spectatorBody:
      'የካርቴላ መረጣ ሰዓቱ አልቆ የአሁኑ ጨዋታ በቀጥታ እየተካሄደ ነው። እየተካሄደ ባለው ጨዋታ መሃል ካርቴላ መግዛት አይቻልም፤ ይህ ዙር ልክ እንዳለቀ ለቀጣዩ ዙር ካርቴላ መምረጥ ይችላሉ።',
    calledSoFar: 'እስካሁን የወጡ ቁጥሮች',
    currentBall: 'የአሁኗ ኳስ',
    last5Balls: 'ያለፉት 5',
    prizeMath: 'የሽልማት ስሌት',
    pot: 'ጠቅላላ የተሰበሰበ',
    houseFee: 'የቤት ኮሚሽን',
    netPrize: 'ደራሽ ሽልማት',
    players: 'ተጫዋቾች',
    tickets: 'ካርቴላዎች',
    claimBingo: 'ቢንጎ! (BINGO!)',
    soundOn: 'የወንድ ድምፅ በርቷል',
    soundOff: 'ድምፅ ጠፍቷል',
    pickCardsTitle: 'ካርቴላ ይምረጡ (ከ 1–120)',
    buySelectedCards: 'የተመረጠውን ካርቴላ አረጋግጥ እና ግዛ',
    startDrawNow: 'ሰዓቱ ሲያልቅ በራሱ ይጀምራል',
    myCartelas: 'የእኔ ካርቴላዎች',
    masterBoard: 'ማስተር ቦርድ (1–75)',
    depositTitle: 'ገቢ ማድረጊያ (የአድሚን ማረጋገጫ ይጠይቃል)',
    withdrawTitle: 'ወጪ መጠየቂያ',
    ledgerTitle: 'የቦርሳ እንቅስቃሴ ዝርዝር (Ledger)',
    verifyTitle: 'የጨዋታ ፍትሃዊነት ማረጋገጫ (HMAC-SHA256)',
    responsibleTitle: 'ኃላፊነት የተሞላበት ጨዋታ (18+)',
  },
} as const;

export function getBingoBallLetter(ballNumber: number): 'B' | 'I' | 'N' | 'G' | 'O' {
  if (ballNumber <= 15) return 'B';
  if (ballNumber <= 30) return 'I';
  if (ballNumber <= 45) return 'N';
  if (ballNumber <= 60) return 'G';
  return 'O';
}

class SoundEffectsManager {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private activeSource: AudioBufferSourceNode | null = null;
  private activeAudioElement: HTMLAudioElement | null = null;
  private ttsBufferCache = new Map<string, AudioBuffer>();
  private inFlightRequests = new Map<string, Promise<AudioBuffer | null>>();
  private speechGenerationId = 0;
  // Hold references to active SpeechSynthesisUtterances so Chrome GC never cuts off speech mid-sentence
  private activeUtterances: SpeechSynthesisUtterance[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const unlockHandler = () => {
        this.unlockAudio();
      };
      window.addEventListener('pointerdown', unlockHandler, { passive: true });
      window.addEventListener('keydown', unlockHandler, { passive: true });
      if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.getVoices();
        };
      }
    }
  }

  public unlockAudio() {
    if (typeof window === 'undefined') return;
    const ctx = this.getContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (!this.unlocked) {
      this.unlocked = true;
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.getVoices();
          const silent = new SpeechSynthesisUtterance('');
          silent.volume = 0;
          window.speechSynthesis.speak(silent);
        } catch {
          // Ignore
        }
      }
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Selects the clearest, most natural English voice available in the browser.
   * Strictly restricts selection to English ('en-*') voices so non-English voices
   * never mispronounce English letters or numbers.
   */
  private pickBestClearEnglishVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // Strictly filter to English voices only (en-US, en-GB, en-CA, en-AU, etc.)
    const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
    if (enVoices.length === 0) return null;

    // Priority order of crystal-clear neural/natural English voices across Chrome, Edge, Safari, Android, and Windows
    const preferredClearEnglishNames = [
      'google us english',
      'google uk english male',
      'google uk english female',
      'microsoft andrew online (natural)',
      'microsoft brian online (natural)',
      'microsoft christopher online (natural)',
      'microsoft guy online (natural)',
      'microsoft ryan online (natural)',
      'microsoft aria online (natural)',
      'microsoft jenny online (natural)',
      'microsoft guy',
      'microsoft ryan',
      'microsoft christopher',
      'microsoft andrew',
      'microsoft brian',
      'microsoft david',
      'microsoft mark',
      'samantha',
      'daniel',
      'alex',
      'ava',
      'allison',
      'karen',
      'moira',
      'arthur',
      'oliver',
    ];

    // Avoid novelty or low-clarity robotic voices if better ones exist
    const lowClarityKeywords = ['fred', 'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged', 'good news', 'hysterical', 'pipe organ', 'trinoids', 'whisper', 'zarvox'];

    for (const pref of preferredClearEnglishNames) {
      const match = enVoices.find((v) => v.name.toLowerCase().includes(pref));
      if (match) return match;
    }

    // Prefer en-US or en-GB voices that aren't novelty voices
    const cleanStandardEn = enVoices.find((v) => {
      const lowerName = v.name.toLowerCase();
      const lowerLang = v.lang.toLowerCase();
      const isStandardRegion = lowerLang.startsWith('en-us') || lowerLang.startsWith('en-gb');
      return isStandardRegion && !lowClarityKeywords.some((k) => lowerName.includes(k));
    });
    if (cleanStandardEn) return cleanStandardEn;

    return enVoices[0];
  }

  private stopActiveSpeech() {
    if (this.activeSource) {
      try {
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {
        // Ignore if already stopped
      }
      this.activeSource = null;
    }
    if (this.activeAudioElement) {
      try {
        this.activeAudioElement.pause();
        this.activeAudioElement.currentTime = 0;
      } catch {
        // Ignore
      }
      this.activeAudioElement = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer.slice(0);
  }

  /**
   * Fetches and decodes crystal-clear neural English MP3 audio from our Gemini-free /api/tts endpoint.
   */
  private async fetchCleanEnglishBuffer(englishText: string): Promise<AudioBuffer | null> {
    const cacheKey = englishText.trim().toLowerCase();
    const cached = this.ttsBufferCache.get(cacheKey);
    if (cached) return cached;

    const existingInFlight = this.inFlightRequests.get(cacheKey);
    if (existingInFlight) return existingInFlight;

    const requestPromise = (async (): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: englishText }),
        });
        if (!res.ok) return null;

        const data = (await res.json()) as { base64?: string };
        if (!data?.base64) return null;

        const ctx = this.getContext();
        if (!ctx) return null;

        const rawBuffer = this.base64ToArrayBuffer(data.base64);
        const decoded = await ctx.decodeAudioData(rawBuffer);
        this.ttsBufferCache.set(cacheKey, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this.inFlightRequests.delete(cacheKey);
      }
    })();

    this.inFlightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  /**
   * Plays an AudioBuffer at 1.0x natural pitch and speed with a broadcast vocal clarity EQ
   * (subtle high-mid presence boost at 3.2 kHz so letters like B, I, N, G, O and digits are razor-sharp).
   */
  private playCleanEnglishBuffer(buffer: AudioBuffer) {
    const ctx = this.getContext();
    if (!ctx) return;

    this.stopActiveSpeech();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // Keep 1.0x natural playback rate so there is zero pitch-shifting or formant distortion
    source.playbackRate.value = 1.0;

    // High-pass filter at 85 Hz to remove any low-end mud
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 85;

    // Broadcast clarity boost at 3.2 kHz for crisp English consonant & number articulation
    const clarityBoost = ctx.createBiquadFilter();
    clarityBoost.type = 'peaking';
    clarityBoost.frequency.value = 3200;
    clarityBoost.Q.value = 1.1;
    clarityBoost.gain.value = 2.8;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.4;

    source.connect(highpass);
    highpass.connect(clarityBoost);
    clarityBoost.connect(gainNode);
    gainNode.connect(ctx.destination);

    this.activeSource = source;
    source.onended = () => {
      if (this.activeSource === source) {
        this.activeSource = null;
      }
    };

    source.start(0);
  }

  /**
   * Fallback native browser SpeechSynthesis in clean, natural 1.0 pitch English.
   */
  private speakNativeClearEnglishFallback(englishText: string, rate = 0.95) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      this.stopActiveSpeech();
      window.speechSynthesis.resume();

      const utterance = new SpeechSynthesisUtterance(englishText);
      const clearEnVoice = this.pickBestClearEnglishVoice();
      if (clearEnVoice) {
        utterance.voice = clearEnVoice;
        utterance.lang = clearEnVoice.lang || 'en-US';
      } else {
        utterance.lang = 'en-US';
      }

      // Natural 1.0 pitch prevents robotic/muffled distortion
      utterance.rate = rate;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      this.activeUtterances = [utterance];
      utterance.onend = () => {
        this.activeUtterances = this.activeUtterances.filter((u) => u !== utterance);
      };
      utterance.onerror = () => {
        this.activeUtterances = this.activeUtterances.filter((u) => u !== utterance);
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore speech synthesis restrictions on unsupported environments
    }
  }

  /**
   * Speaks English text using crystal-clear neural English audio (/api/tts)
   * with automatic fallback to natural 1.0-pitch English window.speechSynthesis.
   */
  private async speakCrystalClearEnglish(englishText: string, fallbackRate = 0.95) {
    if (typeof window === 'undefined') return;
    const genId = ++this.speechGenerationId;
    this.unlockAudio();

    const buffer = await this.fetchCleanEnglishBuffer(englishText);
    if (genId !== this.speechGenerationId) return;

    if (buffer) {
      this.playCleanEnglishBuffer(buffer);
      return;
    }

    // Secondary fallback: HTML5 Audio stream from /api/tts GET endpoint
    try {
      this.stopActiveSpeech();
      const audio = new Audio(`/api/tts?text=${encodeURIComponent(englishText)}`);
      audio.volume = 1.0;
      this.activeAudioElement = audio;
      await audio.play();
      return;
    } catch {
      if (genId !== this.speechGenerationId) return;
    }

    // Final offline fallback: native browser speechSynthesis at natural 1.0 pitch
    this.speakNativeClearEnglishFallback(englishText, fallbackRate);
  }

  /**
   * Speaks the called Bingo ball out loud once in crystal-clear English
   * (e.g., "B, 4"), without repeating the standalone number afterward.
   */
  public speakBallNumber(ballNumber: number, enabled = true) {
    if (!enabled || typeof window === 'undefined') return;
    const letter = getBingoBallLetter(ballNumber);
    // Using a comma pause ("B, 4") ensures the letter and number are articulated
    // distinctly and never slurred together (e.g., "B 4" sounding like "before").
    const englishCall = `${letter}, ${ballNumber}`;
    void this.speakCrystalClearEnglish(englishCall, 0.94);
  }

  /**
   * Plays an energetic celebratory chime and announces the welcome greeting
   * in crystal-clear English.
   */
  public playWelcomeGreeting(_username?: string, enabled = true) {
    if (!enabled || typeof window === 'undefined') return;
    this.unlockAudio();
    const ctx = this.getContext();
    if (ctx) {
      try {
        const now = ctx.currentTime;
        const notes = [
          { freq: 523.25, start: 0.0, dur: 0.12, gain: 0.16 }, // C5
          { freq: 659.25, start: 0.1, dur: 0.12, gain: 0.18 }, // E5
          { freq: 783.99, start: 0.2, dur: 0.14, gain: 0.2 },  // G5
          { freq: 1046.5, start: 0.32, dur: 0.3, gain: 0.22 }, // C6
        ];
        notes.forEach((n) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(n.freq, now + n.start);
          gain.gain.setValueAtTime(n.gain, now + n.start);
          gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + n.start);
          osc.stop(now + n.start + n.dur + 0.02);
        });
      } catch {
        // Ignore audio restrictions
      }
    }

    void this.speakCrystalClearEnglish('Welcome to Winner Bingo! Good luck!', 0.96);
  }

  playBallDraw(ballNumber: number, enabled: boolean) {
    if (!enabled) return;
    const ctx = this.getContext();
    if (ctx) {
      try {
        // Studio game-show attention chime before crystal-clear English voice call
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        osc1.frequency.setValueAtTime(880.0, now + 0.07); // A5
        gain1.gain.setValueAtTime(0.14, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.22);
      } catch {
        // Ignore audio errors on restricted devices
      }
    }

    this.speakBallNumber(ballNumber, enabled);
  }

  playBingoWin(
    enabled: boolean,
    _details?: {
      usernames?: string[];
      cardIndices?: number[];
      prizeEtbText?: string;
    }
  ) {
    if (!enabled) return;
    this.unlockAudio();
    const ctx = this.getContext();
    if (ctx) {
      try {
        const now = ctx.currentTime;
        // Stage 1: Joyful ascending trumpet-like fanfare arpeggio (C5 - E5 - G5 - C6 - E6 - G6)
        const fanfareNotes = [
          { freq: 523.25, time: 0.0, dur: 0.16, gain: 0.22 },
          { freq: 659.25, time: 0.12, dur: 0.16, gain: 0.22 },
          { freq: 783.99, time: 0.24, dur: 0.16, gain: 0.24 },
          { freq: 1046.5, time: 0.36, dur: 0.32, gain: 0.28 },
          { freq: 783.99, time: 0.65, dur: 0.15, gain: 0.22 },
          { freq: 1046.5, time: 0.8, dur: 0.55, gain: 0.30 },
        ];
        fanfareNotes.forEach((n) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(n.freq, now + n.time);
          gain.gain.setValueAtTime(n.gain, now + n.time);
          gain.gain.exponentialRampToValueAtTime(0.001, now + n.time + n.dur);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + n.time);
          osc.stop(now + n.time + n.dur + 0.02);
        });

        // Stage 2: Rich celebratory major chord shimmer (C5 + E5 + G5 + C6)
        const chordFreqs = [523.25, 659.25, 783.99, 1046.5, 1318.51];
        chordFreqs.forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + 0.82);
          gain.gain.setValueAtTime(0.10, now + 0.82);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.65);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + 0.82);
          osc.stop(now + 1.68);
        });
      } catch {
        // Ignore audio errors
      }
    }

    void this.speakCrystalClearEnglish('Bingo! Winner! Congratulations!', 0.96);
  }
}

export const soundFx = new SoundEffectsManager();
