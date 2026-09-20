import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
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

  // Handle background inactivity:
  // If user is inside the app (visible on screen), NEVER lock even if inactive or blurred.
  // ONLY lock if the tab is genuinely hidden/minimized in the background for more than 40 seconds!
  useEffect(() => {
    if (!isPinEnabled) return;

    const BACKGROUND_TIMEOUT_MS = 40000; // 40 seconds
    let backgroundTimer: ReturnType<typeof setTimeout> | null = null;
    let hiddenAt = 0;

    const clearBgTracking = () => {
      if (backgroundTimer) {
        clearTimeout(backgroundTimer);
        backgroundTimer = null;
      }
      hiddenAt = 0;
      try {
        sessionStorage.removeItem('panam_backgrounded_at');
      } catch {}
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // App is genuinely hidden in the background (minimized or switched tab)
        hiddenAt = Date.now();
        try {
          sessionStorage.setItem('panam_backgrounded_at', String(hiddenAt));
        } catch {}

        if (backgroundTimer) clearTimeout(backgroundTimer);
        backgroundTimer = setTimeout(() => {
          if (document.visibilityState === 'hidden') {
            setIsLocked(true);
          }
        }, BACKGROUND_TIMEOUT_MS);
      } else if (document.visibilityState === 'visible') {
        // App became visible again: check if it was hidden for >= 40s
        if (backgroundTimer) {
          clearTimeout(backgroundTimer);
          backgroundTimer = null;
        }

        try {
          const bgAtStr = sessionStorage.getItem('panam_backgrounded_at');
          const recordedHiddenAt = bgAtStr ? parseInt(bgAtStr, 10) : hiddenAt;
          if (recordedHiddenAt > 0) {
            const elapsed = Date.now() - recordedHiddenAt;
            if (elapsed >= BACKGROUND_TIMEOUT_MS) {
              setIsLocked(true);
            }
          }
        } catch {}

        clearBgTracking();
      }
    };

    // User interaction inside the app confirms the user is live: cancel any background tracking immediately
    const onUserActivity = () => {
      if (document.visibilityState === 'visible') {
        clearBgTracking();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pointerdown', onUserActivity, { passive: true });
    window.addEventListener('keydown', onUserActivity, { passive: true });
    window.addEventListener('scroll', onUserActivity, { passive: true });

    return () => {
      if (backgroundTimer) clearTimeout(backgroundTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pointerdown', onUserActivity);
      window.removeEventListener('keydown', onUserActivity);
      window.removeEventListener('scroll', onUserActivity);
    };
  }, [isPinEnabled]);

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
      return { success: false, message: err?.message || "Failed to save PIN in cloud" };
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
