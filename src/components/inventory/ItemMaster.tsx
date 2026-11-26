import React, { useState } from 'react'
import { db } from '../../services/db'
import { useAuth } from '../../context/AuthContext'
import { Boxes, Plus, Search, CheckCircle2, XCircle } from 'lucide-react'

export const ItemMaster: React.FC = () => {
  const { hasPermission, currentUser } = useAuth()
  const items = db.getItems()
  const [searchTerm, setSearchTerm] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  const [itemCode, setItemCode] = useState('')
  const [description, setDescription] = useState('')
  const [materialGrade, setMaterialGrade] = useState('SS316/316L')
  const [specification, setSpecification] = useState('ASTM A182 / ASME B16.5')
  const [size, setSize] = useState('2" #150')
  const [uom, setUom] = useState('PCS')
  const [unitPrice, setUnitPrice] = useState(50)

  const canEdit = hasPermission(['super_admin', 'admin_inventory'])

  const filtered = items.filter(it =>
    it.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    it.item_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    it.material_grade.toLowerCase().includes(searchTerm.toLowerCase()) ||
    it.specification.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemCode.trim() || !description.trim()) {
      alert('Please fill mandatory item fields.')
      return
    }

    const res = db.addItem({
      item_code: itemCode.trim().toUpperCase(),
      item_description: description.trim(),
      material_grade: materialGrade,
      specification: specification,
      size: size,
      uom: uom,
      unit_price_aed: Number(unitPrice),
      is_active: true
    }, currentUser?.email || 'admin@msgoilfield.ae')

    if (res.success) {
      alert(`Item ${itemCode} successfully added to Item Master!`)
      setIsAddModalOpen(false)
      setItemCode('')
      setDescription('')
    } else {
      alert(res.message)
    }
  }

  return (
    <div className="space-y-4">
      {/* Zoho Page Header */}
      <div className="bg-white px-5 py-4 rounded-lg border border-slate-200 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Item Master</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Standard specifications, ASME ratings, material grades, and pricing catalog.
          </p>
        </div>

        {canEdit && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-2 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Item</span>
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 flex items-center text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Item Code, Grade, Specification, Description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Item Master Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase text-[11px] font-semibold tracking-wider">
              <tr>
                <th className="py-3 px-4">Item Code</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Material Grade</th>
                <th className="py-3 px-4">Specification</th>
                <th className="py-3 px-4">Size / Rating</th>
                <th className="py-3 px-4 text-center">UOM</th>
                <th className="py-3 px-4 text-right">Unit Price (AED)</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(it => (
                <tr key={it.id} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">{it.item_code}</td>
                  <td className="py-2.5 px-4 text-slate-700 max-w-md">{it.item_description}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-800">{it.material_grade}</td>
                  <td className="py-2.5 px-4 text-slate-600">{it.specification}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-700">{it.size}</td>
                  <td className="py-2.5 px-4 text-center font-medium text-slate-700">{it.uom}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-800">
                    AED {it.unit_price_aed?.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <span className="text-emerald-700 font-medium text-[11px] bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                      Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] flex flex-col shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex justify-between items-center gap-2 shrink-0">
              <h3 className="font-semibold text-sm text-slate-900">New Item Specification</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleAddItem} className="p-5 space-y-3.5 text-xs overflow-y-auto flex-1">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Item Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WSO50150F316"
                  value={itemCode}
                  onChange={(e) => setItemCode(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Material Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2'' Flange SORF CL150 SS316/SS316L"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Material Grade</label>
                  <input
                    type="text"
                    value={materialGrade}
                    onChange={(e) => setMaterialGrade(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Specification Standard</label>
                  <input
                    type="text"
                    value={specification}
                    onChange={(e) => setSpecification(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Size / Class</label>
                  <input
                    type="text"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">UOM</label>
                  <input
                    type="text"
                    value={uom}
                    onChange={(e) => setUom(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unit Price AED</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-md text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
                >
                  Save to Item Master
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
