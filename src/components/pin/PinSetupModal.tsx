import React, { useState, useEffect } from 'react';
import { AlertTriangle, Check, KeyRound } from 'lucide-react';
import { NeoModal } from '../ui/NeoModal';
import { NeoButton } from '../ui/NeoButton';
import { usePinLock } from '../../context/PinLockContext';
import { clsx } from 'clsx';

interface PinSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  isChangingPin?: boolean;
}

// Reusable sliding pill toggle for 4 vs 6 digit selection
interface PinLengthSliderProps {
  value: 4 | 6;
  onChange: (v: 4 | 6) => void;
  disabled?: boolean;
}

const PinLengthSlider: React.FC<PinLengthSliderProps> = ({ value, onChange, disabled }) => {
  return (
    <div
      className={clsx(
        'relative inline-flex items-stretch bg-[#121212] border-2 border-[#121212] shadow-neo-sm select-none overflow-hidden',
        disabled && 'opacity-50 pointer-events-none'
      )}
      style={{ height: '2.75rem' }}
    >
      {/* Sliding yellow indicator */}
      <span
        aria-hidden
        className="absolute inset-y-0 w-1/2 bg-[#FFE600] transition-transform duration-200 ease-out"
        style={{ transform: value === 4 ? 'translateX(0%)' : 'translateX(100%)' }}
      />

      {/* 4-digit option */}
      <button
        type="button"
        onClick={() => onChange(4)}
        className={clsx(
          'relative z-10 flex flex-col items-center justify-center px-6 gap-0.5 cursor-pointer transition-colors duration-150',
          value === 4 ? 'text-[#121212]' : 'text-white/70 hover:text-white'
        )}
      >
        <span className="flex items-center gap-[3px]">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={clsx(
                'block w-[5px] h-[5px] rounded-full transition-colors duration-150',
                value === 4 ? 'bg-[#121212]' : 'bg-white/50'
              )}
            />
          ))}
        </span>
        <span className="text-[11px] font-black uppercase tracking-widest leading-none">4</span>
      </button>

      {/* Divider */}
      <span className="relative z-10 w-px bg-[#121212]" />

      {/* 6-digit option */}
      <button
        type="button"
        onClick={() => onChange(6)}
        className={clsx(
          'relative z-10 flex flex-col items-center justify-center px-6 gap-0.5 cursor-pointer transition-colors duration-150',
          value === 6 ? 'text-[#121212]' : 'text-white/70 hover:text-white'
        )}
      >
        <span className="flex items-center gap-[3px]">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={clsx(
                'block w-[5px] h-[5px] rounded-full transition-colors duration-150',
                value === 6 ? 'bg-[#121212]' : 'bg-white/50'
              )}
            />
          ))}
        </span>
        <span className="text-[11px] font-black uppercase tracking-widest leading-none">6</span>
      </button>
    </div>
  );
};

export const PinSetupModal: React.FC<PinSetupModalProps> = ({
  isOpen,
  onClose,
  isChangingPin = false,
}) => {
  const { enablePin, disablePin, isPinEnabled, pinLength, autoLockTimeoutMs, updateTimeout } = usePinLock();

  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [selectedLength, setSelectedLength] = useState<4 | 6>(pinLength || 6);
  const [isChangingMode, setIsChangingMode] = useState(isChangingPin || !isPinEnabled);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(autoLockTimeoutMs);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen, isPinEnabled, isChangingPin, pinLength, autoLockTimeoutMs]);

  const resetForm = () => {
    setStep('create');
    setSelectedLength(pinLength || 6);
    setIsChangingMode(!isPinEnabled || isChangingPin);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setTimeoutMs(autoLockTimeoutMs);
    setError('');
    setSuccessMsg('');
  };

  const handleNext = () => {
    setError('');
    if (step === 'create') {
      const regex = selectedLength === 4 ? /^\d{4}$/ : /^\d{6}$/;
      if (!regex.test(newPin)) {
        setError(`PIN must be exactly ${selectedLength} numeric digits`);
        return;
      }
      setStep('confirm');
    } else if (step === 'confirm') {
      if (newPin !== confirmPin) {
        setError('PIN confirmation does not match');
        return;
      }
      handleSavePin();
    }
  };

  const handleSavePin = async () => {
    setIsSubmitting(true);
    setError('');
    const res = await enablePin(newPin, timeoutMs, selectedLength);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMsg(`${selectedLength}-Digit Security PIN successfully configured!`);
      setTimeout(() => {
        onClose();
        resetForm();
      }, 1200);
    } else {
      setError(res.message || 'Failed to save PIN.');
    }
  };

  const handleDisablePin = async () => {
    const regex = pinLength === 4 ? /^\d{4}$/ : /^\d{6}$/;
    if (!regex.test(currentPin)) {
      setError(`Please enter your valid ${pinLength}-digit current PIN`);
      return;
    }
    setIsSubmitting(true);
    setError('');
    const res = await disablePin(currentPin);
    setIsSubmitting(false);

    if (res.success) {
      setSuccessMsg('Security PIN disabled');
      setTimeout(() => {
        onClose();
        resetForm();
      }, 1000);
    } else {
      setError(res.message || 'Incorrect current PIN');
    }
  };

  // When slider is toggled in manage panel -> auto-enter change flow with new length
  const handleManageLengthChange = (len: 4 | 6) => {
    setSelectedLength(len);
    setNewPin('');
    setConfirmPin('');
    setError('');
    setIsChangingMode(true);
    setStep('create');
  };

  const timeoutOptions = [
    { label: 'Immediate (on tab switch / minimize)', value: 0 },
    { label: '1 Minute of inactivity', value: 60000 },
    { label: '5 Minutes of inactivity', value: 300000 },
    { label: '15 Minutes of inactivity', value: 900000 },
  ];

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={onClose}
      title={isPinEnabled ? 'MANAGE SECURITY PIN' : 'ENABLE SECURITY PIN LOCK'}
      maxWidth="md"
    >
      <div className="flex flex-col gap-4">
        {/* Success Alert */}
        {successMsg && (
          <div className="bg-[#05DF72] text-[#121212] p-3 border-2 border-[#121212] shadow-neo-sm font-black text-sm flex items-center gap-2">
            <Check size={18} strokeWidth={3} />
            {successMsg}
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="bg-[#FF4343] text-white p-3 border-2 border-[#121212] shadow-neo-sm font-bold text-xs flex items-center gap-2">
            <AlertTriangle size={16} strokeWidth={3} />
            {error}
          </div>
        )}

        {!isPinEnabled || isChangingMode ? (
          /* Setup / Change PIN Flow */
          <div className="flex flex-col gap-4">
            <p className="text-xs font-bold text-neutral-700">
              Set up a {selectedLength}-digit PIN to lock your finances when inactive. Data is securely hashed in the cloud.
            </p>

            {/* PIN Length Slider - shown on create step */}
            {step === 'create' && (
              <div className="flex items-center justify-between bg-[#FFFDF5] border-2 border-[#121212] px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-black uppercase tracking-wider text-[#121212]">
                    PIN Length
                  </span>
                  <span className="text-[10px] font-bold text-neutral-500">
                    {selectedLength === 4 ? 'Quick & simple' : 'Extra secure'}
                  </span>
                </div>
                <PinLengthSlider
                  value={selectedLength}
                  onChange={(len) => {
                    setSelectedLength(len);
                    setNewPin('');
                    setConfirmPin('');
                    setError('');
                  }}
                />
              </div>
            )}

            {/* Enter new PIN */}
            {step === 'create' && (
              <div className="flex flex-col gap-3">
                <label className="text-xs font-black uppercase tracking-wider text-[#121212]">
                  Enter New {selectedLength}-Digit PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={selectedLength}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder={selectedLength === 4 ? '\u2022\u2022\u2022\u2022' : '\u2022\u2022\u2022\u2022\u2022\u2022'}
                  className="neo-input text-center text-2xl tracking-[0.5em] font-mono py-3"
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-2">
                  {isPinEnabled ? (
                    <NeoButton
                      variant="outline"
                      type="button"
                      onClick={() => setIsChangingMode(false)}
                    >
                      Back to Settings
                    </NeoButton>
                  ) : (
                    <NeoButton variant="outline" type="button" onClick={onClose}>
                      Cancel
                    </NeoButton>
                  )}
                  <NeoButton
                    variant="primary"
                    type="button"
                    onClick={handleNext}
                    disabled={newPin.length !== selectedLength}
                  >
                    Next
                  </NeoButton>
                </div>
              </div>
            )}

            {/* Confirm PIN */}
            {step === 'confirm' && (
              <div className="flex flex-col gap-3">
                <label className="text-xs font-black uppercase tracking-wider text-[#121212]">
                  Confirm {selectedLength}-Digit PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={selectedLength}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder={selectedLength === 4 ? '\u2022\u2022\u2022\u2022' : '\u2022\u2022\u2022\u2022\u2022\u2022'}
                  className="neo-input text-center text-2xl tracking-[0.5em] font-mono py-3"
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-2">
                  <NeoButton variant="outline" type="button" onClick={() => setStep('create')}>
                    Back
                  </NeoButton>
                  <NeoButton
                    variant="secondary"
                    type="button"
                    onClick={handleSavePin}
                    disabled={confirmPin.length !== selectedLength || isSubmitting}
                  >
                    {isSubmitting ? 'Saving...' : 'Activate PIN'}
                  </NeoButton>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Manage Existing PIN */
          <div className="flex flex-col gap-4">

            {/* PIN Length Slider - lives OUTSIDE the change flow, always visible */}
            <div className="flex items-center justify-between bg-[#FFFDF5] border-2 border-[#121212] px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-black uppercase tracking-wider text-[#121212]">
                  PIN Length
                </span>
                <span className="text-[10px] font-bold text-neutral-500 leading-tight">
                  Slide to switch — will prompt re-entry
                </span>
              </div>
              <PinLengthSlider
                value={selectedLength}
                onChange={handleManageLengthChange}
              />
            </div>

            {/* Change PIN code */}
            <div className="p-3.5 bg-white border-2 border-[#121212] flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-black uppercase text-[#121212] block">
                  Change PIN Code
                </span>
                <span className="text-[11px] font-bold text-neutral-600">
                  Keep {pinLength || 6}-digit format, set a new code
                </span>
              </div>
              <NeoButton
                variant="primary"
                size="sm"
                onClick={() => {
                  setIsChangingMode(true);
                  setStep('create');
                  setSelectedLength(pinLength || 6);
                  setNewPin('');
                  setConfirmPin('');
                  setError('');
                }}
              >
                <KeyRound size={13} />
                Change
              </NeoButton>
            </div>

            {/* Auto Lock Timeout Selector */}
            <div className="flex flex-col gap-1.5 p-3 bg-neutral-50 border-2 border-[#121212]">
              <label className="text-xs font-black uppercase tracking-wider text-[#121212]">
                Auto-Lock Inactivity Timer
              </label>
              <select
                value={timeoutMs}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setTimeoutMs(val);
                  updateTimeout(val);
                }}
                className="neo-input py-2 text-xs font-bold"
              >
                {timeoutOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Disable PIN Section */}
            <div className="flex flex-col gap-2 p-3 bg-red-50 border-2 border-[#FF4343]">
              <span className="text-xs font-black text-[#FF4343] uppercase tracking-wider">
                Disable Security PIN
              </span>
              <p className="text-[11px] font-semibold text-neutral-600">
                Enter your current {pinLength || 6}-digit PIN to turn off PIN protection.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={pinLength || 6}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  placeholder={`Current ${pinLength || 6}-Digit PIN`}
                  className="neo-input py-1.5 text-center tracking-widest font-mono text-sm"
                />
                <NeoButton
                  variant="danger"
                  size="sm"
                  onClick={handleDisablePin}
                  disabled={currentPin.length !== (pinLength || 6) || isSubmitting}
                >
                  Disable
                </NeoButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </NeoModal>
  );
};