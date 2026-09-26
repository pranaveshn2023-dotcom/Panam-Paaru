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
  // Dual-timer system driven by the user's autoLockTimeoutMs setting:
  //   1. IN-APP IDLE TIMER: When the tab is visible, resets on any user
  //      interaction (mouse, keyboard, scroll, touch). Fires after
  //      autoLockTimeoutMs of zero interaction.
  //   2. BACKGROUND TIMER: When the tab is hidden/minimized, fires after
  //      autoLockTimeoutMs. "Immediate" (0 ms) locks instantly on hide.
  useEffect(() => {
    if (!isPinEnabled || isLocked) return;

    // The effective timeout from the user's setting (0 = immediate on background)
    const timeoutMs = autoLockTimeoutMs;

    // ── Helper: clear & restart the in-app idle timer ──
    const clearIdleTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const startIdleTimer = () => {
      clearIdleTimer();
      // "Immediate" (0 ms) means only lock on tab switch, not while actively using
      if (timeoutMs <= 0) return;
      idleTimerRef.current = setTimeout(() => {
        setIsLocked(true);
      }, timeoutMs);
    };

    // ── Helper: clear background tracking ──
    const clearBgTracking = () => {
      if (bgTimerRef.current) {
        clearTimeout(bgTimerRef.current);
        bgTimerRef.current = null;
      }
      try {
        sessionStorage.removeItem('panam_backgrounded_at');
      } catch { }
    };

    // ── User activity handler: resets idle timer ──
    const onUserActivity = () => {
      if (document.visibilityState === 'visible') {
        lastActivityRef.current = Date.now();
        startIdleTimer();
      }
    };

    // ── Visibility change handler: manages background timer ──
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Tab is now hidden — pause the idle timer, start background timer
        clearIdleTimer();

        const hiddenAt = Date.now();
        try {
          sessionStorage.setItem('panam_backgrounded_at', String(hiddenAt));
        } catch { }

        clearBgTracking();

        // "Immediate" (0 ms) — lock right away on tab switch
        if (timeoutMs <= 0) {
          setIsLocked(true);
          return;
        }

        bgTimerRef.current = setTimeout(() => {
          if (document.visibilityState === 'hidden') {
            setIsLocked(true);
          }
        }, timeoutMs);
      } else if (document.visibilityState === 'visible') {
        // Tab became visible again
        if (bgTimerRef.current) {
          clearTimeout(bgTimerRef.current);
          bgTimerRef.current = null;
        }

        // Check if the tab was hidden longer than the timeout
        try {
          const bgAtStr = sessionStorage.getItem('panam_backgrounded_at');
          if (bgAtStr) {
            const hiddenAt = parseInt(bgAtStr, 10);
            if (hiddenAt > 0 && timeoutMs > 0) {
              const elapsed = Date.now() - hiddenAt;
              if (elapsed >= timeoutMs) {
                setIsLocked(true);
                clearBgTracking();
                return;
              }
            }
          }
        } catch { }

        clearBgTracking();

        // Resume idle tracking now that the user is back
        lastActivityRef.current = Date.now();
        startIdleTimer();
      }
    };

    // ── Attach all listeners ──
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pointerdown', onUserActivity, { passive: true });
    window.addEventListener('keydown', onUserActivity, { passive: true });
    window.addEventListener('scroll', onUserActivity, { passive: true });
    window.addEventListener('mousemove', onUserActivity, { passive: true });
    window.addEventListener('touchstart', onUserActivity, { passive: true });

    // Start the idle timer immediately (user just unlocked or PIN was just enabled)
    lastActivityRef.current = Date.now();
    startIdleTimer();

    return () => {
      clearIdleTimer();
      clearBgTracking();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pointerdown', onUserActivity);
      window.removeEventListener('keydown', onUserActivity);
      window.removeEventListener('scroll', onUserActivity);
      window.removeEventListener('mousemove', onUserActivity);
      window.removeEventListener('touchstart', onUserActivity);
    };
  }, [isPinEnabled, isLocked, autoLockTimeoutMs]);

  const unlockWithPin = async (pin: string): Promise<{ success: boolean; message?: string }> => {
    try {
      if (verifyPinMutation) {
        const res = await verifyPinMutation({ pin });
        if (res?.success) {
          setIsLocked(false);
          return { success: true };
        }
        return { success: false, message: res?.message || "Incorrect PIN" };
      }
      if (pin.length === (pinLength || 6)) {
        setIsLocked(false);
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
