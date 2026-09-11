import React from 'react';
import { Lock } from 'lucide-react';

interface SecuringSessionScreenProps {
  message?: string;
  subMessage?: string;
}

export const SecuringSessionScreen: React.FC<SecuringSessionScreenProps> = ({
  message = 'Securing Session...',
  subMessage = 'Verifying security lock & credentials',
}) => {
  return (
    <div className="min-h-screen w-full bg-[#0C0C0E] flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-200">
      <div className="flex flex-col items-center text-center max-w-sm">
        {/* Amber glowing lock icon container matching Sikkanam style */}
        <div className="relative mb-6 flex items-center justify-center">
          <div className="absolute w-20 h-20 rounded-2xl bg-[#F59E0B]/10 blur-xl animate-pulse" />
          <div className="relative w-16 h-16 rounded-2xl bg-[#1A1A1E] border-2 border-[#F59E0B]/30 flex items-center justify-center shadow-lg shadow-black/40">
            <Lock className="w-7 h-7 text-[#F59E0B] animate-pulse" strokeWidth={2.5} />
          </div>
        </div>

        {/* Title & subtitle */}
        <h2 className="text-lg sm:text-xl font-bold text-white tracking-wide mb-1.5">
          {message}
        </h2>
        <p className="text-xs text-neutral-400 font-medium">
          {subMessage}
        </p>

        {/* Minimal loading bar */}
        <div className="w-36 h-1 bg-neutral-800 rounded-full mt-6 overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-[#F59E0B] via-[#FFE600] to-[#F59E0B] rounded-full animate-[shimmer_1.5s_infinite]" />
        </div>
      </div>
    </div>
  );
};
