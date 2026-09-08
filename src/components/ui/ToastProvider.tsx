import React from 'react';
import { Toaster } from 'sonner';

export const ToastProvider: React.FC = () => {
  return (
    <Toaster
      position="top-right"
      richColors
      toastOptions={{
        className: 'neo-toast',
        style: {
          background: '#FFFDF5',
          border: '3px solid #121212',
          boxShadow: '4px 4px 0px 0px #121212',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontSize: '14px',
        },
      }}
    />
  );
};
