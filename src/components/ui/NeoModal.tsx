import React, { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

interface NeoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

const maxWidthStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
  '2xl': 'max-w-6xl',
  full: 'max-w-[96vw]',
};

export const NeoModal: React.FC<NeoModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="fixed inset-0 bg-black/40 md:bg-transparent"
        onClick={onClose}
      />
      <div
        className={twMerge(
          'relative w-full bg-white border-[3px] border-[#121212] shadow-neo-xl z-10 animate-scale-in rounded-t-2xl md:rounded-2xl max-h-[90dvh] md:max-h-[92vh] flex flex-col',
          maxWidthStyles[maxWidth]
        )}
      >
        <div className="flex items-center justify-between bg-gradient-to-r from-[#FFE600] to-[#FF8800] px-4 sm:px-5 py-3 border-b-[3px] border-[#121212] rounded-t-2xl shrink-0">
          <h3 className="text-sm font-black uppercase tracking-wider text-[#121212] flex items-center gap-2 truncate">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 bg-white hover:bg-[#FF4343] hover:text-white border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center justify-center rounded-lg shrink-0 ml-2"
          >
            <X size={18} strokeWidth={3} />
          </button>
        </div>
        <div className="p-3.5 sm:p-5 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))] flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};
