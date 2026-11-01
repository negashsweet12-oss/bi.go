'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        enableClosingConfirmation?: () => void;
        initDataUnsafe?: {
          user?: {
            id?: number;
            first_name?: string;
            last_name?: string;
            username?: string;
          };
        };
      };
    };
  }
}

export default function TelegramWebAppInit() {
  useEffect(() => {
    // 1. Smoothly initialize the Telegram Mini App viewport after React hydration completes
    const initTelegramMiniApp = () => {
      try {
        const tg = window.Telegram?.WebApp;
        if (tg) {
          tg.ready();
          tg.expand();
          if (typeof tg.setHeaderColor === 'function') {
            tg.setHeaderColor('#020617');
          }
          if (typeof tg.setBackgroundColor === 'function') {
            tg.setBackgroundColor('#020617');
          }
          const tgUserId = tg.initDataUnsafe?.user?.id;
          if (tgUserId) {
            try {
              localStorage.setItem('winner_bingo_tg_chat_id', String(tgUserId));
            } catch {
              // ignore storage errors
            }
          }
        }
      } catch {
        // Ignore outside Telegram environment
      }
    };

    // Load telegram-web-app.js dynamically post-hydration so it never mutates <html> style before React hydrates
    const existingScript = document.querySelector(
      'script[src="https://telegram.org/js/telegram-web-app.js"]'
    ) as HTMLScriptElement | null;

    if (existingScript) {
      initTelegramMiniApp();
    } else {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-web-app.js';
      script.async = true;
      script.onload = () => {
        initTelegramMiniApp();
      };
      document.head.appendChild(script);
    }

    const timer = window.setTimeout(initTelegramMiniApp, 800);

    // 2. Auto-recover from transient Next.js webpack ChunkLoadError timeouts
    const handleChunkError = (message: string) => {
      if (
        message.includes('ChunkLoadError') ||
        message.includes('Loading chunk') ||
        message.includes('Failed to fetch dynamically imported module')
      ) {
        try {
          const lastReload = Number(sessionStorage.getItem('wb_chunk_reload_ts') || '0');
          const now = Date.now();
          if (now - lastReload > 15000) {
            sessionStorage.setItem('wb_chunk_reload_ts', String(now));
            window.location.reload();
          }
        } catch {
          window.location.reload();
        }
      }
    };

    const onWindowError = (event: ErrorEvent) => {
      const msg = `${event?.error?.name || ''} ${event?.error?.message || ''} ${event?.message || ''}`;
      handleChunkError(msg);
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      const msg = `${reason?.name || ''} ${reason?.message || ''} ${String(reason || '')}`;
      handleChunkError(msg);
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    // 3. Run a single non-blocking Telegram bot setup check once per browser session
    // (avoids 15s polling that can trigger Cloud Run proxy "Rate exceeded.")
    try {
      const tgCheckedKey = 'wb_tg_bot_checked';
      if (!sessionStorage.getItem(tgCheckedKey)) {
        sessionStorage.setItem(tgCheckedKey, '1');
        fetch('/api/telegram', { method: 'GET', cache: 'no-store' }).catch(() => {});
      }
    } catch {
      // Ignore storage errors
    }

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
