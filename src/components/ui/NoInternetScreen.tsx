import React, { useState } from 'react';
import { WifiOff, RefreshCw, ShieldAlert, Zap } from 'lucide-react';
import { NeoButton } from './NeoButton';

export const NoInternetScreen: React.FC = () => {
  const [isChecking, setIsChecking] = useState(false);

  const handleRetry = () => {
    setIsChecking(true);
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-[#FFE600] flex flex-col items-center justify-center p-4 sm:p-6 select-none overflow-hidden">
      {/* Pattern background */}
      <div className="absolute inset-0 neo-pattern-dots opacity-30 pointer-events-none" />

      {/* Center Card */}
      <div className="relative z-10 w-full max-w-md bg-white border-[4px] border-[#121212] shadow-neo-xl p-6 sm:p-8 flex flex-col items-center text-center">
        {/* Top Header Tag */}
        <div className="flex items-center gap-2 bg-[#FF4343] text-white px-3 py-1 border-2 border-[#121212] shadow-neo-sm text-xs font-mono font-black uppercase tracking-wider mb-6">
          <WifiOff size={14} strokeWidth={3} />
          <span>OFFLINE DETECTED</span>
        </div>

        {/* Icon */}
        <div className="w-20 h-20 bg-[#FFE600] border-[3px] border-[#121212] shadow-neo flex items-center justify-center mb-6 rounded-none">
          <WifiOff size={40} className="text-[#121212]" strokeWidth={2.5} />
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#121212] mb-3 leading-tight">
          No Internet Connection
        </h1>

        {/* Description */}
        <p className="text-sm font-bold text-neutral-700 leading-relaxed mb-6">
          PanamPaaru operates strictly with <strong>zero local storage</strong> and real-time bank-grade synchronization. An active internet connection is required to open the app.
        </p>

        {/* Reassurance badge */}
        <div className="w-full bg-[#FFFDF5] border-2 border-[#121212] p-3 mb-6 text-left flex items-start gap-2.5">
          <ShieldAlert size={18} className="text-[#121212] shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-neutral-800">
            Your live portfolio, ledgers, and budgets are fully secure in cloud storage and will be available the moment you reconnect.
          </p>
        </div>

        {/* Action Button */}
        <NeoButton
          variant="primary"
          size="lg"
          onClick={handleRetry}
          disabled={isChecking}
          className="w-full flex items-center justify-center gap-2"
        >
          <RefreshCw size={16} className={isChecking ? 'animate-spin' : ''} strokeWidth={2.5} />
          <span>{isChecking ? 'Checking Connection...' : 'Recheck Connection'}</span>
        </NeoButton>
      </div>

      {/* Footer Branding */}
      <div className="relative z-10 mt-6 flex items-center gap-2 text-xs font-mono font-black uppercase tracking-widest text-[#121212]">
        <Zap size={14} className="fill-[#121212]" />
        <span>PanamPaaru · Live  Ledger</span>
      </div>
    </div>
  );
};
