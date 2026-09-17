import React, { useState } from 'react';
import { Transaction, UserProfile } from '../../types';
import { NeoModal } from '../ui/NeoModal';
import { NeoButton } from '../ui/NeoButton';
import {
  FileSpreadsheet,
  Printer,
  Download,
  Calendar,
  Building,
  CheckCircle2,
  ReceiptText,
} from 'lucide-react';

interface StatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  user: UserProfile | null;
  currencySymbol?: string;
}

export const StatementModal: React.FC<StatementModalProps> = ({
  isOpen,
  onClose,
  transactions,
  user,
  currencySymbol = '₹',
}) => {
  const [periodFilter, setPeriodFilter] = useState<'this_month' | 'last_month' | 'last_3_months' | 'all'>('this_month');

  const now = new Date();

  // Compute date range based on selection
  let startDateStr = '';
  let endDateStr = new Date().toISOString().slice(0, 10);

  if (periodFilter === 'this_month') {
    startDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (periodFilter === 'last_month') {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    startDateStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;
    endDateStr = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(lastMonthEnd.getDate()).padStart(2, '0')}`;
  } else if (periodFilter === 'last_3_months') {
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    startDateStr = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;
  }

  // 1. Calculate Opening Balance Brought Forward (all transactions before startDateStr)
  let openingBalance = 0;
  if (startDateStr) {
    const priorTxs = transactions.filter((t) => t.date < startDateStr);
    const priorIncome = priorTxs.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const priorExpense = priorTxs.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    openingBalance = priorIncome - priorExpense;
  }

  // 2. Filter transactions within selected period, sorted chronologically ascending
  // If transactions occur on the same date, process INFLOW (Credits) first to avoid negative running balance
  const chronologicalTxs = [...transactions]
    .filter((t) => {
      if (startDateStr && t.date < startDateStr) return false;
      if (endDateStr && t.date > endDateStr) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      // On same date, credits (income) process first
      if (a.type !== b.type) {
        return a.type === 'income' ? -1 : 1;
      }
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });

  // Calculate Running Balance starting from openingBalance
  let runningBalance = openingBalance;
  const statementRows = chronologicalTxs.map((t) => {
    const isCredit = t.type === 'income';
    if (isCredit) {
      runningBalance += t.amount;
    } else {
      runningBalance -= t.amount;
    }
    return {
      ...t,
      refId: `TXN-${t._id.slice(-6).toUpperCase()}`,
      credit: isCredit ? t.amount : null,
      debit: !isCredit ? t.amount : null,
      balanceAfter: runningBalance,
    };
  });

  const totalCredits = chronologicalTxs
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDebits = chronologicalTxs
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const closingBalance = openingBalance + totalCredits - totalDebits;

  // Handle Printable Bank Statement (PDF generation via Print Window)
  const handlePrintStatement = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to generate statement');
      return;
    }

    const statementHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Account Statement - PanamPaaru</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #121212;
            padding: 40px;
            margin: 0;
            background: #ffffff;
          }
          .statement-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 3px solid #121212;
            padding-bottom: 20px;
            margin-bottom: 25px;
          }
          .brand-title {
            font-size: 26px;
            font-weight: 900;
            letter-spacing: -0.5px;
            text-transform: uppercase;
          }
          .brand-subtitle {
            font-size: 11px;
            font-weight: 700;
            color: #555;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 3px;
          }
          .statement-badge {
            background: #FFE600;
            color: #121212;
            border: 2px solid #121212;
            padding: 4px 12px;
            font-weight: 900;
            font-size: 12px;
            text-transform: uppercase;
            display: inline-block;
          }
          .account-summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 30px;
          }
          .summary-card {
            border: 2px solid #121212;
            padding: 12px 15px;
            background: #FFFDF5;
          }
          .summary-label {
            font-size: 10px;
            font-weight: 800;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 5px;
          }
          .summary-value {
            font-size: 18px;
            font-weight: 900;
            font-family: monospace;
          }
          .text-green { color: #058f4c; }
          .text-red { color: #d32f2f; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 12px;
          }
          th {
            background: #121212;
            color: #ffffff;
            font-weight: 800;
            text-transform: uppercase;
            padding: 10px 12px;
            text-align: left;
            font-size: 11px;
          }
          th.text-right, td.text-right { text-align: right; }
          td {
            padding: 10px 12px;
            border-bottom: 1px solid #e0e0e0;
            font-weight: 600;
          }
          tr:nth-child(even) { background-color: #fafafa; }
          .mono { font-family: monospace; font-size: 12px; }
          .footer-note {
            margin-top: 40px;
            padding-top: 15px;
            border-top: 1px dashed #aaa;
            font-size: 10px;
            color: #777;
            display: flex;
            justify-content: space-between;
          }
          @media print {
            body { padding: 20px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="statement-header">
          <div>
            <div class="brand-title">PanamPaaru</div>
            <div class="brand-subtitle">Official Account Statement · பணம் பாரு</div>
            <div style="margin-top: 10px; font-size: 12px; font-weight: bold;">
              Account Holder: ${user?.name || 'Authorized Account'}<br />
              Email: ${user?.email || 'N/A'}
            </div>
          </div>
          <div style="text-align: right;">
            <div class="statement-badge">ACCOUNT STATEMENT</div>
            <div style="font-size: 11px; font-weight: bold; margin-top: 8px; font-family: monospace;">
              Period: ${startDateStr || 'All Time'} to ${endDateStr}<br />
              Generated: ${new Date().toLocaleString()}
            </div>
          </div>
        </div>

        <div class="account-summary-grid">
          <div class="summary-card">
            <div class="summary-label">Opening Balance</div>
            <div class="summary-value">${currencySymbol}${openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Total Deposits (+)</div>
            <div class="summary-value text-green">+${currencySymbol}${totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Total Outflow (-)</div>
            <div class="summary-value text-red">-${currencySymbol}${totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="summary-card" style="border: 2.5px solid #058f4c; background: #f0fdf4;">
            <div class="summary-label" style="color: #058f4c; font-weight: 900;">Closing Net Balance</div>
            <div class="summary-value text-green" style="font-size: 20px;"><strong>${currencySymbol}${closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Description / Category</th>
              <th class="text-right">Debit (-)</th>
              <th class="text-right">Credit (+)</th>
              <th class="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${
              startDateStr
                ? `
              <tr style="background-color: #fff9db;">
                <td class="mono">${startDateStr}</td>
                <td class="mono">OPENING</td>
                <td><strong>Opening Balance Brought Forward</strong></td>
                <td class="text-right">-</td>
                <td class="text-right">-</td>
                <td class="text-right mono"><strong>${currencySymbol}${openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            `
                : ''
            }
            ${statementRows
              .map(
                (row) => `
              <tr>
                <td class="mono">${row.date}</td>
                <td class="mono">${row.refId}</td>
                <td>
                  <strong>${row.title}</strong>
                  <div style="font-size: 10px; color: #666;">${row.category}${row.notes ? ' · ' + row.notes : ''}</div>
                </td>
                <td class="text-right mono text-red">${row.debit ? '-' + currencySymbol + row.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
                <td class="text-right mono text-green">${row.credit ? '+' + currencySymbol + row.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}</td>
                <td class="text-right mono"><strong>${currencySymbol}${row.balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <div class="footer-note">
          <span>This is an official computer-generated account statement from PanamPaaru.</span>
          <span>Authentication Ref: PP-${Date.now().toString(36).toUpperCase()}-${(user?._id || 'ACC').slice(-4).toUpperCase()}-${statementRows.length.toString(16).padStart(4, '0').toUpperCase()} · End of Statement</span>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(statementHtml);
    printWindow.document.close();
  };

  // Export as CSV Spreadsheet
  const handleDownloadCSV = () => {
    if (statementRows.length === 0 && openingBalance === 0) return;
    const headers = ['Date', 'Reference ID', 'Description', 'Category', 'Debit (-)', 'Credit (+)', 'Running Balance', 'Notes'];
    
    const rows: any[] = [];
    
    // Include Opening Balance Row if period filter is used
    if (startDateStr) {
      rows.push([
        `="${startDateStr}"`,
        `"OPENING"`,
        `"Opening Balance Brought Forward"`,
        `"Balance Forward"`,
        '',
        '',
        openingBalance,
        `"Opening balance before ${startDateStr}"`,
      ]);
    }

    statementRows.forEach((r) => {
      rows.push([
        `="${r.date}"`,
        `"${r.refId}"`,
        `"${r.title.replace(/"/g, '""')}"`,
        `"${r.category.replace(/"/g, '""')}"`,
        r.debit ?? '',
        r.credit ?? '',
        r.balanceAfter,
        `"${(r.notes || '').replace(/"/g, '""')}"`,
      ]);
    });

    // Include UTF-8 BOM so Excel opens with proper encoding and column formatting
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `PanamPaaru_Statement_${startDateStr || 'All'}_to_${endDateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={onClose}
      title="DOWNLOAD ACCOUNT STATEMENT"
      maxWidth="lg"
    >
      <div className="flex flex-col gap-5">
        
        {/* Period Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-black uppercase tracking-wider text-[#121212]">
            Select Statement Duration
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'last_3_months', label: 'Last 3 Months' },
              { id: 'all', label: 'All Time' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodFilter(p.id as any)}
                className={`p-2.5 text-xs font-black uppercase border-2 transition-all cursor-pointer text-center ${
                  periodFilter === p.id
                    ? 'bg-[#FFE600] text-[#121212] border-[#121212] shadow-neo-sm'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:border-[#121212]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Statement Summary Card */}
        <div className="p-4 bg-[#FFFDF5] border-2 border-[#121212] shadow-neo-sm flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-[#121212]/20 pb-2">
            <span className="text-xs font-black uppercase text-[#121212] flex items-center gap-1.5">
              <ReceiptText size={16} className="text-[#05DF72]" />
              Statement Summary Preview
            </span>
            <span className="text-[11px] font-mono font-bold bg-[#121212] text-[#FFE600] px-2 py-0.5">
              {statementRows.length} ENTRIES
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            <div>
              <span className="text-[10px] font-sans font-bold text-neutral-500 block uppercase">Opening Bal</span>
              <span className="font-black text-[#121212]">{currencySymbol}{openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="text-[10px] font-sans font-bold text-neutral-500 block uppercase">Total Credits (+)</span>
              <span className="font-black text-[#05DF72]">+{currencySymbol}{totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="text-[10px] font-sans font-bold text-neutral-500 block uppercase">Total Debits (-)</span>
              <span className="font-black text-[#FF4343]">-{currencySymbol}{totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="text-[10px] font-sans font-bold text-neutral-500 block uppercase">Closing Balance</span>
              <span className="font-black text-[#05DF72] text-sm">
                {currencySymbol}{closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Action Download Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {/* Print / PDF Option */}
          <button
            onClick={handlePrintStatement}
            disabled={statementRows.length === 0 && openingBalance === 0}
            className="neo-btn bg-[#FFE600] hover:bg-[#FFEA2E] text-[#121212] py-3 px-4 flex items-center justify-center gap-2 border-2 border-[#121212] shadow-neo cursor-pointer disabled:opacity-50"
          >
            <Printer size={16} strokeWidth={2.5} />
            <span>Print / Save as PDF</span>
          </button>

          {/* CSV Spreadsheet Option */}
          <button
            onClick={handleDownloadCSV}
            disabled={statementRows.length === 0 && openingBalance === 0}
            className="neo-btn bg-[#05DF72] hover:bg-[#2EE59D] text-[#121212] py-3 px-4 flex items-center justify-center gap-2 border-2 border-[#121212] shadow-neo cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet size={16} strokeWidth={2.5} />
            <span>Download CSV Statement</span>
          </button>
        </div>

      </div>
    </NeoModal>
  );
};
