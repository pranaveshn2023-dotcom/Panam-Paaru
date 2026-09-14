import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { offlineStorage, QueuedMutation } from '../utils/offlineStorage';
import { toast } from 'sonner';

interface OfflineContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  syncOfflineQueue: (handlers: {
    addTransaction: (data: any) => Promise<any>;
    updateTransaction: (data: any) => Promise<any>;
    deleteTransaction: (id: string) => Promise<any>;
    addBudget: (data: any) => Promise<any>;
    updateBudget: (data: any) => Promise<any>;
    deleteBudget: (id: string) => Promise<any>;
    topUpBudget: (data: any) => Promise<any>;
    addWallet: (data: any) => Promise<any>;
    updateWallet: (data: any) => Promise<any>;
    deleteWallet: (id: string) => Promise<any>;
    transferFunds: (data: any) => Promise<any>;
    addCategory: (data: any) => Promise<any>;
    updateCategory: (data: any) => Promise<any>;
    deleteCategory: (data: any) => Promise<any>;
  }) => Promise<number>;
}

const OfflineContext = createContext<OfflineContextType>({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  syncOfflineQueue: async () => 0,
});

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState<number>(() => offlineStorage.getQueue().length);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Update pending count whenever storage changes
  const updatePendingCount = useCallback(() => {
    setPendingCount(offlineStorage.getQueue().length);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Connection restored! Reconnecting to cloud...', {
        duration: 3000,
      });
      updatePendingCount();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('No internet connection. Expense tracker running offline.', {
        duration: 4000,
      });
      updatePendingCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    updatePendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updatePendingCount]);

  const syncOfflineQueue = useCallback(
    async (handlers: {
      addTransaction: (data: any) => Promise<any>;
      updateTransaction: (data: any) => Promise<any>;
      deleteTransaction: (id: string) => Promise<any>;
      addBudget: (data: any) => Promise<any>;
      updateBudget: (data: any) => Promise<any>;
      deleteBudget: (id: string) => Promise<any>;
      topUpBudget: (data: any) => Promise<any>;
      addWallet: (data: any) => Promise<any>;
      updateWallet: (data: any) => Promise<any>;
      deleteWallet: (id: string) => Promise<any>;
      transferFunds: (data: any) => Promise<any>;
      addCategory: (data: any) => Promise<any>;
      updateCategory: (data: any) => Promise<any>;
      deleteCategory: (data: any) => Promise<any>;
    }): Promise<number> => {
      if (!navigator.onLine) {
        return 0;
      }

      const queue = offlineStorage.getQueue();
      if (queue.length === 0) return 0;

      setIsSyncing(true);
      let syncedCount = 0;

      try {
        for (const item of queue) {
          try {
            switch (item.type) {
              case 'add_transaction':
                await handlers.addTransaction(item.payload);
                break;
              case 'update_transaction':
                await handlers.updateTransaction(item.payload);
                break;
              case 'delete_transaction':
                await handlers.deleteTransaction(item.payload.id);
                break;
              case 'add_budget':
                await handlers.addBudget(item.payload);
                break;
              case 'update_budget':
                await handlers.updateBudget(item.payload);
                break;
              case 'delete_budget':
                await handlers.deleteBudget(item.payload.id);
                break;
              case 'topup_budget':
                await handlers.topUpBudget(item.payload);
                break;
              case 'add_wallet':
                await handlers.addWallet(item.payload);
                break;
              case 'update_wallet':
                await handlers.updateWallet(item.payload);
                break;
              case 'delete_wallet':
                await handlers.deleteWallet(item.payload.id);
                break;
              case 'transfer_funds':
                await handlers.transferFunds(item.payload);
                break;
              case 'add_category':
                await handlers.addCategory(item.payload);
                break;
              case 'update_category':
                await handlers.updateCategory(item.payload);
                break;
              case 'delete_category':
                await handlers.deleteCategory(item.payload);
                break;
              default:
                break;
            }

            // Remove synced item from queue
            offlineStorage.removeQueueItem(item.id);
            syncedCount++;
          } catch (itemErr) {
            console.error(`[OfflineSync] Failed to sync item ${item.id}:`, itemErr);
            // If item failed permanently (e.g. invalid format), remove it to avoid blocking queue
            if (String(itemErr).includes('Invalid') || String(itemErr).includes('not found')) {
              offlineStorage.removeQueueItem(item.id);
            }
          }
        }

        updatePendingCount();

        if (syncedCount > 0) {
          toast.success(`Synced ${syncedCount} offline change${syncedCount === 1 ? '' : 's'} to cloud DB!`, {
            duration: 3500,
          });
        }
      } finally {
        setIsSyncing(false);
      }

      return syncedCount;
    },
    [updatePendingCount]
  );

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        syncOfflineQueue,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = () => useContext(OfflineContext);
