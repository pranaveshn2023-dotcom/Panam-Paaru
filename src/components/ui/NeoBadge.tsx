import React, { ReactNode, CSSProperties } from 'react';
import { twMerge } from 'tailwind-merge';

interface NeoBadgeProps {
  children: ReactNode;
  variant?: 'yellow' | 'green' | 'red' | 'purple' | 'cyan' | 'dark' | 'white';
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
}

export const NeoBadge: React.FC<NeoBadgeProps> = ({
  children,
  variant = 'yellow',
  className,
  onClick,
  style,
}) => {
  const variantStyles = {
    yellow: 'bg-[#FFE600] text-[#121212]',
    green: 'bg-[#05DF72] text-[#121212]',
    red: 'bg-[#FF4343] text-white',
    purple: 'bg-[#9B51E0] text-white',
    cyan: 'bg-[#00F0FF] text-[#121212]',
    dark: 'bg-[#121212] text-white',
    white: 'bg-white text-[#121212]',
  };

  return (
    <span
      onClick={onClick}
      className={twMerge(
        'neo-badge cursor-default',
        variantStyles[variant],
        onClick && 'cursor-pointer hover:translate-x-[-1px] hover:translate-y-[-1px]',
        className
      )}
      style={style}
    >
      {children}
    </span>
  );
};
