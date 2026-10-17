import React, { createContext, useContext, useState, ReactNode } from 'react';

interface PrivacyContextType {
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
  setPrivacyMode: (enabled: boolean) => void;
  formatPrivateAmount: (amount: number | string, symbol?: string) => string;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export const PrivacyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Always start masked (true) by default whenever the app is opened or refreshed
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(true);

  const togglePrivacyMode = () => {
    if (navigator.vibrate) navigator.vibrate(15);
    setIsPrivacyMode((prev) => !prev);
  };

  const setPrivacyMode = (enabled: boolean) => {
    setIsPrivacyMode(enabled);
  };

  const formatPrivateAmount = (amount: number | string, symbol = '₹'): string => {
    if (isPrivacyMode) {
      return '••••••';
    }
    let num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return `${symbol}0.00`;
    // Normalize any tiny floating point residue or negative zero to 0
    if (Math.abs(num) < 0.005 || Object.is(num, -0)) {
      num = 0;
    }
    const isNegative = num < 0;
    const formatted = Math.abs(num).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return isNegative ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
  };

  return (
    <PrivacyContext.Provider
      value={{
        isPrivacyMode,
        togglePrivacyMode,
        setPrivacyMode,
        formatPrivateAmount,
      }}
    >
      {children}
    </PrivacyContext.Provider>
  );
};

export const formatCurrency = (
  amount: number | string,
  symbol = '₹',
  minDecimals = 0,
  maxDecimals = 2
): string => {
  let num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num) || Math.abs(num) < 0.005 || Object.is(num, -0)) {
    num = 0;
  }
  const isNegative = num < 0;
  const formatted = Math.abs(num).toLocaleString('en-IN', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });
  return isNegative ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
};

export const usePrivacy = () => {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error('usePrivacy must be used within a PrivacyProvider');
  }
  return context;
};
