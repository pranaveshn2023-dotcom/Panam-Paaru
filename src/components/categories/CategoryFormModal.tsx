import React, { useState, useEffect } from 'react';
import { NeoModal } from '../ui/NeoModal';
import { NeoButton } from '../ui/NeoButton';
import { NeoInput } from '../ui/NeoInput';
import { Category, TransactionType } from '../../types';
import {
  CategoryIcon,
  CATEGORY_ICONS,
  CATEGORY_PALETTE,
  CategoryIconOption,
} from './CategoryIcon';
import { Sparkles, Palette, Tag, Check, Search } from 'lucide-react';
import { clsx } from 'clsx';

interface CategoryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    type: 'income' | 'expense';
    color: string;
    icon: string;
    id?: string;
  }) => Promise<void>;
  initialData?: Category | null;
  defaultType?: 'income' | 'expense';
}

export const CategoryFormModal: React.FC<CategoryFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  defaultType = 'expense',
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'income' | 'expense'>(defaultType);
  const [color, setColor] = useState('#FFE600');
  const [icon, setIcon] = useState('Utensils');
  const [iconSearch, setIconSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setType(initialData.type === 'income' ? 'income' : 'expense');
      setColor(
        initialData.color && initialData.color !== '#121212'
          ? initialData.color
          : initialData.type === 'income'
          ? '#05DF72'
          : '#FFE600'
      );
      setIcon(initialData.icon || (initialData.type === 'income' ? 'Briefcase' : 'Utensils'));
    } else {
      setName('');
      setType(defaultType);
      setColor(defaultType === 'income' ? '#05DF72' : '#FFE600');
      setIcon(defaultType === 'income' ? 'Briefcase' : 'Utensils');
    }
    setIconSearch('');
    setSelectedGroup('All');
    setError('');
  }, [initialData, isOpen, defaultType]);

  const groups = ['All', 'Food', 'Shopping', 'Transport', 'Bills', 'Health', 'Life', 'Income', 'General'];

  const filteredIcons = CATEGORY_ICONS.filter((item: CategoryIconOption) => {
    const matchesSearch =
      item.label.toLowerCase().includes(iconSearch.toLowerCase()) ||
      item.name.toLowerCase().includes(iconSearch.toLowerCase());
    const matchesGroup = selectedGroup === 'All' || item.group === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a category name');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      await onSubmit({
        name: trimmed,
        type,
        color,
        icon,
        id: initialData?._id,
      });
      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message || 'Failed to save category. Please try again.');
    }
  };

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'EDIT CATEGORY' : 'NEW CATEGORY'}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Live Preview Card (MyMoney Style) */}
        <div className="p-4 bg-[#FFFDF5] border-[3px] border-[#121212] shadow-neo flex items-center gap-4">
          <div
            className="w-14 h-14 border-[2.5px] border-[#121212] shadow-neo-sm flex items-center justify-center shrink-0 transition-colors"
            style={{ backgroundColor: color }}
          >
            <CategoryIcon name={icon} size={28} className="text-[#121212]" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  'text-[10px] font-black uppercase px-2 py-0.5 border border-[#121212] shadow-neo-sm',
                  type === 'expense' ? 'bg-[#FF4343] text-white' : 'bg-[#05DF72] text-[#121212]'
                )}
              >
                {type.toUpperCase()}
              </span>
              <span className="text-[10px] font-black text-neutral-500 uppercase">Live Preview</span>
            </div>
            <h4 className="text-base font-black uppercase text-[#121212] truncate mt-1">
              {name.trim() || 'Category Name'}
            </h4>
          </div>
        </div>

        {/* Type Switcher: Expense vs Income */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-black uppercase tracking-wider text-[#121212]">
            Category Type *
          </label>
          <div className="grid grid-cols-2 gap-2 bg-neutral-100 p-1 border-2 border-[#121212]">
            <button
              type="button"
              onClick={() => {
                setType('expense');
                if (!initialData && color === '#05DF72') setColor('#FFE600');
              }}
              className={clsx(
                'py-2 px-3 text-xs font-black uppercase border-2 transition-all cursor-pointer flex items-center justify-center gap-1.5',
                type === 'expense'
                  ? 'bg-[#FF4343] text-white border-[#121212] shadow-neo-sm'
                  : 'bg-transparent text-neutral-600 border-transparent hover:text-black'
              )}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => {
                setType('income');
                if (!initialData && color === '#FFE600') setColor('#05DF72');
              }}
              className={clsx(
                'py-2 px-3 text-xs font-black uppercase border-2 transition-all cursor-pointer flex items-center justify-center gap-1.5',
                type === 'income'
                  ? 'bg-[#05DF72] text-[#121212] border-[#121212] shadow-neo-sm'
                  : 'bg-transparent text-neutral-600 border-transparent hover:text-black'
              )}
            >
              Income
            </button>
          </div>
        </div>

        {/* Category Name Input */}
        <NeoInput
          label="Category Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === 'expense' ? 'e.g. Gym & Fitness, Pet Food, Coffee' : 'e.g. Dividends, Consulting, Rental Income'}
          required
          autoFocus
        />

        {/* Color Palette Picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-black uppercase tracking-wider text-[#121212] flex items-center gap-1.5">
            <Palette size={13} />
            Badge Color
          </label>
          <div className="flex flex-wrap gap-2 p-2.5 bg-neutral-50 border-2 border-[#121212]">
            {CATEGORY_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={clsx(
                  'w-7 h-7 sm:w-8 sm:h-8 border-2 border-[#121212] flex items-center justify-center transition-transform cursor-pointer',
                  color === c ? 'scale-110 shadow-neo-sm ring-2 ring-black' : 'hover:scale-105'
                )}
                style={{ backgroundColor: c }}
                title={c}
              >
                {color === c && (
                  <Check
                    size={14}
                    strokeWidth={3}
                    className="text-[#121212]"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Icon Selector with Category Filter & Search */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black uppercase tracking-wider text-[#121212] flex items-center gap-1.5">
              <Tag size={13} />
              Category Icon
            </label>
            <span className="text-[11px] font-bold text-neutral-500">
              {filteredIcons.length} {filteredIcons.length === 1 ? 'icon' : 'icons'} available
            </span>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={iconSearch}
              onChange={(e) => setIconSearch(e.target.value)}
              placeholder="Search icons (e.g. food, car, gym, tech)..."
              className="w-full pl-8 pr-8 py-1.5 text-xs font-bold bg-white border-2 border-[#121212] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFE600]"
            />
            {iconSearch && (
              <button
                type="button"
                onClick={() => setIconSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-neutral-500 hover:text-black cursor-pointer p-0.5"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Group Filter Chips (Responsive Wrap) */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {groups.map((grp) => (
              <button
                key={grp}
                type="button"
                onClick={() => setSelectedGroup(grp)}
                className={clsx(
                  'px-2.5 py-1 text-[10px] font-black uppercase border-2 whitespace-nowrap cursor-pointer transition-all',
                  selectedGroup === grp
                    ? 'bg-[#121212] text-white border-[#121212] shadow-neo-sm'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:border-black hover:bg-neutral-50'
                )}
              >
                {grp}
              </button>
            ))}
          </div>

          {/* Icon Grid */}
          <div className="grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2 p-2.5 bg-neutral-50 border-2 border-[#121212] max-h-52 overflow-y-auto overscroll-contain">
            {filteredIcons.map((item) => {
              const isSelected = icon === item.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => setIcon(item.name)}
                  title={item.label}
                  className={clsx(
                    'p-2 sm:p-2.5 flex flex-col items-center justify-center gap-1 border-2 transition-all cursor-pointer aspect-square',
                    isSelected
                      ? 'bg-[#121212] text-white border-[#121212] shadow-neo-sm scale-105'
                      : 'bg-white text-[#121212] border-neutral-200 hover:border-black hover:bg-neutral-100 active:scale-95'
                  )}
                >
                  <CategoryIcon
                    name={item.name}
                    size={22}
                    className={isSelected ? 'text-white' : 'text-[#121212]'}
                    strokeWidth={isSelected ? 3 : 2}
                  />
                </button>
              );
            })}
            {filteredIcons.length === 0 && (
              <div className="col-span-full py-6 text-center text-xs font-bold text-neutral-500">
                No icons found matching "{iconSearch}"
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-[#FF4343] text-white text-xs font-bold p-2.5 border-2 border-[#121212] shadow-neo-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-2">
          <NeoButton type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </NeoButton>
          <NeoButton type="submit" variant="secondary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : initialData ? 'Update Category' : 'Create Category'}
          </NeoButton>
        </div>
      </form>
    </NeoModal>
  );
};
