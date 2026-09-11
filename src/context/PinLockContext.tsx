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
  // If user is inside the app, NEVER lock even if inactive.
  // ONLY lock if the user leaves the app in the background for more than 40 seconds!
  useEffect(() => {
    if (!isPinEnabled) return;

    const BACKGROUND_TIMEOUT_MS = 40000; // 40 seconds
    let backgroundTimer: NodeJS.Timeout | null = null;

    const onAppBackgrounded = () => {
      try {
        sessionStorage.setItem('panam_backgrounded_at', String(Date.now()));
      } catch {}

      if (backgroundTimer) clearTimeout(backgroundTimer);
      backgroundTimer = setTimeout(() => {
        setIsLocked(true);
      }, BACKGROUND_TIMEOUT_MS);
    };

    const onAppForegrounded = () => {
      if (backgroundTimer) {
        clearTimeout(backgroundTimer);
        backgroundTimer = null;
      }

      try {
        const bgAtStr = sessionStorage.getItem('panam_backgrounded_at');
        if (bgAtStr) {
          const bgAt = parseInt(bgAtStr, 10);
          const elapsed = Date.now() - bgAt;
          if (elapsed >= BACKGROUND_TIMEOUT_MS) {
            setIsLocked(true);
          }
          sessionStorage.removeItem('panam_backgrounded_at');
        }
      } catch {}
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onAppBackgrounded();
      } else if (document.visibilityState === 'visible') {
        onAppForegrounded();
      }
    };

    const handleBlur = () => {
      onAppBackgrounded();
    };

    const handleFocus = () => {
      onAppForegrounded();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      if (backgroundTimer) clearTimeout(backgroundTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
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
