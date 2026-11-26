import React, { useState, useEffect, useRef } from 'react'
import {
  Bot,
  Send,
  X,
  Minimize2,
  Maximize2,
  Sparkles,
  Download,
  ShieldCheck,
  AlertTriangle,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Search,
  ExternalLink,
  RotateCcw,
  CheckCircle2,
  Layers,
  ArrowRight
} from 'lucide-react'
import {
  processChatQuery,
  ChatMessage,
  HeatVettingReport,
  OrderVettingReport,
  StockAuditReport,
  downloadMTCForHeat,
  downloadSalesOrderPdf,
  exportCustomLotsToExcel
} from '../../services/aiAssistantEngine'
import {
  exportMasterStock,
  exportHeatRegister,
  exportSalesOrders
} from '../../services/excelEngine'
import { NavTabId } from '../common/Sidebar'

interface ERPChatbotProps {
  onNavigateTab: (tab: NavTabId) => void
  onOpenTraceability: (heatNumber: string) => void
  onPreviewMTC: (docName: string, itemCode: string, heatNumber: string) => void
}

export const ERPChatbot: React.FC<ERPChatbotProps> = ({
  onNavigateTab,
  onOpenTraceability,
  onPreviewMTC
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isWide, setIsWide] = useState(false)
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [hasUnreadAlert, setHasUnreadAlert] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: 'Hello! I am your **MSG Oilfield ERP AI Assistant**. I can find anything in the system, **automatically vet stock & MTCs**, and **download documents** instantly.',
      type: 'general',
      suggestions: [
        '🛡️ Vet Stock Health',
        '⚠️ Missing MTCs',
        '📊 Download Master Stock Excel',
        '📋 Vet Latest Sales Orders'
      ]
    }
  ])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
      setHasUnreadAlert(false)
    }
  }, [isOpen, messages])

  // Global keyboard shortcut to open/close chatbot (Ctrl + Space)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim()
    if (!query || isProcessing) return

    const userMsg: ChatMessage = {
      id: 'usr-' + Date.now(),
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: query
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsProcessing(true)

    try {
      const response = await processChatQuery(query)
      setMessages(prev => [...prev, response])
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          sender: 'assistant',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: `⚠️ An error occurred while processing: ${err.message || 'Unknown error'}. Please try again.`
        }
      ])
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle MTC Download directly from chat
  const handleDownloadMTC = async (heatNumber: string, stamped: boolean, itemCode?: string) => {
    const actionKey = `mtc-${heatNumber}-${stamped ? 'stamped' : 'clean'}`
    setDownloadingId(actionKey)
    try {
      const res = await downloadMTCForHeat(heatNumber, stamped, itemCode)
      if (res.success) {
        setMessages(prev => [
          ...prev,
          {
            id: 'dl-' + Date.now(),
            sender: 'assistant',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: `✅ **Downloaded ${stamped ? 'Stamped' : 'Clean'} MTC:** \`${res.filename}\` for Heat **${heatNumber}**.`
          }
        ])
      } else {
        alert('Could not download MTC: ' + res.error)
      }
    } finally {
      setDownloadingId(null)
    }
  }

  // Handle Sales Order PDF download
  const handleDownloadOrder = async (orderId: string, soNumber: string) => {
    const actionKey = `so-${orderId}`
    setDownloadingId(actionKey)
    try {
      const res = await downloadSalesOrderPdf(soNumber || orderId)
      if (res.success) {
        setMessages(prev => [
          ...prev,
          {
            id: 'dl-' + Date.now(),
            sender: 'assistant',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: `✅ **Downloaded Sales Order PDF:** \`${res.filename}\`.`
          }
        ])
      } else {
        alert('Could not download Sales Order PDF: ' + res.error)
      }
    } finally {
      setDownloadingId(null)
    }
  }

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'init-1',
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: 'Chat history cleared. How can I assist you with stock, vetting, or downloads?',
        type: 'general',
        suggestions: [
          '🛡️ Vet Stock Health',
          '⚠️ Missing MTCs',
          '📊 Download Master Stock Excel',
          '📋 Vet Latest Sales Orders'
        ]
      }
    ])
  }

  return (
    <>
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          title="Open MSG AI Assistant (Ctrl + Space)"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg transition-colors border border-blue-500"
        >
          <div className="relative">
            <Bot className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border border-blue-600" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-semibold">
              ERP Assistant
            </span>
            <span className="text-[10px] text-blue-100">Find, Vet &amp; Download</span>
          </div>
        </button>
      )}

      {/* Floating Chat Drawer Window */}
      {isOpen && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex flex-col bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 overflow-hidden transition-all duration-200 ${
            isWide ? 'w-[760px] h-[700px]' : 'w-[420px] sm:w-[460px] h-[620px]'
          } max-w-[calc(100vw-2rem)] max-h-[calc(100vh-3rem)]`}
        >
          {/* Top Header */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between select-none">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">MSG ERP Co-Pilot</h3>
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Live ERP
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">Deep Search &bull; Automated Vetting &bull; Downloads</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleClearHistory}
                title="Reset conversation"
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsWide(!isWide)}
                title={isWide ? 'Standard view' : 'Expand wide'}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition"
              >
                {isWide ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close (Ctrl + Space)"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Action Suggestions Chips Bar */}
          <div className="px-3 py-2 bg-slate-950/70 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto text-[11px] no-scrollbar">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex-shrink-0">
              Quick:
            </span>
            <button
              onClick={() => handleSend('vet stock')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 flex items-center gap-1 flex-shrink-0 transition"
            >
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Vet Stock Health</span>
            </button>
            <button
              onClick={() => handleSend('missing mtc')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 flex items-center gap-1 flex-shrink-0 transition"
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>Missing MTCs</span>
            </button>
            <button
              onClick={() => handleSend('download stock excel')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 flex-shrink-0 transition"
            >
              <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
              <span>Export Stock</span>
            </button>
            <button
              onClick={() => handleSend('download sales orders')}
              className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 flex items-center gap-1 flex-shrink-0 transition"
            >
              <FileText className="w-3 h-3 text-purple-400" />
              <span>Orders Excel</span>
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-normal">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                {/* Message Header */}
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400">
                  {msg.sender === 'assistant' ? (
                    <span className="font-semibold text-blue-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-cyan-400" /> MSG Assistant
                    </span>
                  ) : (
                    <span className="font-semibold text-slate-300">You</span>
                  )}
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </div>

                {/* Bubble Body */}
                <div
                  className={`max-w-[92%] rounded-2xl p-3.5 ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-slate-800/90 text-slate-200 border border-slate-700/70 shadow-lg'
                  }`}
                >
                  {/* Markdown-style text rendering */}
                  <div className="space-y-1.5 leading-relaxed whitespace-pre-wrap">
                    {msg.text}
                  </div>

                  {/* SPECIALIZED CARDS */}

                  {/* 1. Heat Vetting Card */}
                  {msg.type === 'heat_vetting' && msg.data && (
                    <div className="mt-3.5 p-3 rounded-xl bg-slate-900/90 border border-slate-700 space-y-3">
                      {/* Status Header */}
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-slate-400">Heat Number</div>
                          <div className="text-sm font-bold text-cyan-300 font-mono">
                            {(msg.data as HeatVettingReport).heatNumber}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                            (msg.data as HeatVettingReport).overallScore === 'PASSED'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : (msg.data as HeatVettingReport).overallScore === 'WARNING'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          {(msg.data as HeatVettingReport).overallScore === 'PASSED'
                            ? '✅ 100% COMPLIANT'
                            : (msg.data as HeatVettingReport).overallScore === 'WARNING'
                            ? '⚠️ WARNINGS FOUND'
                            : '❌ NON-COMPLIANT'}
                        </span>
                      </div>

                      {/* Specs Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-950/50 p-2 rounded-lg">
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase">Available</span>
                          <span className="font-bold text-white">{(msg.data as HeatVettingReport).availableQty} units</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase">Location</span>
                          <span className="font-bold text-cyan-300">{(msg.data as HeatVettingReport).location}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase">YOM</span>
                          <span className="font-bold text-white">{(msg.data as HeatVettingReport).yom}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase">MTC Ref</span>
                          <span className="font-bold text-emerald-300 truncate block">
                            {(msg.data as HeatVettingReport).mtcReference || 'Not Registered'}
                          </span>
                        </div>
                      </div>

                      {/* Vetting Checklist */}
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Automated Audit Checklist:</div>
                        {(msg.data as HeatVettingReport).issues.map((iss, i) => (
                          <div
                            key={i}
                            className={`flex items-start gap-2 p-1.5 rounded text-[11px] ${
                              iss.severity === 'success'
                                ? 'bg-emerald-950/30 text-emerald-200 border border-emerald-800/30'
                                : iss.severity === 'warning'
                                ? 'bg-amber-950/30 text-amber-200 border border-amber-800/30'
                                : iss.severity === 'error'
                                ? 'bg-rose-950/30 text-rose-200 border border-rose-800/30'
                                : 'bg-slate-800/50 text-slate-300'
                            }`}
                          >
                            {iss.severity === 'success' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                            ) : iss.severity === 'warning' ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                            ) : (
                              <X className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                            )}
                            <span>{iss.message}</span>
                          </div>
                        ))}
                      </div>

                      {/* Direct Action & Download Buttons */}
                      <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-1.5">
                        <button
                          onClick={() => handleDownloadMTC((msg.data as HeatVettingReport).heatNumber, true, (msg.data as HeatVettingReport).itemCode)}
                          disabled={downloadingId === `mtc-${(msg.data as HeatVettingReport).heatNumber}-stamped`}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5 shadow transition disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>
                            {downloadingId === `mtc-${(msg.data as HeatVettingReport).heatNumber}-stamped`
                              ? 'Generating...'
                              : 'Download Stamped MTC'}
                          </span>
                        </button>
                        <button
                          onClick={() => handleDownloadMTC((msg.data as HeatVettingReport).heatNumber, false, (msg.data as HeatVettingReport).itemCode)}
                          disabled={downloadingId === `mtc-${(msg.data as HeatVettingReport).heatNumber}-clean`}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 flex items-center gap-1.5 transition disabled:opacity-50"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-400" />
                          <span>Download Clean MTC</span>
                        </button>
                        <button
                          onClick={() =>
                            onPreviewMTC(
                              (msg.data as HeatVettingReport).mtcReference || (msg.data as HeatVettingReport).heatNumber,
                              (msg.data as HeatVettingReport).itemCode,
                              (msg.data as HeatVettingReport).heatNumber
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-blue-900/60 hover:bg-blue-800 text-blue-200 border border-blue-700/60 flex items-center gap-1.5 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Preview MTC</span>
                        </button>
                        <button
                          onClick={() => onOpenTraceability((msg.data as HeatVettingReport).heatNumber)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/60 flex items-center gap-1.5 transition"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>360° Traceability</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. Order Vetting Card */}
                  {msg.type === 'order_vetting' && msg.data && (
                    <div className="mt-3.5 p-3 rounded-xl bg-slate-900/90 border border-slate-700 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-slate-400">Sales Order</div>
                          <div className="text-sm font-bold text-white font-mono">
                            {(msg.data as OrderVettingReport).soNumber}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Client: <span className="text-cyan-300 font-semibold">{(msg.data as OrderVettingReport).customerName}</span>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                            (msg.data as OrderVettingReport).overallScore === 'READY_TO_DISPATCH'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : (msg.data as OrderVettingReport).overallScore === 'PARTIALLY_READY'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          {(msg.data as OrderVettingReport).overallScore.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* Line Items Audit List */}
                      <div className="space-y-1.5">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Order Line Items:</div>
                        {(msg.data as OrderVettingReport).items.map((it, idx) => (
                          <div key={idx} className="p-2 rounded bg-slate-950/60 border border-slate-800 text-[11px] flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-white">{it.itemCode}</div>
                              <div className="text-slate-400 text-[10px]">
                                Qty: {it.allocatedQty} / {it.orderedQty} | Heats: {it.heats.length > 0 ? it.heats.join(', ') : 'None allocated'}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {it.hasMtc ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[9px] font-bold">
                                  MTC Verified
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[9px] font-bold">
                                  MTC Missing
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Action buttons */}
                      <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-1.5">
                        <button
                          onClick={() => handleDownloadOrder((msg.data as OrderVettingReport).orderId, (msg.data as OrderVettingReport).soNumber)}
                          disabled={downloadingId === `so-${(msg.data as OrderVettingReport).orderId}`}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-1.5 transition disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>
                            {downloadingId === `so-${(msg.data as OrderVettingReport).orderId}`
                              ? 'Generating...'
                              : 'Download Sales Order PDF'}
                          </span>
                        </button>
                        <button
                          onClick={() => onNavigateTab('orders')}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Open in Sales Orders</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 3. Stock Audit Summary Card */}
                  {msg.type === 'stock_audit' && msg.data && (
                    <div className="mt-3.5 p-3 rounded-xl bg-slate-900/90 border border-slate-700 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                          <span className="text-slate-400 block text-[9px] uppercase">Total Lots</span>
                          <span className="text-base font-bold text-white">{(msg.data as StockAuditReport).totalLots}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                          <span className="text-slate-400 block text-[9px] uppercase">Available Stock</span>
                          <span className="text-base font-bold text-emerald-400">
                            {(msg.data as StockAuditReport).totalAvailableQty.toLocaleString()}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                          <span className="text-slate-400 block text-[9px] uppercase">Missing MTCs</span>
                          <span className="text-base font-bold text-amber-400">
                            {(msg.data as StockAuditReport).missingMtcCount}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                          <span className="text-slate-400 block text-[9px] uppercase">Unassigned Bins</span>
                          <span className="text-base font-bold text-rose-400">
                            {(msg.data as StockAuditReport).unlocatedLotsCount}
                          </span>
                        </div>
                      </div>

                      {/* Missing MTC preview */}
                      {(msg.data as StockAuditReport).missingMtcLots.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase font-bold text-slate-400">Sample Lots Pending MTC:</div>
                          <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                            {(msg.data as StockAuditReport).missingMtcLots.slice(0, 6).map((lot, idx) => (
                              <div key={idx} className="p-1.5 rounded bg-slate-950/40 border border-slate-800/80 flex items-center justify-between text-[10px]">
                                <span className="font-mono text-cyan-300 font-bold">{lot.heatNumber}</span>
                                <span className="text-slate-400 truncate max-w-[120px]">{lot.itemCode}</span>
                                <span className="text-slate-300 font-semibold">{lot.qty} pcs</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Audit Download Actions */}
                      <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-1.5">
                        <button
                          onClick={() => exportCustomLotsToExcel((msg.data as StockAuditReport).missingMtcLots, 'Missing_MTC_Lots.xlsx')}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium flex items-center gap-1.5 transition"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>Export Missing MTCs (Excel)</span>
                        </button>
                        <button
                          onClick={() => exportMasterStock()}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5 transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Master Stock Excel</span>
                        </button>
                        <button
                          onClick={() => onNavigateTab('mtc')}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                          <span>Open MTC Portal</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 4. Stock Search Multi-match Table */}
                  {msg.type === 'stock_search' && msg.data && (
                    <div className="mt-3.5 p-3 rounded-xl bg-slate-900/90 border border-slate-700 space-y-2.5">
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {(msg.data.lots as any[]).map((lot, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between text-[11px]"
                          >
                            <div>
                              <div className="font-semibold text-white flex items-center gap-1.5">
                                <span className="text-cyan-300 font-mono">{lot.heat_number}</span>
                                <span className="text-slate-400">•</span>
                                <span className="truncate max-w-[140px]">{lot.item_code}</span>
                              </div>
                              <div className="text-slate-400 text-[10px]">
                                Avail: <span className="text-emerald-400 font-bold">{lot.available_qty}</span> | Loc: <span className="text-slate-300">{lot.warehouse_location || 'LN-EB1'}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDownloadMTC(lot.heat_number, true, lot.item_code)}
                                title="Download Stamped MTC"
                                className="p-1 rounded bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white transition"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleSend(`vet heat ${lot.heat_number}`)}
                                title="Vet this heat"
                                className="px-2 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white text-[10px] font-semibold border border-blue-500/40 transition"
                              >
                                Vet
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">
                          Showing {(msg.data.lots as any[]).length} of {msg.data.totalCount} results
                        </span>
                        <button
                          onClick={() => exportCustomLotsToExcel(msg.data.lots, `Search_${msg.data.query}.xlsx`)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold border border-slate-700 flex items-center gap-1 transition"
                        >
                          <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                          <span>Export Results to Excel</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Contextual Suggestions Chips */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex flex-wrap gap-1">
                      {msg.suggestions.map((sug, i) => (
                        <button
                          key={i}
                          onClick={() => handleSend(sug)}
                          className="px-2 py-0.5 rounded-full bg-slate-900/80 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 text-[10px] transition"
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex items-center gap-2 text-slate-400 text-xs py-2 px-1">
                <Bot className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Searching ERP database & running audit...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Chat Input Bar */}
          <div className="p-3 bg-slate-950 border-t border-slate-800">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSend()
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything... e.g. 'vet heat H101' or 'download stock excel'"
                  disabled={isProcessing}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 text-slate-100 placeholder-slate-500 text-xs border border-slate-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={!input.trim() || isProcessing}
                className="p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold disabled:opacity-40 hover:shadow-lg hover:shadow-cyan-500/20 transition flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 px-1">
              <span>Press <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">Enter</kbd> to search & vet</span>
              <span>Shortcut: <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">Ctrl + Space</kbd></span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
