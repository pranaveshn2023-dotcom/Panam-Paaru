import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface PinLockContextType {
  isLocked: boolean;
  isPinEnabled: boolean;
  isPinLoading: boolean;
  autoLockTimeoutMs: number;
  lockNow: () => void;
  unlockWithPin: (pin: string) => Promise<{ success: boolean; message?: string }>;
  enablePin: (pin: string, timeoutMs?: number) => Promise<boolean>;
  disablePin: (currentPin: string) => Promise<boolean>;
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
  const autoLockTimeoutMs = pinStatus?.autoLockTimeoutMs ?? 300000;
  const isLockout = Boolean(pinStatus?.isLockedOut);

  // Initialize lock state synchronously from localStorage so on reload it starts locked immediately
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem('panam_pin_configured') === 'true';
    } catch {
      return false;
    }
  });
  const [hasInitialized, setHasInitialized] = useState<boolean>(false);

  // Sync with cloud pinStatus as soon as query resolves
  useEffect(() => {
    if (pinStatus !== undefined && !hasInitialized) {
      if (pinStatus?.pinEnabled) {
        setIsLocked(true);
        try {
          localStorage.setItem('panam_pin_configured', 'true');
        } catch {}
      } else {
        setIsLocked(false);
        try {
          localStorage.removeItem('panam_pin_configured');
        } catch {}
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
      if (pin.length === 6) {
        setIsLocked(false);
        return { success: true };
      }
      return { success: false, message: "Invalid PIN" };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to verify PIN" };
    }
  };

  const enablePin = async (pin: string, timeoutMs = 300000): Promise<boolean> => {
    try {
      if (setPinMutation) {
        await setPinMutation({ pin, autoLockTimeoutMs: timeoutMs });
      }
      try {
        localStorage.setItem('panam_pin_configured', 'true');
        sessionStorage.setItem('panam_pin_configured', 'true');
      } catch {}
      return true;
    } catch (err) {
      console.error("Failed to enable PIN", err);
      return false;
    }
  };

  const disablePin = async (currentPin: string): Promise<boolean> => {
    try {
      if (disablePinMutation) {
        await disablePinMutation({ currentPin });
      }
      try {
        localStorage.removeItem('panam_pin_configured');
        sessionStorage.removeItem('panam_pin_configured');
      } catch {}
      setIsLocked(false);
      return true;
    } catch (err) {
      console.error("Failed to disable PIN", err);
      return false;
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
