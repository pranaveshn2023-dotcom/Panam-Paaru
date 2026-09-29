import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface PinLockContextType {
  isLocked: boolean;
  isPinEnabled: boolean;
  isPinLoading: boolean;
  pinLength: 4 | 6;
  autoLockTimeoutMs: number;
  lockNow: () => void;
  unlockWithPin: (pin: string) => Promise<{ success: boolean; message?: string }>;
  enablePin: (pin: string, timeoutMs?: number, pinLength?: 4 | 6) => Promise<{ success: boolean; message?: string }>;
  disablePin: (currentPin: string) => Promise<{ success: boolean; message?: string }>;
  updateTimeout: (timeoutMs: number) => Promise<boolean>;
  isLockout: boolean;
}

const PinLockContext = createContext<PinLockContextType | undefined>(undefined);

export const PinLockProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Cloud query for PIN status
  const pinStatus = useQuery(api.pin.getPinStatus);
  const verifyPinMutation = useMutation(api.pin.verifyPin);
  const setPinMutation = useMutation(api.pin.setPin);
  const disablePinMutation = useMutation(api.pin.disablePin);
  const setAutoLockTimeoutMutation = useMutation(api.pin.setAutoLockTimeout);

  const isPinLoading = pinStatus === undefined;
  const isPinEnabled = Boolean(pinStatus?.pinEnabled);
  const pinLength: 4 | 6 = pinStatus?.pinLength === 4 ? 4 : 6;
  const autoLockTimeoutMs = pinStatus?.autoLockTimeoutMs ?? 300000;
  const isLockout = Boolean(pinStatus?.isLockedOut);

  // Pure in-memory lock state (Zero browser localStorage persistence)
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [hasInitialized, setHasInitialized] = useState<boolean>(false);

  // Refs for timer management (stable across re-renders)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const lastActivityUpdateRef = useRef<number>(Date.now());

  // Sync with cloud pinStatus as soon as query resolves
  useEffect(() => {
    if (pinStatus === null) {
      setIsLocked(false);
      setHasInitialized(false);
    } else if (pinStatus !== undefined && !hasInitialized) {
      if (pinStatus?.pinEnabled) {
        setIsLocked(true);
      } else {
        setIsLocked(false);
      }
      setHasInitialized(true);
    }
  }, [pinStatus, hasInitialized]);

  const lockNow = useCallback(() => {
    if (isPinEnabled) {
      setIsLocked(true);
    }
  }, [isPinEnabled]);

  // ─── Dynamic Inactivity & Background Lock ───────────────────────────
  // Universal multi-device auto-lock system (Mobile, Tablet, Desktop, PWA):
  //   1. IN-APP IDLE TIMER & HEARTBEAT: Checks activity continuously without timer throttling.
  //   2. MOBILE LIFECYCLE LISTENERS: Listens to pagehide, pageshow, and visibilitychange.
  //   3. STORAGE FALLBACK: Tracks timestamps in localStorage and sessionStorage
  //      to survive iOS/Android process freezing and background suspension.
  //   4. THROTTLED ACTIVITY: Preserves silky-smooth 60/120fps scrolling on mobile devices.
  useEffect(() => {
    if (!isPinEnabled || isLocked) return;

    const timeoutMs = autoLockTimeoutMs;

    const getStoredTs = (key: string): number => {
      try {
        const val = localStorage.getItem(key) || sessionStorage.getItem(key);
        return val ? parseInt(val, 10) : 0;
      } catch {
        return 0;
      }
    };

    const setStoredTs = (key: string, ts: number) => {
      try {
        localStorage.setItem(key, String(ts));
        sessionStorage.setItem(key, String(ts));
      } catch { }
    };

    const clearStoredTs = (key: string) => {
      try {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      } catch { }
    };

    // Helper: evaluate if the timeout duration was exceeded
    const evaluateAndLock = (): boolean => {
      const storedHidden = getStoredTs('panam_backgrounded_at');

      // If app was backgrounded / tab switched:
      if (storedHidden > 0) {
        if (timeoutMs <= 0) {
          setIsLocked(true);
          clearStoredTs('panam_backgrounded_at');
          return true;
        }

        const now = Date.now();
        const bgElapsed = now - storedHidden;
        if (bgElapsed >= timeoutMs) {
          setIsLocked(true);
          clearStoredTs('panam_backgrounded_at');
          return true;
        }
      }

      // Check in-app idle inactivity (only if timeoutMs > 0)
      if (timeoutMs > 0) {
        const now = Date.now();
        const storedActive = getStoredTs('panam_last_active_at');
        const lastActive = Math.max(lastActivityRef.current, storedActive);
        if (lastActive > 0 && now - lastActive >= timeoutMs) {
          setIsLocked(true);
          return true;
        }
      }

      return false;
    };

    // Check immediately on mounting or entering this state
    if (evaluateAndLock()) {
      return;
    }

    const clearIdleTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const startIdleTimer = () => {
      clearIdleTimer();
      if (timeoutMs <= 0) return;
      idleTimerRef.current = setTimeout(() => {
        setIsLocked(true);
      }, timeoutMs);
    };

    // User activity handler: checks if expired first, then records activity (throttled)
    const onUserActivity = () => {
      const now = Date.now();
      // On mobile, if timers were throttled by OS, check if already expired before resetting!
      if (timeoutMs > 0 && (now - lastActivityRef.current >= timeoutMs)) {
        setIsLocked(true);
        return;
      }

      lastActivityRef.current = now;

      // Throttle storage writes and timer restarts to once every 1.5 seconds for peak performance
      if (now - lastActivityUpdateRef.current > 1500) {
        lastActivityUpdateRef.current = now;
        setStoredTs('panam_last_active_at', now);
        if (document.visibilityState === 'visible') {
          startIdleTimer();
        }
      }
    };

    // Background transition (phone screen locked, home swipe, tab switch)
    const onAppBackground = () => {
      clearIdleTimer();
      const now = Date.now();
      setStoredTs('panam_backgrounded_at', now);
      setStoredTs('panam_last_active_at', now);

      if (timeoutMs <= 0) {
        setIsLocked(true);
        return;
      }

      if (bgTimerRef.current) {
        clearTimeout(bgTimerRef.current);
      }
      bgTimerRef.current = setTimeout(() => {
        setIsLocked(true);
      }, timeoutMs);
    };

    // Foreground transition (phone unlocked, app restored, tab visible)
    const onAppForeground = () => {
      if (bgTimerRef.current) {
        clearTimeout(bgTimerRef.current);
        bgTimerRef.current = null;
      }

      if (evaluateAndLock()) {
        return;
      }

      clearStoredTs('panam_backgrounded_at');
      const now = Date.now();
      lastActivityRef.current = now;
      lastActivityUpdateRef.current = now;
      setStoredTs('panam_last_active_at', now);
      startIdleTimer();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onAppBackground();
      } else if (document.visibilityState === 'visible') {
        onAppForeground();
      }
    };

    // iOS Safari / WebKit pagehide & pageshow lifecycle
    const handlePageHide = () => onAppBackground();
    const handlePageShow = () => onAppForeground();

    // Mobile-safe heartbeat interval (every 2.5s) to combat aggressive background timer throttling
    const heartbeatTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (timeoutMs > 0 && now - lastActivityRef.current >= timeoutMs) {
          setIsLocked(true);
        }
      }
    }, 2500);

    // Register all standard and mobile lifecycle listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);

    // Touch, pointer, mouse, and keyboard interaction listeners
    window.addEventListener('touchstart', onUserActivity, { passive: true });
    window.addEventListener('touchend', onUserActivity, { passive: true });
    window.addEventListener('pointerdown', onUserActivity, { passive: true });
    window.addEventListener('keydown', onUserActivity, { passive: true });
    window.addEventListener('scroll', onUserActivity, { passive: true });
    window.addEventListener('mousemove', onUserActivity, { passive: true });

    // Initial activation
    const now = Date.now();
    lastActivityRef.current = now;
    lastActivityUpdateRef.current = now;
    setStoredTs('panam_last_active_at', now);
    startIdleTimer();

    return () => {
      clearIdleTimer();
      if (bgTimerRef.current) {
        clearTimeout(bgTimerRef.current);
        bgTimerRef.current = null;
      }
      clearInterval(heartbeatTimer);

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);

      window.removeEventListener('touchstart', onUserActivity);
      window.removeEventListener('touchend', onUserActivity);
      window.removeEventListener('pointerdown', onUserActivity);
      window.removeEventListener('keydown', onUserActivity);
      window.removeEventListener('scroll', onUserActivity);
      window.removeEventListener('mousemove', onUserActivity);
    };
  }, [isPinEnabled, isLocked, autoLockTimeoutMs]);

  const unlockWithPin = async (pin: string): Promise<{ success: boolean; message?: string }> => {
    try {
      if (verifyPinMutation) {
        const res = await verifyPinMutation({ pin });
        if (res?.success) {
          setIsLocked(false);
          const now = Date.now();
          lastActivityRef.current = now;
          try {
            localStorage.setItem('panam_last_active_at', String(now));
            localStorage.removeItem('panam_backgrounded_at');
            sessionStorage.removeItem('panam_backgrounded_at');
          } catch { }
          return { success: true };
        }
        return { success: false, message: res?.message || "Incorrect PIN" };
      }
      if (pin.length === (pinLength || 6)) {
        setIsLocked(false);
        const now = Date.now();
        lastActivityRef.current = now;
        try {
          localStorage.setItem('panam_last_active_at', String(now));
          localStorage.removeItem('panam_backgrounded_at');
          sessionStorage.removeItem('panam_backgrounded_at');
        } catch { }
        return { success: true };
      }
      return { success: false, message: "Invalid PIN" };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to verify PIN" };
    }
  };

  const enablePin = async (
    pin: string,
    timeoutMs = 300000,
    length?: 4 | 6
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      if (setPinMutation) {
        const pinLen = length ?? (pin.length === 4 ? 4 : 6);
        await setPinMutation({ pin, pinLength: pinLen, autoLockTimeoutMs: timeoutMs });
      }
      return { success: true };
    } catch (err: any) {
      console.error("Failed to enable PIN", err);
      return { success: false, message: err?.message || "Failed to save the PIN " };
    }
  };

  const disablePin = async (currentPin: string): Promise<{ success: boolean; message?: string }> => {
    try {
      if (disablePinMutation) {
        await disablePinMutation({ currentPin });
      }
      setIsLocked(false);
      return { success: true };
    } catch (err: any) {
      console.error("Failed to disable PIN", err);
      return { success: false, message: err?.message || "Incorrect current PIN" };
    }
  };

  const updateTimeout = async (timeoutMs: number): Promise<boolean> => {
    try {
      if (setAutoLockTimeoutMutation) {
        await setAutoLockTimeoutMutation({ autoLockTimeoutMs: timeoutMs });
      }
      return true;
    } catch (err) {
      console.error("Failed to update auto lock timeout", err);
      return false;
    }
  };

  return (
    <PinLockContext.Provider
      value={{
        isLocked,
        isPinEnabled,
        isPinLoading,
        pinLength,
        autoLockTimeoutMs,
        lockNow,
        unlockWithPin,
        enablePin,
        disablePin,
        updateTimeout,
        isLockout,
      }}
    >
      {children}
    </PinLockContext.Provider>
  );
};

export const usePinLock = () => {
  const context = useContext(PinLockContext);
  if (!context) {
    throw new Error("usePinLock must be used within a PinLockProvider");
  }
  return context;
};
