import React, { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, Search, Check, FileText, Sparkles, X } from 'lucide-react'
import { getAllVaultHeatOptions, VaultHeatOption } from '../../services/certificateVault'

interface HeatNumberComboboxProps {
  value: string
  description?: string
  extraLots?: { heat_number: string; lot_no?: string; item_code?: string }[]
  onChange: (heatNumber: string, meta?: { fileName?: string; isBenkan?: boolean; make?: string; countryOfOrigin?: string }) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export const HeatNumberCombobox: React.FC<HeatNumberComboboxProps> = ({
  value,
  description = '',
  extraLots = [],
  onChange,
  placeholder = 'Select / type Heat #',
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [options, setOptions] = useState<VaultHeatOption[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Load vault options on mount or when description changes
  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    getAllVaultHeatOptions(description, extraLots)
      .then(res => {
        if (mounted) {
          setOptions(res)
          setIsLoading(false)
        }
      })
      .catch(err => {
        console.warn('Could not load vault heat options:', err)
        if (mounted) setIsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [description, extraLots])

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options
    const q = searchQuery.toUpperCase().trim()
    return options.filter(
      opt =>
        opt.heatNumber.toUpperCase().includes(q) ||
        opt.fileName.toUpperCase().includes(q) ||
        opt.label.toUpperCase().includes(q)
    )
  }, [options, searchQuery])

  // Group options for organized display
  const matchedOptions = useMemo(() => filteredOptions.filter(o => o.matched), [filteredOptions])
  const benkanOptions = useMemo(() => filteredOptions.filter(o => !o.matched && o.isBenkan), [filteredOptions])
  const otherOptions = useMemo(() => filteredOptions.filter(o => !o.matched && !o.isBenkan), [filteredOptions])

  const handleSelectOption = (opt: VaultHeatOption) => {
    onChange(opt.heatNumber, {
      fileName: opt.fileName,
      isBenkan: opt.isBenkan,
      make: opt.make,
      countryOfOrigin: opt.countryOfOrigin,
    })
    setIsOpen(false)
    setSearchQuery('')
  }

  const handleManualChange = (newVal: string) => {
    const matched = options.find(o => o.heatNumber.toUpperCase() === newVal.toUpperCase().trim())
    if (matched) {
      onChange(newVal, {
        fileName: matched.fileName,
        isBenkan: matched.isBenkan,
        make: matched.make,
        countryOfOrigin: matched.countryOfOrigin,
      })
    } else {
      const isBenkan = /^(68C|68[0-9]|65P|65N|65[0-9])/i.test(newVal.trim())
      onChange(newVal, {
        isBenkan,
        make: isBenkan ? 'BENKAN THAILAND CORP' : undefined,
        countryOfOrigin: isBenkan ? 'Thailand' : undefined,
      })
    }
  }

  const isCurrentBenkan = Boolean(
    /^(68C|68[0-9]|65P|65N|65[0-9])/i.test(value?.trim() || '') ||
    options.find(o => o.heatNumber.toUpperCase() === value?.toUpperCase().trim())?.isBenkan
  )

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          value={value || ''}
          placeholder={placeholder}
          disabled={disabled}
          onChange={e => handleManualChange(e.target.value)}
          className={`w-full border rounded px-1.5 py-1 font-mono text-[11px] font-bold pr-6 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors ${
            isCurrentBenkan
              ? 'border-red-300 text-red-700 bg-red-50/60'
              : 'border-slate-200 text-slate-800 bg-white'
          } ${className}`}
        />

        {/* Dropdown Toggle Trigger Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setIsOpen(!isOpen)
            setSearchQuery('')
          }}
          className="absolute right-0.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
          title="Select from authentic Heat Numbers (338 MTCs)"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180 text-red-600' : ''}`} />
        </button>
      </div>

      {/* Dropdown Menu Modal / Popover */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="fixed z-50 mt-1 w-80 max-w-[90vw] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-xs"
          style={{
            top: containerRef.current
              ? Math.min(
                  containerRef.current.getBoundingClientRect().bottom + 4,
                  window.innerHeight - 360
                )
              : 100,
            left: containerRef.current
              ? Math.max(
                  10,
                  Math.min(
                    containerRef.current.getBoundingClientRect().left,
                    window.innerWidth - 330
                  )
                )
              : 100,
          }}
        >
          {/* Header & Search */}
          <div className="p-2 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-[11px] text-slate-700 flex items-center space-x-1">
                <span>Select Heat Number</span>
                <span className="text-[10px] text-slate-500 font-normal">({options.length} MTCs)</span>
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="relative">
              <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search heat or spec..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 divide-opacity-60">
            {isLoading && (
              <div className="p-4 text-center text-slate-400">Loading authentic certificates...</div>
            )}

            {!isLoading && filteredOptions.length === 0 && (
              <div className="p-4 text-center text-slate-500">
                <p>No matching heat numbers found.</p>
                <button
                  type="button"
                  onClick={() => {
                    if (searchQuery) handleManualChange(searchQuery)
                    setIsOpen(false)
                  }}
                  className="mt-2 text-xs font-bold text-red-600 hover:underline"
                >
                  Use &quot;{searchQuery}&quot; as custom heat
                </button>
              </div>
            )}

            {/* Group 1: Matched with item description */}
            {matchedOptions.length > 0 && (
              <div className="p-1">
                <div className="px-2 py-1 text-[10px] font-bold text-emerald-800 uppercase bg-emerald-50 rounded flex items-center space-x-1 mb-1">
                  <Sparkles className="h-3 w-3 text-emerald-600" />
                  <span>Recommended for this Item</span>
                </div>
                {matchedOptions.map(opt => (
                  <button
                    key={opt.heatNumber + opt.fileName}
                    type="button"
                    onClick={() => handleSelectOption(opt)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors flex items-center justify-between group ${
                      value === opt.heatNumber ? 'bg-emerald-100/70' : ''
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-mono font-bold text-emerald-900">{opt.heatNumber}</span>
                        {opt.isBenkan && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-100 text-red-700 border border-red-200">
                            Benkan
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate" title={opt.fileName}>
                        {opt.fileName.replace(/\.pdf$/i, '')}
                      </div>
                    </div>
                    {value === opt.heatNumber && <Check className="h-3.5 w-3.5 text-emerald-700 shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {/* Group 2: Benkan certificates */}
            {benkanOptions.length > 0 && (
              <div className="p-1">
                <div className="px-2 py-1 text-[10px] font-bold text-red-800 uppercase bg-red-50 rounded flex items-center space-x-1 mb-1">
                  <span>Benkan (Thailand) MTCs</span>
                  <span className="text-[9px] font-normal text-red-600">({benkanOptions.length})</span>
                </div>
                {benkanOptions.slice(0, 40).map(opt => (
                  <button
                    key={opt.heatNumber + opt.fileName}
                    type="button"
                    onClick={() => handleSelectOption(opt)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-between group ${
                      value === opt.heatNumber ? 'bg-red-100/70' : ''
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-mono font-bold text-red-900">{opt.heatNumber}</span>
                        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-red-100 text-red-700">
                          Benkan
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate" title={opt.fileName}>
                        {opt.fileName.replace(/\.pdf$/i, '')}
                      </div>
                    </div>
                    {value === opt.heatNumber && <Check className="h-3.5 w-3.5 text-red-700 shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {/* Group 3: Other authentic vault certificates */}
            {otherOptions.length > 0 && (
              <div className="p-1">
                <div className="px-2 py-1 text-[10px] font-bold text-slate-700 uppercase bg-slate-50 rounded flex items-center space-x-1 mb-1">
                  <FileText className="h-3 w-3 text-slate-500" />
                  <span>Other Vault Heats ({otherOptions.length})</span>
                </div>
                {otherOptions.slice(0, 50).map(opt => (
                  <button
                    key={opt.heatNumber + opt.fileName}
                    type="button"
                    onClick={() => handleSelectOption(opt)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-between group ${
                      value === opt.heatNumber ? 'bg-slate-100' : ''
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-mono font-bold text-slate-800">{opt.heatNumber}</span>
                      <div className="text-[10px] text-slate-500 truncate" title={opt.fileName}>
                        {opt.fileName.replace(/\.pdf$/i, '')}
                      </div>
                    </div>
                    {value === opt.heatNumber && <Check className="h-3.5 w-3.5 text-slate-700 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
