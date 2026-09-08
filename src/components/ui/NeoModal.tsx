import React, { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

interface NeoModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

const maxWidthStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className="fixed inset-0 bg-black/30 md:bg-transparent"
        onClick={onClose}
      />
      <div
        className={twMerge(
          'relative w-full bg-white border-[3px] border-[#121212] shadow-neo-xl z-10 animate-scale-in md:rounded-2xl md:rounded-b-none',
          maxWidthStyles[maxWidth]
        )}
      >
        <div className="flex items-center justify-between bg-gradient-to-r from-[#FFE600] to-[#FF8800] px-5 py-3 border-b-[3px] border-[#121212] rounded-t-[16px] md:rounded-t-none">
          <h3 className="text-sm font-black uppercase tracking-wider text-[#121212] flex items-center gap-2">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 bg-white hover:bg-[#FF4343] hover:text-white border-2 border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center justify-center rounded-lg"
          >
            <X size={18} strokeWidth={3} />
          </button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};
