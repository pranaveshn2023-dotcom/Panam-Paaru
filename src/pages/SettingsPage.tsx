import React, { useState } from 'react';
import { UserProfile } from '../types';
import { NeoButton } from '../components/ui/NeoButton';
import { NeoInput } from '../components/ui/NeoInput';
import { NeoModal } from '../components/ui/NeoModal';
import { usePinLock } from '../context/PinLockContext';
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Lock,
  Globe,
  Check,
  LogOut,
  User,
  KeyRound,
  Edit2,
  Tag,
} from 'lucide-react';

interface SettingsPageProps {
  user?: UserProfile | null;
  onOpenPinSetup: (isChange?: boolean) => void;
  onUpdateCurrency: (currency: string, symbol: string) => Promise<void>;
  onNavigateToCategories?: () => void;
  currencySymbol?: string;
  currentCurrency?: string;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  user,
  onOpenPinSetup,
  onUpdateCurrency,
  onNavigateToCategories,
  currencySymbol = '₹',
  currentCurrency = 'INR',
}) => {
  const { isPinEnabled, autoLockTimeoutMs, lockNow } = usePinLock();
  const { signOut } = useAuthActions();
  const updateProfileMutation = useMutation(api.users.updateProfile);

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState(currentCurrency);

  // Profile Edit Modal State
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [editEmail, setEditEmail] = useState(user?.email || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const currencies = [
    { code: 'INR', symbol: '₹', name: 'Indian Rupee (₹)' },
    { code: 'USD', symbol: '$', name: 'US Dollar ($)' },
    { code: 'EUR', symbol: '€', name: 'Euro (€)' },
    { code: 'GBP', symbol: '£', name: 'British Pound (£)' },
    { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham (AED)' },
    { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar (S$)' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen (¥)' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar (A$)' },
  ];

  const handleCurrencyChange = async (code: string) => {
    const found = currencies.find((c) => c.code === code);
    if (!found) return;
    setSelectedCurrency(code);
    await onUpdateCurrency(found.code, found.symbol);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingProfile(true);
      await updateProfileMutation({
        name: editName.trim() || undefined,
        email: editEmail.trim() || undefined,
      });
      setIsEditProfileOpen(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const timeoutLabels: Record<number, string> = {
    0: 'Immediate (on tab switch / minimize)',
    60000: '1 Minute of inactivity',
    300000: '5 Minutes of inactivity',
    900000: '15 Minutes of inactivity',
  };

  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'User');
  const displayEmail = user?.email || 'No email registered';

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl animate-in fade-in duration-150">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#9B51E0] p-4 sm:p-6 border-[3px] border-[#121212] shadow-neo text-white">
        <div>
          <span className="text-[10px] font-mono font-black uppercase tracking-widest bg-[#121212] text-[#9B51E0] px-2 py-0.5 inline-block mb-1">
            CONTROL CENTER
          </span>
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">
            SETTINGS & SECURITY
          </h2>
          <p className="text-xs font-bold text-white/90 mt-0.5">
            Manage your 6-digit PIN lock, currency preferences, and account security.
          </p>
        </div>
      </div>

      {savedSuccess && (
        <div className="bg-[#05DF72] text-[#121212] p-3 border-[3px] border-[#121212] shadow-neo font-black text-xs flex items-center gap-2">
          <Check size={16} strokeWidth={3} />
          <span>Preferences Saved Successfully!</span>
        </div>
      )}

      {/* 1. 6-Digit PIN Security Lock Section */}
      <div className="bg-white border-[3px] border-[#121212] shadow-neo p-3.5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b-2 border-[#121212] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#FFE600] border border-[#121212] flex items-center justify-center">
              <Lock size={16} strokeWidth={2.5} />
            </div>
            <h3 className="text-sm font-black uppercase text-[#121212] tracking-wider">
              6-Digit Security PIN Lock
            </h3>
          </div>
          <span
            className={`neo-badge text-[10px] ${
              isPinEnabled ? 'bg-[#05DF72] text-[#121212]' : 'bg-neutral-200 text-neutral-600'
            }`}
          >
            {isPinEnabled ? 'ENABLED' : 'DISABLED'}
          </span>
        </div>

        <p className="text-xs font-semibold text-neutral-700">
          The 6-digit security PIN locks the application when left unattended or when switching windows/tabs.
        </p>

        <div className="p-3.5 sm:p-4 bg-[#FFFDF5] border-2 border-[#121212] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase text-[#121212]">
              PIN Protection Status
            </span>
            <span className="text-[11px] font-bold text-neutral-600">
              {isPinEnabled
                ? `Active · Timeout: ${timeoutLabels[autoLockTimeoutMs] || '5 Minutes'}`
                : 'PIN is currently not configured.'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {isPinEnabled ? (
              <>
                <NeoButton
                  variant="primary"
                  size="sm"
                  onClick={lockNow}
                  className="flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
                >
                  <Lock size={14} />
                  <span>Lock Now</span>
                </NeoButton>
                <NeoButton
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenPinSetup(true)}
                  className="flex-1 sm:flex-initial text-center justify-center"
                >
                  Manage / Change
                </NeoButton>
              </>
            ) : (
              <NeoButton
                variant="secondary"
                size="sm"
                onClick={() => onOpenPinSetup(false)}
                className="flex items-center justify-center gap-1.5 w-full sm:w-auto"
              >
                <KeyRound size={14} />
                <span>Set 6-Digit PIN</span>
              </NeoButton>
            )}
          </div>
        </div>
      </div>

      {/* 2. Currency & Formatting Section */}
      <div className="bg-white border-[3px] border-[#121212] shadow-neo p-3.5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b-2 border-[#121212] pb-3">
          <div className="w-7 h-7 bg-[#00F0FF] border border-[#121212] flex items-center justify-center">
            <Globe size={16} strokeWidth={2.5} />
          </div>
          <h3 className="text-sm font-black uppercase text-[#121212] tracking-wider">
            Currency & Denomination
          </h3>
        </div>

        <p className="text-xs font-semibold text-neutral-700">
          Choose your primary monetary denomination. All budget calculations and transactions will reflect this symbol automatically.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {currencies.map((curr) => {
            const isSelected = selectedCurrency === curr.code;
            return (
              <button
                key={curr.code}
                onClick={() => handleCurrencyChange(curr.code)}
                className={`p-3 border-2 transition-all cursor-pointer flex flex-col items-center justify-center gap-1 text-center ${
                  isSelected
                    ? 'bg-[#FFE600] border-[#121212] shadow-neo-sm font-black'
                    : 'bg-white border-neutral-300 hover:border-[#121212] font-bold'
                }`}
              >
                <span className="text-xl font-mono">{curr.symbol}</span>
                <span className="text-xs uppercase">{curr.code}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Categories Management Tile */}
      <div className="bg-white border-[3px] border-[#121212] shadow-neo p-3.5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FFE600] border-2 border-[#121212] shadow-neo-sm flex items-center justify-center shrink-0">
            <Tag size={20} className="text-[#121212]" strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase text-[#121212]">Category Manager</h3>
            <p className="text-xs font-bold text-neutral-600 mt-0.5">
              Customize income & expense categories, icons, and colors.
            </p>
          </div>
        </div>
        {onNavigateToCategories && (
          <NeoButton
            variant="secondary"
            size="sm"
            onClick={onNavigateToCategories}
            className="flex items-center justify-center gap-1.5 w-full sm:w-auto"
          >
            <Tag size={13} />
            <span>Manage Categories</span>
          </NeoButton>
        )}
      </div>

      {/* 3. Account Details Section */}
      <div className="bg-white border-[3px] border-[#121212] shadow-neo p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b-2 border-[#121212] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#FF4D8D] text-white border border-[#121212] flex items-center justify-center">
              <User size={16} strokeWidth={2.5} />
            </div>
            <h3 className="text-sm font-black uppercase text-[#121212] tracking-wider">
              Account & Privacy
            </h3>
          </div>
          <button
            onClick={() => {
              setEditName(displayName);
              setEditEmail(displayEmail);
              setIsEditProfileOpen(true);
            }}
            className="flex items-center gap-1 text-xs font-black uppercase text-neutral-700 hover:text-[#121212] underline cursor-pointer"
          >
            <Edit2 size={13} />
            <span>Edit Profile</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-neutral-50 border-2 border-[#121212]">
          <div className="flex items-center gap-3">
            {user?.image ? (
              <img
                src={user.image}
                alt={displayName}
                className="w-10 h-10 border-2 border-[#121212] shadow-neo-sm object-cover"
              />
            ) : (
              <div className="w-10 h-10 bg-[#FFE600] border-2 border-[#121212] flex items-center justify-center font-black text-sm">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <span className="font-black text-sm text-[#121212] block">
                {displayName}
              </span>
              <span className="text-xs font-mono font-bold text-neutral-600">
                {displayEmail}
              </span>
            </div>
          </div>

          <NeoButton
            variant="danger"
            size="sm"
            onClick={() => {
              void signOut();
            }}
            className="flex items-center gap-1.5"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </NeoButton>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <NeoModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        title="EDIT USER PROFILE"
        maxWidth="sm"
      >
        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <NeoInput
            label="Display Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Your Name"
            required
          />

          <NeoInput
            label="Email Address"
            type="email"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            placeholder="your.email@example.com"
            required
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t-2 border-neutral-200">
            <NeoButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditProfileOpen(false)}
            >
              Cancel
            </NeoButton>
            <NeoButton
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSavingProfile}
            >
              {isSavingProfile ? 'Saving...' : 'Save Profile'}
            </NeoButton>
          </div>
        </form>
      </NeoModal>

    </div>
  );
};
