import React, { useState } from 'react';
import { Transaction, Category, TransactionType } from '../../types';
import { NeoButton } from '../ui/NeoButton';
import { NeoBadge } from '../ui/NeoBadge';
import { usePrivacy } from '../../context/PrivacyContext';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Filter,
  Trash2,
  Edit,
  Download,
  Calendar,
  AlertCircle,
} from 'lucide-react';

interface TransactionTableProps {
  transactions: Transaction[];
  categories: Category[];
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  onOpenStatement?: () => void;
  currencySymbol?: string;
}

export const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  categories,
  onEdit,
  onDelete,
  onOpenStatement,
  currencySymbol = '₹',
}) => {
  const { isPrivacyMode } = usePrivacy();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');

  // Map category colors
  const categoryColorMap = new Map(categories.map((c) => [c.name, c.color]));

  // Filtering
  const filtered = transactions.filter((tx) => {
    if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
    if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchTitle = tx.title.toLowerCase().includes(q);
      const matchCategory = tx.category.toLowerCase().includes(q);
      const matchNotes = tx.notes?.toLowerCase().includes(q);
      if (!matchTitle && !matchCategory && !matchNotes) return false;
    }
    return true;
  });

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    if (sortOrder === 'newest') return b.date.localeCompare(a.date);
    if (sortOrder === 'oldest') return a.date.localeCompare(b.date);
    if (sortOrder === 'highest') return b.amount - a.amount;
    if (sortOrder === 'lowest') return a.amount - b.amount;
    return 0;
  });

  // Export CSV
  const handleExportCSV = () => {
    if (sorted.length === 0) return;
    const headers = ['Date', 'Type', 'Category', 'Title', 'Amount', 'Notes'];
    const rows = sorted.map((t) => [
      `="${t.date}"`,
      t.type,
      `"${t.category.replace(/"/g, '""')}"`,
      `"${t.title.replace(/"/g, '""')}"`,
      t.amount,
      `"${(t.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `PanamPaaru_Transactions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Filter and Search Bar */}
      <div className="p-3 sm:p-4 bg-white border-[3px] border-[#121212] shadow-neo flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by title, category, notes..."
            className="neo-input pl-9 pr-3 py-2 text-xs font-bold"
          />
        </div>

        {/* Type & Category Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="neo-input py-2 px-2.5 text-xs font-black uppercase bg-white cursor-pointer w-auto"
          >
            <option value="all">All Types</option>
            <option value="expense">Expenses Only</option>
            <option value="income">Incomes Only</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="neo-input py-2 px-2.5 text-xs font-black uppercase bg-white cursor-pointer w-auto"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Sort Order */}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="neo-input py-2 px-2.5 text-xs font-black uppercase bg-white cursor-pointer w-auto"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="highest">Highest Amount</option>
            <option value="lowest">Lowest Amount</option>
          </select>

          {/* Statement Button */}
          {onOpenStatement && (
            <NeoButton
              variant="secondary"
              size="sm"
              onClick={onOpenStatement}
              className="flex items-center gap-1.5 shrink-0"
              title="Download Official Account Statement"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Statement</span>
            </NeoButton>
          )}

          {/* Export CSV Button */}
          <NeoButton
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={sorted.length === 0}
            className="flex items-center gap-1.5 shrink-0"
            title="Download Transactions CSV"
          >
            <Download size={14} />
            <span className="hidden sm:inline">CSV</span>
          </NeoButton>
        </div>
      </div>

      {/* Transaction Table / List */}
      <div className="w-full bg-white border-[3px] border-[#121212] shadow-neo overflow-hidden">
        {sorted.length === 0 ? (
          <div className="p-10 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm flex items-center justify-center font-black">
              <AlertCircle size={24} />
            </div>
            <p className="text-sm font-black uppercase text-[#121212]">
              No Transactions Found
            </p>
            <p className="text-xs font-semibold text-neutral-600 max-w-sm">
              No financial records match your selected search or filter criteria.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Card List (sm:hidden) */}
            <div className="sm:hidden divide-y-2 divide-neutral-200">
              {sorted.map((tx) => {
                const isExpense = tx.type === 'expense';
                const isTransfer = tx.type === 'transfer';
                const catColor = categoryColorMap.get(tx.category) || '#FFE600';
                return (
                  <div key={tx._id} className="p-3.5 flex flex-col gap-2 hover:bg-[#FFFDF5] transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 border-2 border-[#121212] flex items-center justify-center shrink-0 shadow-neo-sm ${
                            isExpense
                              ? 'bg-[#FF4343] text-white'
                              : isTransfer
                              ? 'bg-[#00F0FF] text-[#121212]'
                              : 'bg-[#05DF72] text-[#121212]'
                          }`}
                        >
                          {isExpense ? (
                            <ArrowUpRight size={14} strokeWidth={3} />
                          ) : (
                            <ArrowDownLeft size={14} strokeWidth={3} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-black text-xs text-[#121212] block truncate">
                            {tx.title}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-neutral-500">
                            {tx.date}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`font-mono font-black text-sm shrink-0 ${
                          isExpense ? 'text-[#FF4343]' : isTransfer ? 'text-[#00F0FF]' : 'text-[#05DF72]'
                        }`}
                      >
                        {isPrivacyMode
                          ? '••••••'
                          : `${isExpense ? '-' : isTransfer ? '⇄ ' : '+'} ${currencySymbol}${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-100">
                      <span
                        className="neo-badge text-[9px] py-0.5 px-2"
                        style={{ backgroundColor: catColor }}
                      >
                        {tx.category}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onEdit(tx)}
                          className="px-2.5 py-1 bg-white hover:bg-[#FFE600] border border-[#121212] shadow-neo-sm text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
                          title="Edit transaction"
                        >
                          <Edit size={11} strokeWidth={2.5} /> Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${tx.title}"?`)) {
                              onDelete(tx._id);
                            }
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-[#FF4343] hover:text-white border border-[#121212] shadow-neo-sm text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
                          title="Delete transaction"
                        >
                          <Trash2 size={11} strokeWidth={2.5} /> Del
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (hidden sm:block) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FFE600] border-b-[3px] border-[#121212] text-xs font-black uppercase tracking-wider text-[#121212]">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-neutral-200 text-xs font-bold">
                  {sorted.map((tx) => {
                    const isExpense = tx.type === 'expense';
                    const catColor = categoryColorMap.get(tx.category) || '#FFE600';
                    return (
                      <tr
                        key={tx._id}
                        className="hover:bg-[#FFFDF5] transition-colors"
                      >
                        {/* Date */}
                        <td className="py-3 px-4 font-mono font-bold whitespace-nowrap text-neutral-700">
                          {tx.date}
                        </td>

                        {/* Description / Notes */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-6 h-6 border border-[#121212] flex items-center justify-center shrink-0 ${
                                isExpense ? 'bg-[#FF4343] text-white' : 'bg-[#05DF72] text-[#121212]'
                              }`}
                            >
                              {isExpense ? (
                                <ArrowUpRight size={14} strokeWidth={3} />
                              ) : (
                                <ArrowDownLeft size={14} strokeWidth={3} />
                              )}
                            </div>
                            <div>
                              <span className="font-black text-[#121212] block">
                                {tx.title}
                              </span>
                              {tx.notes && (
                                <span className="text-[11px] font-medium text-neutral-500 line-clamp-1">
                                  {tx.notes}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Category Badge */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className="neo-badge text-[10px]"
                            style={{ backgroundColor: catColor }}
                          >
                            {tx.category}
                          </span>
                        </td>

                        {/* Amount */}
                        <td
                          className={`py-3 px-4 text-right font-mono font-black text-sm whitespace-nowrap ${
                            isExpense ? 'text-[#FF4343]' : 'text-[#05DF72]'
                          }`}
                        >
                          {isPrivacyMode
                            ? '••••••'
                            : `${isExpense ? '-' : '+'} ${currencySymbol}${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => onEdit(tx)}
                              className="p-1.5 bg-white hover:bg-[#FFE600] border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                              title="Edit transaction"
                            >
                              <Edit size={13} strokeWidth={2.5} />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Delete "${tx.title}"?`)) {
                                  onDelete(tx._id);
                                }
                              }}
                              className="p-1.5 bg-white hover:bg-[#FF4343] hover:text-white border border-[#121212] shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                              title="Delete transaction"
                            >
                              <Trash2 size={13} strokeWidth={2.5} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
