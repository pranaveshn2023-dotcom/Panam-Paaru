import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, Delete, ShieldAlert, LogOut, HelpCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { usePinLock } from '../../context/PinLockContext';
import { BrandLogo } from '../layout/BrandLogo';
import { NeoButton } from '../ui/NeoButton';
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export const PinLockScreen: React.FC = () => {
  const { isLocked, unlockWithPin } = usePinLock();
  const { signOut } = useAuthActions();
  const resetFailedAttemptsMutation = useMutation(api.pin.resetFailedAttempts);
  
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [failedCount, setFailedCount] = useState<number>(0);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);

  // Guards to prevent duplicate verification runs on re-render
  const verifyingRef = useRef<boolean>(false);
  const lastAttemptedPinRef = useRef<string>('');

  // Reset attempt counters every time the lock screen activates
  useEffect(() => {
    if (isLocked) {
      setPin('');
      setErrorMsg('');
      setFailedCount(0);
      verifyingRef.current = false;
      lastAttemptedPinRef.current = '';
      resetFailedAttemptsMutation().catch(() => {});
    }
  }, [isLocked]);

  const handleDigit = useCallback((digit: string) => {
    if (pin.length < 6 && !verifyingRef.current) {
      setErrorMsg('');
      setPin((prev) => prev + digit);
    }
  }, [pin]);

  const handleDelete = useCallback(() => {
    if (pin.length > 0 && !verifyingRef.current) {
      setErrorMsg('');
      setPin((prev) => prev.slice(0, -1));
    }
  }, [pin]);

  const handleClear = useCallback(() => {
    if (!verifyingRef.current) {
      setErrorMsg('');
      setPin('');
      lastAttemptedPinRef.current = '';
    }
  }, []);

  const handleResetAttempts = useCallback(() => {
    setPin('');
    setErrorMsg('');
    setFailedCount(0);
    verifyingRef.current = false;
    lastAttemptedPinRef.current = '';
    resetFailedAttemptsMutation().catch(() => {});
  }, [resetFailedAttemptsMutation]);

  // Physical keyboard listener for desktop users
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Escape') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, handleDigit, handleDelete, handleClear]);

  // Auto-verify as soon as 6 digits are typed, strictly once per 6-digit input
  useEffect(() => {
    if (pin.length === 6 && !verifyingRef.current && lastAttemptedPinRef.current !== pin) {
      const pinToVerify = pin;
      lastAttemptedPinRef.current = pinToVerify;
      verifyingRef.current = true;
      setIsVerifying(true);

      unlockWithPin(pinToVerify)
        .then((result) => {
          verifyingRef.current = false;
          setIsVerifying(false);

          if (!result.success) {
            setFailedCount((prev) => {
              const newCount = prev + 1;
              setErrorMsg(`Incorrect PIN (Attempt ${newCount})`);
              return newCount;
            });
            setIsShaking(true);
            setTimeout(() => {
              setIsShaking(false);
              setPin('');
              lastAttemptedPinRef.current = '';
            }, 400);
          } else {
            setPin('');
            setErrorMsg('');
            setFailedCount(0);
            lastAttemptedPinRef.current = '';
          }
        })
        .catch((err) => {
          verifyingRef.current = false;
          setIsVerifying(false);
          setFailedCount((prev) => prev + 1);
          setErrorMsg(err.message || 'Failed to verify PIN');
          setPin('');
          lastAttemptedPinRef.current = '';
        });
    }
  }, [pin, unlockWithPin]);

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-[#FFFDF5] flex flex-col items-center justify-center p-4 select-none">
      {/* Background Neo-Brutalist Pattern */}
      <div className="absolute inset-0 neo-pattern-stripes opacity-40 pointer-events-none" />

      {/* Main Lock Card */}
      <div className="relative w-full max-w-sm bg-white border-[3px] border-[#121212] shadow-neo-xl p-6 sm:p-8 flex flex-col items-center z-10">
        
        {/* Brand Header */}
        <div className="mb-4">
          <BrandLogo size="md" showSubtitle={false} />
        </div>

        {/* Lock Shield Badge */}
        <div className="flex items-center gap-2 bg-[#FFE600] px-3 py-1 border-2 border-[#121212] shadow-neo-sm mb-4">
          <Lock size={16} className="text-[#121212]" strokeWidth={3} />
          <span className="text-xs font-black uppercase tracking-wider text-[#121212]">
            SECURITY PIN LOCKED
          </span>
        </div>

        <p className="text-xs font-bold text-neutral-600 mb-5 text-center">
          Enter your 6-digit PIN to access your finances
        </p>

        {/* 6-Digit Indicator Bubbles */}
        <div className={`flex gap-3 mb-5 ${isShaking ? 'animate-shake' : ''}`}>
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const isFilled = pin.length > index;
            return (
              <div
                key={index}
                className={`w-9 h-11 border-[3px] border-[#121212] flex items-center justify-center transition-all duration-100 ${
                  isFilled
                    ? 'bg-[#05DF72] shadow-neo-sm scale-105'
                    : 'bg-[#FFFDF5] shadow-none'
                }`}
              >
                {isFilled && (
                  <div className="w-3.5 h-3.5 bg-[#121212] rounded-full" />
                )}
              </div>
            );
          })}
        </div>

        {/* Error Feedback */}
        {errorMsg && (
          <div className="w-full bg-[#FF4343] text-white text-xs font-black p-2 border-2 border-[#121212] shadow-neo-sm flex items-center gap-2 mb-4 animate-in fade-in">
            <ShieldAlert size={16} strokeWidth={3} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Prominent Forgot PIN / Reset Button after 3 wrong attempts */}
        {failedCount >= 3 ? (
          <div className="w-full mb-4 p-3 bg-[#FFFDF5] border-2 border-[#FF4343] shadow-neo-sm flex flex-col gap-2 animate-in fade-in">
            <div className="flex items-center justify-between gap-1.5 text-xs font-black text-[#FF4343] uppercase">
              <span className="flex items-center gap-1.5">
                <HelpCircle size={15} />
                <span>Forgot your PIN?</span>
              </span>
              <button
                type="button"
                onClick={handleResetAttempts}
                className="text-[10px] uppercase font-black px-2 py-0.5 bg-[#FFE600] text-[#121212] border border-[#121212] shadow-neo-sm cursor-pointer"
              >
                Reset
              </button>
            </div>
            <p className="text-[11px] font-bold text-neutral-700">
              Entered wrong PIN 3 times. You can reset attempts or sign out.
            </p>
            <div className="flex gap-2">
              <NeoButton
                variant="outline"
                size="sm"
                onClick={handleResetAttempts}
                className="flex items-center justify-center gap-1.5 flex-1 text-xs font-black bg-white"
              >
                <RotateCcw size={13} />
                <span>Try Again</span>
              </NeoButton>
              <NeoButton
                variant="danger"
                size="sm"
                onClick={() => {
                  sessionStorage.removeItem('panam_pin_configured');
                  sessionStorage.removeItem('panam_welcome_celebrated');
                  void signOut();
                }}
                className="flex items-center justify-center gap-1.5 flex-1 text-xs font-black"
              >
                <LogOut size={13} />
                <span>Sign Out</span>
              </NeoButton>
            </div>
          </div>
        ) : failedCount > 0 ? (
          <div className="w-full flex justify-end mb-2">
            <button
              type="button"
              onClick={handleResetAttempts}
              className="text-[10px] font-black uppercase text-neutral-600 hover:text-[#121212] underline flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw size={10} /> Reset Attempts
            </button>
          </div>
        ) : null}

        {/* Neo-Brutalist 3x4 Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full mb-5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleDigit(num)}
              disabled={isVerifying}
              className="neo-btn bg-white hover:bg-[#FFE600] text-[#121212] font-mono text-xl font-black py-3 border-2 border-[#121212] shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer"
            >
              {num}
            </button>
          ))}

          {/* Clear Button */}
          <button
            onClick={handleClear}
            disabled={isVerifying}
            className="neo-btn bg-neutral-100 hover:bg-neutral-200 text-[#121212] text-xs font-black py-3 border-2 border-[#121212] shadow-neo-sm cursor-pointer"
          >
            C
          </button>

          {/* 0 Button */}
          <button
            onClick={() => handleDigit('0')}
            disabled={isVerifying}
            className="neo-btn bg-white hover:bg-[#FFE600] text-[#121212] font-mono text-xl font-black py-3 border-2 border-[#121212] shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer"
          >
            0
          </button>

          {/* Backspace Button */}
          <button
            onClick={handleDelete}
            disabled={isVerifying || pin.length === 0}
            className="neo-btn bg-[#FF4343] hover:bg-[#FF5C5C] text-white flex items-center justify-center py-3 border-2 border-[#121212] shadow-neo-sm cursor-pointer"
          >
            <Delete size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Emergency Sign Out Button */}
        <div className="w-full pt-2 border-t-2 border-neutral-200 flex justify-center">
          <button
            onClick={() => {
              sessionStorage.removeItem('panam_pin_configured');
              sessionStorage.removeItem('panam_welcome_celebrated');
              void signOut();
            }}
            className="text-xs font-bold text-neutral-500 hover:text-[#FF4343] flex items-center gap-1.5 cursor-pointer underline transition-colors"
          >
            <LogOut size={13} />
            Sign Out / Switch Account
          </button>
        </div>

      </div>
    </div>
  );
};
