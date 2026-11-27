import React, { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, Search, Check, FileText, Sparkles, X, Filter } from 'lucide-react'
import {
  getAllVaultHeatOptions,
  extractNormalizedSize,
  VaultHeatOption,
  ExtraLotOptionInput,
} from '../../services/certificateVault'
import { db } from '../../services/db'

interface HeatNumberComboboxProps {
  value: string
  description?: string
  extraLots?: ExtraLotOptionInput[]
  onChange: (heatNumber: string, meta?: { fileName?: string; isBenkan?: boolean; make?: string; countryOfOrigin?: string; stockQty?: number; yom?: number }) => void
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
  const [sizeFilterOnly, setSizeFilterOnly] = useState(true)
  const [options, setOptions] = useState<VaultHeatOption[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const detectedItemSize = useMemo(() => extractNormalizedSize(description), [description])
  const extraLotsSignature = useMemo(
    () => extraLots.map(l => `${l.heat_number}|${l.available_qty ?? l.received_qty ?? ''}|${l.yom ?? ''}`).join(';'),
    [extraLots]
  )

  // Load vault + stock options when description or stock lots change
  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    getAllVaultHeatOptions(description, extraLots, db.getMTCs())
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, extraLotsSignature])

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

  const sizeMatchedCount = useMemo(
    () => options.filter(o => o.sizeMatched).length,
    [options]
  )
  const isSizeFilterActive = sizeFilterOnly && Boolean(detectedItemSize) && sizeMatchedCount > 0

  // Filter options based on size filter + search query
  const filteredOptions = useMemo(() => {
    const base = isSizeFilterActive ? options.filter(o => o.sizeMatched) : options
    if (!searchQuery.trim()) return base
    const q = searchQuery.toUpperCase().trim()
    return base.filter(
      opt =>
        opt.heatNumber.toUpperCase().includes(q) ||
        opt.fileName.toUpperCase().includes(q) ||
        opt.label.toUpperCase().includes(q) ||
        (opt.make && opt.make.toUpperCase().includes(q))
    )
  }, [options, isSizeFilterActive, searchQuery])

  // Group options for organized display
  const matchedOptions = useMemo(
    () => filteredOptions.filter(o => o.sizeMatched || o.matched),
    [filteredOptions]
  )
  const benkanOptions = useMemo(
    () => filteredOptions.filter(o => !o.sizeMatched && !o.matched && o.isBenkan),
    [filteredOptions]
  )
  const otherOptions = useMemo(
    () => filteredOptions.filter(o => !o.sizeMatched && !o.matched && !o.isBenkan),
    [filteredOptions]
  )

  const handleSelectOption = (opt: VaultHeatOption) => {
    onChange(opt.heatNumber, {
      fileName: opt.fileName,
      isBenkan: opt.isBenkan,
      make: opt.make,
      countryOfOrigin: opt.countryOfOrigin,
      stockQty: opt.stockQty,
      yom: opt.yom,
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
        stockQty: matched.stockQty,
        yom: matched.yom,
      })
    } else {
      const isBenkan = /^(68C|68[0-9]|67C|67[0-9]|65P|65N|65[0-9]|62C|62E|61G)/i.test(newVal.trim())
      onChange(newVal, {
        isBenkan,
        make: isBenkan ? 'BENKAN THAILAND CORP' : undefined,
        countryOfOrigin: isBenkan ? 'Thailand' : undefined,
      })
    }
  }

  const isCurrentBenkan = Boolean(
    /^(68C|68[0-9]|67C|67[0-9]|65P|65N|65[0-9]|62C|62E|61G)/i.test(value?.trim() || '') ||
    options.find(o => o.heatNumber.toUpperCase() === value?.toUpperCase().trim())?.isBenkan
  )

  const renderOptionRow = (opt: VaultHeatOption, tone: 'emerald' | 'red' | 'slate') => {
    const hoverCls = tone === 'emerald' ? 'hover:bg-emerald-50' : tone === 'red' ? 'hover:bg-red-50' : 'hover:bg-slate-50'
    const selectedCls = value === opt.heatNumber
      ? (tone === 'emerald' ? 'bg-emerald-100/70' : tone === 'red' ? 'bg-red-100/70' : 'bg-slate-100')
      : ''
    const heatCls = tone === 'emerald' ? 'text-emerald-900' : tone === 'red' ? 'text-red-900' : 'text-slate-800'
    const checkCls = tone === 'emerald' ? 'text-emerald-700' : tone === 'red' ? 'text-red-700' : 'text-slate-700'

    return (
      <button
        key={`${opt.heatNumber}|${opt.fileName}`}
        type="button"
        onClick={() => handleSelectOption(opt)}
        className={`w-full text-left px-2 py-1.5 rounded-lg ${hoverCls} transition-colors flex items-center justify-between group ${selectedCls}`}
      >
        <div className="min-w-0 pr-2 flex-1">
          <div className="flex items-center flex-wrap gap-1">
            <span className={`font-mono font-bold ${heatCls}`}>{opt.heatNumber}</span>
            {opt.size && (
              <span className={`text-[9px] font-bold px-1 rounded border ${opt.sizeMatched ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {opt.size}&quot;
              </span>
            )}
            {opt.stockQty !== undefined ? (
              <span className={`text-[9px] font-bold px-1 rounded border tabular-nums ${opt.stockQty > 0 ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                Stock: {opt.stockQty}
              </span>
            ) : opt.certQty !== undefined ? (
              <span className="text-[9px] font-semibold px-1 rounded bg-slate-100 text-slate-600 border border-slate-200 tabular-nums">
                Qty: {opt.certQty}
              </span>
            ) : null}
            {opt.yom !== undefined && opt.yom > 0 && (
              <span className="text-[9px] font-semibold px-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 tabular-nums">
                YOM: {opt.yom}
              </span>
            )}
            {opt.isBenkan && (
              <span className="text-[9px] font-bold px-1 rounded bg-red-100 text-red-700 border border-red-200">
                Benkan
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 truncate mt-0.5" title={opt.fileName || opt.label}>
            {opt.make ? `${opt.make} · ` : ''}
            {opt.fileName ? opt.fileName.replace(/\.pdf$/i, '') : opt.label}
          </div>
        </div>
        {value === opt.heatNumber && <Check className={`h-3.5 w-3.5 ${checkCls} shrink-0`} />}
      </button>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          value={value || ''}
          placeholder={placeholder}
          disabled={disabled}
          onChange={e => handleManualChange(e.target.value)}
          className={`w-full border rounded px-1.5 py-1 font-mono text-[11px] font-bold pr-6 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors ${isCurrentBenkan
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
          <div className="p-2 bg-slate-50 border-b border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[11px] text-slate-700 flex items-center space-x-1">
                <span>Select Heat Number</span>
                <span className="text-[10px] text-slate-500 font-normal">
                  ({isSizeFilterActive ? `${filteredOptions.length} of ${options.length}` : `${options.length} MTCs`})
                </span>
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {detectedItemSize && sizeMatchedCount > 0 && (
              <div className="flex items-center justify-between gap-1 text-[10px]">
                <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
                  <Filter className="h-2.5 w-2.5" />
                  <span>Item Size: {detectedItemSize}&quot;</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSizeFilterOnly(prev => !prev)}
                  className={`px-1.5 py-0.5 rounded font-semibold border transition-colors cursor-pointer ${isSizeFilterActive
                    ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    }`}
                >
                  {isSizeFilterActive ? `Show All (${options.length})` : `Filter Size ${detectedItemSize}" (${sizeMatchedCount})`}
                </button>
              </div>
            )}

            <div className="relative">
              <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search heat, make, or spec..."
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

            {/* Group 1: Matched with item size / description */}
            {matchedOptions.length > 0 && (
              <div className="p-1">
                <div className="px-2 py-1 text-[10px] font-bold text-emerald-800 uppercase bg-emerald-50 rounded flex items-center space-x-1 mb-1">
                  <Sparkles className="h-3 w-3 text-emerald-600" />
                  <span>
                    {isSizeFilterActive
                      ? `Size ${detectedItemSize}" Matches (${matchedOptions.length})`
                      : 'Recommended for this Item'}
                  </span>
                </div>
                {matchedOptions.map(opt => renderOptionRow(opt, 'emerald'))}
              </div>
            )}

            {/* Group 2: Benkan certificates */}
            {benkanOptions.length > 0 && (
              <div className="p-1">
                <div className="px-2 py-1 text-[10px] font-bold text-red-800 uppercase bg-red-50 rounded flex items-center space-x-1 mb-1">
                  <span>Benkan (Thailand) MTCs</span>
                  <span className="text-[9px] font-normal text-red-600">({benkanOptions.length})</span>
                </div>
                {benkanOptions.slice(0, 40).map(opt => renderOptionRow(opt, 'red'))}
              </div>
            )}

            {/* Group 3: Other authentic vault certificates */}
            {otherOptions.length > 0 && (
              <div className="p-1">
                <div className="px-2 py-1 text-[10px] font-bold text-slate-700 uppercase bg-slate-50 rounded flex items-center space-x-1 mb-1">
                  <FileText className="h-3 w-3 text-slate-500" />
                  <span>Other Vault Heats ({otherOptions.length})</span>
                </div>
                {otherOptions.slice(0, 50).map(opt => renderOptionRow(opt, 'slate'))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
