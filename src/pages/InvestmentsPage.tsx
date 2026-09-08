import React from 'react';
import { Investment, PortfolioSummary, AssetType } from '../types';
import { InvestmentDashboard } from '../components/investments/InvestmentDashboard';

interface InvestmentsPageProps {
  investments: Investment[];
  portfolioSummary: PortfolioSummary | null;
  onOpenAddModal: (defaultType?: AssetType) => void;
  onOpenImportModal: () => void;
  onEdit: (inv: Investment) => void;
  onDelete: (id: string) => void;
  onQuickUpdateValue: (id: string, currentValue: number) => Promise<void>;
  currencySymbol?: string;
}

export const InvestmentsPage: React.FC<InvestmentsPageProps> = (props) => {
  return <InvestmentDashboard {...props} />;
};
