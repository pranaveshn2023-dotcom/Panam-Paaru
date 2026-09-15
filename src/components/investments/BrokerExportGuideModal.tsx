import React, { useState, useMemo, useEffect, useRef } from 'react';
import { NeoModal } from '../ui/NeoModal';
import { BROKER_DIRECTORY, BrokerGuide } from '../../utils/brokerDirectory';
import { BrokerSelectDropdown } from './BrokerSelectDropdown';
import { Search, ExternalLink, KeyRound, FileCheck2, Lightbulb, Building2, CheckCircle2 } from 'lucide-react';

interface BrokerExportGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBroker?: (brokerName: string) => void;
  initialSelectedBroker?: string;
}

export const BrokerExportGuideModal: React.FC<BrokerExportGuideModalProps> = ({
  isOpen,
  onClose,
  onSelectBroker,
  initialSelectedBroker,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeBrokerId, setActiveBrokerId] = useState<string>(() => {
    if (initialSelectedBroker) {
      const match = BROKER_DIRECTORY.find(
        (b) =>
          b.shortName.toLowerCase() === initialSelectedBroker.toLowerCase() ||
          b.name.toLowerCase() === initialSelectedBroker.toLowerCase() ||
          b.id.toLowerCase() === initialSelectedBroker.toLowerCase()
      );
      if (match) return match.id;
    }
    return 'groww';
  });

  const sidebarRef = useRef<HTMLDivElement>(null);

  // Synchronize activeBrokerId immediately whenever the modal opens or initialSelectedBroker changes
  useEffect(() => {
    if (isOpen) {
      if (initialSelectedBroker && initialSelectedBroker !== 'Auto-Detect Broker') {
        const match = BROKER_DIRECTORY.find(
          (b) =>
            b.shortName.toLowerCase() === initialSelectedBroker.toLowerCase() ||
            b.name.toLowerCase() === initialSelectedBroker.toLowerCase() ||
            b.id.toLowerCase() === initialSelectedBroker.toLowerCase()
        );
        if (match) {
          setActiveBrokerId(match.id);
          setSelectedCategory('All');
          setSearchQuery('');
        }
      }
    }
  }, [isOpen, initialSelectedBroker]);

  // Smooth scroll active broker item into view in sidebar
  useEffect(() => {
    if (isOpen && activeBrokerId) {
      setTimeout(() => {
        const el = document.getElementById(`broker-btn-${activeBrokerId}`);
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 100);
    }
  }, [isOpen, activeBrokerId]);

  const categories = ['All', 'Depositories & CAS', 'Discount Brokers', 'Full-Service & Banking', 'Crypto Platforms'];

  const filteredBrokers = useMemo(() => {
    return BROKER_DIRECTORY.filter((b) => {
      const matchesCategory = selectedCategory === 'All' || b.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        b.name.toLowerCase().includes(q) ||
        b.shortName.toLowerCase().includes(q) ||
        b.keywords.some((k) => k.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  const activeBroker = useMemo(() => {
    const found = BROKER_DIRECTORY.find((b) => b.id === activeBrokerId);
    if (found) return found;
    return filteredBrokers[0] || BROKER_DIRECTORY[0];
  }, [activeBrokerId, filteredBrokers]);

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      maxWidth="2xl"
    >
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="pb-2 border-b-2 border-[#121212] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black uppercase text-[#121212] tracking-tight flex items-center gap-2">
              <Building2 size={24} />
              <span>How To Export From Any Broker</span>
            </h2>
            <p className="text-xs font-semibold text-neutral-600 mt-0.5">
              Step-by-step export instructions & password guides across all 30+ Indian brokers & depositories
            </p>
          </div>
        </div>

        {/* Search & Broker Selector matching User Reference */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-[#FFFDF5] p-2.5 border-2 border-[#121212] shadow-neo-sm">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase text-neutral-600 shrink-0">Select Broker:</span>
            <BrokerSelectDropdown
              value={activeBroker.shortName}
              onChange={(brokerName) => {
                const match = BROKER_DIRECTORY.find((b) => b.shortName.toLowerCase() === brokerName.toLowerCase());
                if (match) {
                  setActiveBrokerId(match.id);
                } else {
                  setActiveBrokerId('other_broker');
                }
              }}
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border whitespace-nowrap cursor-pointer transition-all ${
                  selectedCategory === cat
                    ? 'bg-[#FFE600] text-[#121212] border-[#121212] shadow-neo-sm font-bold'
                    : 'bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content: Left Broker List & Right Details */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 min-h-[380px] max-h-[500px]">
          {/* Broker List Selector */}
          <div className="md:col-span-4 border-2 border-[#121212] bg-white overflow-y-auto max-h-[160px] md:max-h-full divide-y divide-neutral-200">
            {filteredBrokers.length === 0 ? (
              <div className="p-4 text-xs font-bold text-neutral-500 text-center">
                No brokers match "{searchQuery}"
              </div>
            ) : (
              filteredBrokers.map((b) => {
                const isSelected = activeBroker.id === b.id;
                return (
                  <button
                    id={`broker-btn-${b.id}`}
                    key={b.id}
                    type="button"
                    onClick={() => setActiveBrokerId(b.id)}
                    className={`w-full text-left p-2.5 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#FFE600] font-black text-[#121212]'
                        : 'bg-white hover:bg-neutral-50 font-bold text-neutral-800'
                    }`}
                  >
                    <div className="truncate">
                      <div className="text-xs truncate">{b.shortName}</div>
                      <div className="text-[9px] text-neutral-500 uppercase tracking-wider truncate">
                        {b.category}
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 size={15} className="shrink-0 text-[#121212]" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Active Broker Detailed Instructions */}
          <div className="md:col-span-8 border-2 border-[#121212] bg-[#FFFDF5] p-4 flex flex-col justify-between overflow-y-auto shadow-neo-sm">
            <div className="flex flex-col gap-3">
              {/* Title & Category Badge */}
              <div className="flex items-start justify-between gap-2 border-b-2 border-[#121212] pb-2">
                <div>
                  <h3 className="text-lg font-black text-[#121212] uppercase tracking-tight">
                    {activeBroker.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 bg-white border border-[#121212] text-[10px] font-black uppercase text-neutral-700">
                      {activeBroker.category}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-neutral-500">
                      Formats: {activeBroker.supportedFormats.join(', ')}
                    </span>
                  </div>
                </div>

                {activeBroker.portalUrl && (
                  <a
                    href={activeBroker.portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 bg-[#121212] hover:bg-neutral-800 text-white text-[11px] font-black uppercase flex items-center gap-1.5 shrink-0 shadow-neo-sm transition-all"
                  >
                    <span>Open Portal</span>
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>

              {/* Password Info if encrypted */}
              {activeBroker.passwordFormat && (
                <div className="p-2.5 bg-amber-50 border-2 border-amber-400 text-xs font-bold text-amber-900 flex items-start gap-2">
                  <KeyRound size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-black uppercase text-[10px] block text-amber-800">
                      Statement Password Format:
                    </span>
                    <span>{activeBroker.passwordFormat}</span>
                  </div>
                </div>
              )}

              {/* Step-by-step export instructions */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-black uppercase text-neutral-700 tracking-wider flex items-center gap-1.5">
                  <FileCheck2 size={14} />
                  <span>How to export your statement:</span>
                </span>
                <ol className="flex flex-col gap-2 pl-4 list-decimal text-xs font-bold text-neutral-800">
                  {activeBroker.exportSteps.map((step, idx) => (
                    <li key={idx} className="pl-1">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Pro Tip */}
              {activeBroker.proTip && (
                <div className="p-2.5 bg-[#E8F8F0] border border-[#05DF72] text-[11px] font-bold text-[#0B6B38] flex items-start gap-2">
                  <Lightbulb size={15} className="text-[#05DF72] shrink-0 mt-0.5" />
                  <span>{activeBroker.proTip}</span>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t-2 border-[#121212] mt-3">
              {onSelectBroker && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectBroker(activeBroker.shortName);
                    onClose();
                  }}
                  className="px-4 py-2 bg-[#FFE600] hover:bg-[#FADB00] text-[#121212] text-xs font-black uppercase border-2 border-[#121212] shadow-neo-sm cursor-pointer"
                >
                  Set as Selected Broker ({activeBroker.shortName})
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-[#121212] hover:bg-neutral-800 text-white text-xs font-black uppercase border-2 border-[#121212] shadow-neo-sm cursor-pointer"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      </div>
    </NeoModal>
  );
};
