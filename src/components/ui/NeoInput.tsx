import React, { InputHTMLAttributes, forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

interface NeoInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const NeoInput = forwardRef<HTMLInputElement, NeoInputProps>(
  ({ label, error, helperText, className, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-2">
        {label && (
          <label className="text-xs font-black uppercase tracking-wider text-[#121212] flex items-center justify-between">
            {label}
            {props.required && <span className="text-[#FF4343] font-bold">*</span>}
          </label>
        )}
        <input
          ref={ref}
          className={twMerge(
            'app-input',
            error && 'border-[#FF4343] focus:box-shadow-none',
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs font-bold text-[#FF4343] mt-1 bg-red-50 p-2 border border-[#FF4343] rounded-lg">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="text-[11px] font-semibold text-neutral-600 mt-1">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

NeoInput.displayName = 'NeoInput';
