import React from 'react';
import { Category } from '../../types';
import { CategoryIcon } from './CategoryIcon';
import { Edit, Trash2, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';

interface CategoryCardProps {
  category: Category;
  onEdit: (category: Category) => void;
  onDelete: (id: string, name: string) => void;
  currencySymbol?: string;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  onEdit,
  onDelete,
  currencySymbol = '₹',
}) => {
  const isExpense = category.type === 'expense';
  const isCustom = category.isCustom ?? false;

  return (
    <div className="p-3 sm:p-4 bg-white border-[3px] border-[#121212] shadow-neo hover:translate-x-0.5 hover:-translate-y-0.5 transition-all flex items-center justify-between gap-3 group">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Category Icon Badge */}
        <div
          className="w-11 h-11 sm:w-12 sm:h-12 border-[2.5px] border-[#121212] shadow-neo-sm flex items-center justify-center shrink-0"
          style={{
            backgroundColor:
              category.color && category.color !== '#121212'
                ? category.color
                : isExpense
                ? '#FFE600'
                : '#05DF72',
          }}
        >
          <CategoryIcon
            name={category.icon || (isExpense ? 'Utensils' : 'Briefcase')}
            size={22}
            className="text-[#121212]"
            strokeWidth={2.5}
          />
        </div>

        {/* Name & Details */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-xs sm:text-sm font-black uppercase text-[#121212] truncate">
              {category.name}
            </h4>
            {isCustom ? (
              <span className="text-[9px] font-black uppercase px-1.5 py-0.2 bg-[#FFE600] text-[#121212] border border-[#121212] shadow-neo-sm">
                Custom
              </span>
            ) : (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 bg-neutral-100 text-neutral-600 border border-neutral-300">
                System
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5 text-[11px] font-bold text-neutral-600">
            <span
              className={clsx(
                'font-mono uppercase font-black text-[10px]',
                isExpense ? 'text-[#FF4343]' : 'text-[#05DF72]'
              )}
            >
              {isExpense ? 'Expense' : 'Income'}
            </span>
            <span>•</span>
            <span className="font-mono">
              {category.transactionCount ?? 0} {category.transactionCount === 1 ? 'tx' : 'txs'}
            </span>
            {Boolean(category.totalAmount) && (
              <>
                <span>•</span>
                <span className="font-mono font-black text-[#121212]">
                  {currencySymbol}{(category.totalAmount ?? 0).toLocaleString('en-IN')}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onEdit(category)}
          className="p-1.5 sm:px-2.5 sm:py-1.5 bg-white hover:bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm text-xs font-black uppercase flex items-center gap-1 cursor-pointer transition-all"
          title={`Edit ${category.name}`}
        >
          <Edit size={13} strokeWidth={2.5} />
          <span className="hidden sm:inline">Edit</span>
        </button>
        {category._id && (
          <button
            onClick={() => onDelete(category._id!, category.name)}
            className="p-1.5 sm:px-2.5 sm:py-1.5 bg-white hover:bg-[#FF4343] hover:text-white border-2 border-[#121212] shadow-neo-sm text-xs font-black uppercase flex items-center gap-1 cursor-pointer transition-all"
            title={`Delete ${category.name}`}
          >
            <Trash2 size={13} strokeWidth={2.5} />
            <span className="hidden sm:inline">Del</span>
          </button>
        )}
      </div>
    </div>
  );
};
