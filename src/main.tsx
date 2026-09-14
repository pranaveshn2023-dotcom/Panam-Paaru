import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ConvexClientProvider } from './context/ConvexClientProvider';
import { PinLockProvider } from './context/PinLockContext';
import { OfflineProvider } from './context/OfflineContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConvexClientProvider>
        <PinLockProvider>
          <OfflineProvider>
            <App />
          </OfflineProvider>
        </PinLockProvider>
      </ConvexClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
