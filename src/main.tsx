import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ConvexClientProvider } from './context/ConvexClientProvider';
import { PinLockProvider } from './context/PinLockContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConvexClientProvider>
        <PinLockProvider>
          <App />
        </PinLockProvider>
      </ConvexClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
