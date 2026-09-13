import React from 'react';
import { twMerge } from 'tailwind-merge';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  className?: string;
}

/**
 * High-Impact Single 'P' Monogram with Integrated Bitcoin / Currency Symbol (₿)
 * - Athletic slanted capital 'P'
 * - Dual vertical Bitcoin prong cuts (top & bottom)
 * - Crisp gold/black Neo-Brutalist contrast
 */
export const PanamBitcoinIcon: React.FC<{
  className?: string;
  primaryColor?: string;
  accentColor?: string;
}> = ({
  className = 'w-9 h-9',
  primaryColor = '#121212',
  accentColor = '#FFE600',
}) => {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* 14-degree forward italic slant */}
      <g transform="skewX(-14) translate(14, 0)">
        
        {/* Top Bitcoin Dual Vertical Stems (Prongs) */}
        <rect x="42" y="6" width="6" height="12" rx="1" fill={primaryColor} />
        <rect x="56" y="6" width="6" height="12" rx="1" fill={primaryColor} />

        {/* Main Solid Capital 'P' Silhouette */}
        <path
          d="
            M 24 14
            H 62
            C 78 14 88 24 88 40
            C 88 56 78 66 62 66
            H 42
            V 90
            H 24
            V 14
            Z
          "
          fill={primaryColor}
        />

        {/* Inner Counter Window of 'P' in Electric Sunny Gold */}
        <path
          d="
            M 42 26
            H 60
            C 69 26 74 32 74 40
            C 74 48 69 54 60 54
            H 42
            V 26
            Z
          "
          fill={accentColor}
        />

        {/* Bitcoin Middle Horizontal Currency Slash */}
        <rect
          x="30"
          y="37"
          width="48"
          height="6"
          rx="1"
          fill={primaryColor}
        />

        {/* Bottom Bitcoin Dual Vertical Stems (Prongs) below the P loop */}
        <rect x="42" y="62" width="6" height="12" rx="1" fill={primaryColor} />
        <rect x="56" y="62" width="6" height="12" rx="1" fill={primaryColor} />

        {/* Emerald Wealth Node Sparkle */}
        <circle cx="59" cy="40" r="3.5" fill="#05DF72" stroke={primaryColor} strokeWidth="1.5" />
      </g>
    </svg>
  );
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showSubtitle = true,
  className,
}) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-7 h-7 sm:w-9 sm:h-9',
    lg: 'w-10 h-10 sm:w-12 sm:h-12',
    xl: 'w-14 h-14 sm:w-16 sm:h-16',
  };

  const titleSizes = {
    sm: 'text-sm sm:text-base',
    md: 'text-base sm:text-xl',
    lg: 'text-xl sm:text-2xl',
    xl: 'text-3xl sm:text-4xl',
  };

  return (
    <div className={twMerge('flex items-center gap-3 select-none cursor-pointer group', className)}>
      {/* High-Contrast Neo-Brutalist Badge */}
      <div className="relative bg-[#FFE600] border-[2.5px] border-[#121212] shadow-neo-sm p-1.5 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 group-hover:shadow-neo">
        <PanamBitcoinIcon className={iconSizes[size]} />
      </div>

      {/* Brand Typography */}
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-1.5 leading-none">
          <span className={twMerge('font-black uppercase tracking-tight text-[#121212]', titleSizes[size])}>
            PANAM
          </span>
          <span className={twMerge('font-black uppercase tracking-tight text-[#121212] bg-[#FFE600] px-1.5 py-0.5 border border-[#121212] shadow-neo-sm leading-none', titleSizes[size])}>
            PAARU
          </span>
        </div>
        {showSubtitle && (
          <span className="text-[10px] font-mono font-bold tracking-wider text-neutral-600 uppercase mt-1">
            பணம் பாரு · See Your Money. Control Your Spending.
          </span>
        )}
      </div>
    </div>
  );
};
