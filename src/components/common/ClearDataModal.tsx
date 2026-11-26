import React, { useState } from 'react'
import { db } from '../../services/db'
import { useAuth } from '../../context/AuthContext'
import { AlertTriangle, Trash2, RefreshCw, CheckCircle2, X } from 'lucide-react'

interface ClearDataModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (msg: string) => void
}

export const ClearDataModal: React.FC<ClearDataModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { currentUser } = useAuth()
  const [isProcessing, setIsProcessing] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  if (!isOpen) return null

  const handleClearAll = () => {
    setIsProcessing(true)
    try {
      db.clearAllData(currentUser?.email || 'admin@msgoilfield.ae')
      onSuccess?.('All stock inventory, sales orders, movements, and certificates have been wiped. System is 100% clean for testing.')
      onClose()
    } catch (err: any) {
      alert('Error clearing data: ' + err.message)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleResetDemo = async () => {
    setIsProcessing(true)
    try {
      await db.resetToDemoData(currentUser?.email || 'admin@msgoilfield.ae')
      onSuccess?.('Default MSG demonstration data restored successfully.')
      onClose()
    } catch (err: any) {
      alert('Error resetting demo data: ' + err.message)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="bg-rose-50 text-rose-900 px-5 py-3.5 border-b border-rose-200 flex justify-between items-center gap-2 shrink-0">
          <div className="flex items-center space-x-2">
            <Trash2 className="h-4 w-4 text-rose-600" />
            <h2 className="text-sm font-semibold">Clear Data &amp; Reset Test Environment</h2>
          </div>
          <button onClick={onClose} className="text-rose-400 hover:text-rose-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs text-slate-700 overflow-y-auto flex-1">
          <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-md flex items-start space-x-3 text-rose-900">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-xs">Fresh Upload &amp; Testing Mode</div>
              <p className="text-[11px] text-rose-800 mt-0.5">
                Use this to wipe all demo stock lots, sales orders, allocations, dispatches, and certificates so you can test uploading your custom 6-column Excel file and your certificate ZIP archive from a clean slate.
              </p>
            </div>
          </div>

          <div className="space-y-1 bg-slate-50 p-3 rounded-md border border-slate-200">
            <div className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider">What will be cleared:</div>
            <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-0.5">
              <li>Master Stock lots, physical balances, and available stock (0 items)</li>
              <li>Sales Orders, pending allocations, and reservations</li>
              <li>Storekeeper physical verification approvals</li>
              <li>MTC certificate records and packages</li>
              <li>Local purchase L-codes and supplier dispatches</li>
              <li>Complete stock movement ledger and audit logs</li>
            </ul>
          </div>

          <p className="text-[11px] text-slate-500">
            You can restore the sample demonstration dataset at any time by clicking <strong>&quot;Reset to Demo Data&quot;</strong>.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row justify-end items-center gap-2">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="w-full sm:w-auto px-4 py-2 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleResetDemo}
              disabled={isProcessing}
              className="w-full sm:w-auto px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md font-semibold flex items-center justify-center space-x-1"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
              <span>Reset to Demo Data</span>
            </button>
            <button
              onClick={handleClearAll}
              disabled={isProcessing}
              className="w-full sm:w-auto px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-md font-semibold shadow-xs flex items-center justify-center space-x-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Everything</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
