import React, { useState, useRef, useEffect, useMemo } from 'react';
import { BROKER_DIRECTORY, getBrokerIcon } from '../../utils/brokerDirectory';
import { Search, ChevronDown, Check, Building2, HelpCircle } from 'lucide-react';

interface BrokerSelectDropdownProps {
  value: string;
  onChange: (brokerName: string) => void;
  onOpenGuide?: (brokerName: string) => void;
  className?: string;
}

export const BrokerSelectDropdown: React.FC<BrokerSelectDropdownProps> = ({
  value,
  onChange,
  onOpenGuide,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicked outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const filteredBrokers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return BROKER_DIRECTORY;
    return BROKER_DIRECTORY.filter(
      (b) =>
        b.shortName.toLowerCase().includes(q) ||
        b.name.toLowerCase().includes(q) ||
        b.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const selectedBrokerObj = useMemo(() => {
    if (value === 'Auto-Detect Broker') return null;
    return BROKER_DIRECTORY.find(
      (b) => b.shortName.toLowerCase() === value.toLowerCase() || b.name.toLowerCase() === value.toLowerCase()
    );
  }, [value]);

  const icon = useMemo(() => {
    if (value === 'Auto-Detect Broker') {
      return { bg: '#121212', text: '✦' };
    }
    return getBrokerIcon(value);
  }, [value]);

  const handleSelect = (brokerName: string) => {
    onChange(brokerName);
    setIsOpen(false);
  };

  const currentDisplay = value === 'Auto-Detect Broker' ? 'Auto-Detect Broker' : (selectedBrokerObj?.shortName || value);

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 px-3 py-1.5 bg-white hover:bg-neutral-50 text-[#121212] border-2 border-[#121212] shadow-neo-sm font-bold text-xs cursor-pointer transition-all min-w-[170px]"
      >
        <div className="flex items-center gap-2 truncate">
          <span
            className="w-5 h-5 rounded-[3px] flex items-center justify-center text-white font-black text-[10px] shrink-0 shadow-sm"
            style={{ backgroundColor: icon.bg }}
          >
            {icon.text}
          </span>
          <span className="truncate font-black">{currentDisplay}</span>
        </div>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu matching User's Reference Screenshot */}
      {isOpen && (
        <div className="absolute left-0 mt-1 w-64 sm:w-72 bg-white border-2 border-[#121212] shadow-neo z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Box with Magnifying Glass */}
          <div className="p-2 border-b-2 border-neutral-200 bg-neutral-50">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-2.5 text-neutral-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search broker..."
                className="w-full pl-8 pr-2 py-1.5 text-xs font-semibold bg-white border border-neutral-300 rounded focus:border-[#121212] focus:outline-none"
              />
            </div>
          </div>

          {/* Broker Options List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-neutral-100 py-1">
            {/* Auto-Detect option at the very top */}
            <button
              type="button"
              onClick={() => handleSelect('Auto-Detect Broker')}
              className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-neutral-100 cursor-pointer transition-colors ${
                value === 'Auto-Detect Broker' ? 'bg-[#05DF72]/15 font-black text-[#0B6B38]' : 'font-bold text-neutral-800'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <span className="w-5 h-5 rounded-[3px] bg-[#121212] text-white flex items-center justify-center font-black text-[10px] shrink-0">
                  ✦
                </span>
                <span className="truncate">Auto-Detect Broker</span>
              </div>
              {value === 'Auto-Detect Broker' && <Check size={14} className="text-[#0B6B38] shrink-0" strokeWidth={3} />}
            </button>

            {/* Filtered Broker Directory */}
            {filteredBrokers.map((b) => {
              const isSelected = value.toLowerCase() === b.shortName.toLowerCase();
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleSelect(b.shortName)}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-neutral-100 cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#05DF72]/15 font-black text-[#0B6B38]' : 'font-bold text-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span
                      className="w-5 h-5 rounded-[3px] flex items-center justify-center text-white font-black text-[10px] shrink-0 shadow-sm"
                      style={{ backgroundColor: b.iconBg }}
                    >
                      {b.iconText}
                    </span>
                    <span className="truncate">{b.shortName}</span>
                  </div>
                  {isSelected && <Check size={14} className="text-[#0B6B38] shrink-0" strokeWidth={3} />}
                </button>
              );
            })}

            {/* Custom fallback if query yields no match */}
            {filteredBrokers.length === 0 && searchQuery.trim() && (
              <div className="p-2 flex flex-col gap-1.5">
                <p className="text-[11px] text-neutral-500 font-semibold px-1">
                  No preset broker named "{searchQuery}".
                </p>
                <button
                  type="button"
                  onClick={() => handleSelect(searchQuery.trim())}
                  className="w-full p-2 bg-[#FFE600] text-[#121212] font-black text-xs uppercase border border-[#121212] text-center hover:bg-[#FADB00]"
                >
                  Use "{searchQuery.trim()}" as Broker
                </button>
                <button
                  type="button"
                  onClick={() => handleSelect('Other Broker / Statement')}
                  className="w-full p-1.5 bg-white text-neutral-700 font-bold text-xs border border-neutral-300 text-center hover:bg-neutral-100"
                >
                  Select "Other Broker / Statement"
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
