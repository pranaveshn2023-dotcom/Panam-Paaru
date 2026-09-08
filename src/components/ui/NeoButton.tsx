import React, { ButtonHTMLAttributes } from 'react';
import { twMerge } from 'tailwind-merge';

interface NeoButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'accent' | 'outline' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  isFullWidth?: boolean;
}

const variantStyles = {
  primary: 'bg-[#FFE600] text-[#121212] hover:bg-[#FFEA2E]',
  secondary: 'bg-[#05DF72] text-[#121212] hover:bg-[#2EE59D]',
  accent: 'bg-[#00F0FF] text-[#121212] hover:bg-[#38F4FF]',
  danger: 'bg-[#FF4343] text-white hover:bg-[#FF5C5C]',
  dark: 'bg-[#121212] text-white hover:bg-[#2A2A2A]',
  outline: 'bg-white text-[#121212] hover:bg-[#FFFDF5]',
};

const sizeStyles = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-5 py-3 text-sm',
  lg: 'px-7 py-4 text-base',
};

export const NeoButton: React.FC<NeoButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isFullWidth = false,
  className,
  disabled,
  ...props
}) => {
  return (
    <button
      className={twMerge(
        'app-btn app-btn-' + variant + ' ' + sizeStyles[size],
        isFullWidth && 'w-full',
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
