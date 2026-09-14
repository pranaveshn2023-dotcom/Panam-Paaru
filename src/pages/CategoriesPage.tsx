import React, { useState, useMemo } from 'react';
import { Category } from '../types';
import { CategoryCard } from '../components/categories/CategoryCard';
import { CategoryFormModal } from '../components/categories/CategoryFormModal';
import { NeoButton } from '../components/ui/NeoButton';
import { NeoModal } from '../components/ui/NeoModal';
import { Plus, Search, Tag, Filter, Layers, CheckCircle2, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

interface CategoriesPageProps {
  categories: Category[];
  onCreateCategory: (data: {
    name: string;
    type: 'income' | 'expense';
    color: string;
    icon: string;
  }) => Promise<void>;
  onUpdateCategory: (data: {
    id: string;
    name: string;
    type: 'income' | 'expense';
    color: string;
    icon: string;
  }) => Promise<void>;
  onDeleteCategory: (id: string, reassignTo?: string) => Promise<void>;
  currencySymbol?: string;
}

export const CategoriesPage: React.FC<CategoriesPageProps> = ({
  categories,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  currencySymbol = '₹',
}) => {
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const expenseCount = useMemo(
    () => categories.filter((c) => c.type === 'expense').length,
    [categories]
  );
  const incomeCount = useMemo(
    () => categories.filter((c) => c.type === 'income').length,
    [categories]
  );
  const customCount = useMemo(
    () => categories.filter((c) => c.isCustom).length,
    [categories]
  );

  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const matchesType = filterType === 'all' || c.type === filterType;
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [categories, filterType, searchTerm]);

  const handleOpenAdd = () => {
    setEditingCategory(null);
    setIsFormModalOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setIsFormModalOpen(true);
  };

  const handlePromptDelete = (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await onDeleteCategory(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFormSubmit = async (data: {
    name: string;
    type: 'income' | 'expense';
    color: string;
    icon: string;
    id?: string;
  }) => {
    if (data.id) {
      await onUpdateCategory({
        id: data.id,
        name: data.name,
        type: data.type,
        color: data.color,
        icon: data.icon,
      });
    } else {
      await onCreateCategory({
        name: data.name,
        type: data.type,
        color: data.color,
        icon: data.icon,
      });
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full animate-in fade-in duration-150">
      {/* Top Banner (MyMoney Style Category Overview) */}
      <div className="p-4 sm:p-5 bg-white border-[3px] border-[#121212] shadow-neo flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm flex items-center justify-center shrink-0">
            <Tag size={24} className="text-[#121212]" strokeWidth={2.5} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black uppercase text-[#121212]">
                Category Manager
              </h2>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-[#05DF72] text-[#121212] border border-[#121212] shadow-neo-sm">
                CRUD Enabled
              </span>
            </div>
            <p className="text-xs font-bold text-neutral-600 mt-0.5">
              Organize and customize spending and income buckets with custom icons and colors.
            </p>
          </div>
        </div>

        {/* Stats Pill Badges & Add Button */}
        <div className="flex items-center flex-wrap gap-2 w-full md:w-auto justify-between md:justify-end">
          <div className="flex items-center gap-1.5 text-xs font-black">
            <span className="px-2 py-1 bg-neutral-100 border border-[#121212] font-mono">
              Total: {categories.length}
            </span>
            <span className="px-2 py-1 bg-[#FF4343]/15 text-[#FF4343] border border-[#FF4343] font-mono">
              Exp: {expenseCount}
            </span>
            <span className="px-2 py-1 bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72] font-mono">
              Inc: {incomeCount}
            </span>
          </div>

          <NeoButton
            variant="secondary"
            size="sm"
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-3 py-2 shrink-0 cursor-pointer"
          >
            <Plus size={15} strokeWidth={3} />
            <span>New Category</span>
          </NeoButton>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="p-3 bg-white border-[3px] border-[#121212] shadow-neo flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Type Segmented Switch */}
        <div className="flex items-center gap-1 bg-neutral-100 p-1 border-2 border-[#121212] self-start sm:self-center">
          <button
            onClick={() => setFilterType('all')}
            className={clsx(
              'px-3 py-1.5 text-xs font-black uppercase transition-all cursor-pointer',
              filterType === 'all'
                ? 'bg-[#121212] text-white shadow-neo-sm'
                : 'bg-transparent text-neutral-600 hover:text-black'
            )}
          >
            All ({categories.length})
          </button>
          <button
            onClick={() => setFilterType('expense')}
            className={clsx(
              'px-3 py-1.5 text-xs font-black uppercase transition-all cursor-pointer',
              filterType === 'expense'
                ? 'bg-[#FF4343] text-white shadow-neo-sm'
                : 'bg-transparent text-neutral-600 hover:text-black'
            )}
          >
            Expense ({expenseCount})
          </button>
          <button
            onClick={() => setFilterType('income')}
            className={clsx(
              'px-3 py-1.5 text-xs font-black uppercase transition-all cursor-pointer',
              filterType === 'income'
                ? 'bg-[#05DF72] text-[#121212] shadow-neo-sm'
                : 'bg-transparent text-neutral-600 hover:text-black'
            )}
          >
            Income ({incomeCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search categories..."
            className="neo-input pl-8 pr-3 py-1.5 text-xs font-bold w-full"
          />
        </div>
      </div>

      {/* Category Cards Grid */}
      {filteredCategories.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredCategories.map((cat) => (
            <CategoryCard
              key={cat._id || `${cat.type}-${cat.name}`}
              category={cat}
              onEdit={handleEdit}
              onDelete={handlePromptDelete}
              currencySymbol={currencySymbol}
            />
          ))}
        </div>
      ) : (
        <div className="p-8 bg-white border-[3px] border-[#121212] shadow-neo text-center flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 bg-neutral-100 border-2 border-[#121212] flex items-center justify-center text-neutral-400">
            <Tag size={28} />
          </div>
          <h3 className="text-sm font-black uppercase text-[#121212]">No Categories Found</h3>
          <p className="text-xs font-bold text-neutral-500 max-w-md">
            {searchTerm
              ? `No categories match "${searchTerm}". Try a different keyword.`
              : `No ${filterType} categories found. Click "New Category" to add one!`}
          </p>
          <NeoButton variant="secondary" size="sm" onClick={handleOpenAdd}>
            <Plus size={14} strokeWidth={2.5} className="mr-1" />
            Create Category
          </NeoButton>
        </div>
      )}

      {/* CRUD Form Modal */}
      <CategoryFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingCategory(null);
        }}
        onSubmit={handleFormSubmit}
        initialData={editingCategory}
        defaultType={filterType === 'income' ? 'income' : 'expense'}
      />

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <NeoModal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          title="DELETE CATEGORY"
          maxWidth="sm"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 p-3.5 bg-[#FFF2F2] border-2 border-[#FF4343]">
              <AlertTriangle size={20} className="text-[#FF4343] shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-black uppercase text-[#121212] block">
                  Delete &ldquo;{deleteTarget.name}&rdquo;?
                </span>
                <p className="font-bold text-neutral-700 mt-1 leading-relaxed">
                  Existing transactions and budgets linked to this category will be automatically reassigned to fallback (&ldquo;Other Expense&rdquo; / &ldquo;Other Income&rdquo;) so no transaction history is lost.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <NeoButton
                type="button"
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                Cancel
              </NeoButton>
              <NeoButton
                type="button"
                variant="danger"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </NeoButton>
            </div>
          </div>
        </NeoModal>
      )}
    </div>
  );
};
