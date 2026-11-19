import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { initialUsers, db } from '../../services/db'
import { Shield, Lock, Mail, Eye, EyeOff, CheckCircle2, AlertCircle, Zap, Cpu, Wrench } from 'lucide-react'

export const LoginPage: React.FC = () => {
  const { login } = useAuth()
  const [email, setEmail] = useState('it.engineer@msgoilfield.ae')
  const [password, setPassword] = useState('Admin@123')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [rememberMe, setRememberMe] = useState(true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage('')

    try {
      const res = await login(email, password)
      if (!res.success) {
        setErrorMessage(res.message || 'Invalid email or password.')
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication error.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickLogin = (demoEmail: string) => {
    setEmail(demoEmail)
    setPassword('Pass@123')
    login(demoEmail)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        {/* Header with MSG Branding */}
        <div className="bg-[#0B2545] p-6 text-center text-white relative">
          <div className="mx-auto w-16 h-16 bg-white p-2 rounded-xl shadow-md mb-3 flex items-center justify-center">
            <img src="/logo.png" alt="MSG Logo" className="max-h-full max-w-full object-contain" onError={(e) => {
              (e.target as HTMLElement).style.display = 'none'
            }} />
          </div>
          <h1 className="text-xl font-bold tracking-tight uppercase">MSG Oilfield Equipment Trading LLC</h1>
          <p className="text-xs text-slate-300 mt-1">Automated Stock, Heat Traceability & MTC Management</p>
          <div className="inline-block bg-indigo-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase mt-2">
            IT Administrator &amp; Enterprise Portal
          </div>
        </div>

        {/* IT Systems Engineer Fast Access (Primary Root Initial Administrator) */}
        <div className="bg-indigo-50 border-b border-indigo-200 p-3.5 text-center">
          <div className="flex items-center justify-center space-x-1.5 text-xs font-black text-indigo-900 uppercase tracking-wide">
            <Cpu className="h-4 w-4 text-indigo-600" />
            <span>Root IT Systems Engineer (Main Setup &amp; User Provisioning)</span>
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Full software configuration, seal/sign calibration, and employee provisioning. Sensitive commercial pricing is masked.
          </p>
          <button
            type="button"
            onClick={() => handleQuickLogin('it.engineer@msgoilfield.ae')}
            className="mt-2 w-full bg-gradient-to-r from-indigo-700 via-indigo-800 to-blue-800 hover:from-indigo-800 hover:to-blue-900 text-white font-black py-2 rounded-xl text-xs transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer transform hover:-translate-y-0.5"
          >
            <Wrench className="h-4 w-4 text-indigo-300" />
            <span>Sign In as Primary Root IT Administrator (Alex Turner)</span>
          </button>
        </div>

        {/* Special Solo Operator / Workers Away Fast Access */}
        <div className="bg-amber-500/10 border-b border-amber-500/30 p-3 text-center">
          <div className="flex items-center justify-center space-x-1.5 text-xs font-black text-amber-700 uppercase tracking-wide">
            <Zap className="h-3.5 w-3.5 fill-current text-amber-500" />
            <span>Special Solo Login (Workers Away Mode)</span>
          </div>
          <p className="text-[10px] text-slate-600 mt-0.5">
            Centralized fast-track portal for solo operators, weekends &amp; after-hours when staff is absent.
          </p>
          <button
            type="button"
            onClick={() => handleQuickLogin('admin@msgoilfield.ae')}
            className="mt-1.5 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black py-1.5 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5 fill-current text-slate-950" />
            <span>Enter Centralized Solo Hub (1-Click)</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Corporate Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@msgoilfield.ae"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600">
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500"
                />
                <span>Remember session</span>
              </label>
              <button
                type="button"
                onClick={() => alert('Please contact IT Administrator (admin@msgoilfield.ae) for secure password reset.')}
                className="text-red-600 hover:text-red-700 font-semibold"
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#0B2545] hover:bg-[#133C55] text-white font-bold py-2.5 rounded-lg text-xs transition-colors flex items-center justify-center space-x-2 shadow-md"
            >
              {isLoading ? (
                <span>Authenticating with Supabase...</span>
              ) : (
                <>
                  <Shield className="h-4 w-4 text-red-500" />
                  <span>Sign In to System</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Role Logins */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">
              Quick Role-Based Access Evaluation (1-Click)
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(db.getUsers() || initialUsers).slice(0, 8).map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleQuickLogin(u.email)}
                  className={`text-left p-2 rounded-lg border transition-colors ${
                    u.role === 'it_engineer'
                      ? 'bg-indigo-50/80 hover:bg-indigo-100 border-indigo-300'
                      : 'bg-slate-50 hover:bg-red-50 border-slate-200 hover:border-red-300'
                  }`}
                >
                  <div className="font-bold text-[11px] text-slate-800 truncate flex items-center justify-between">
                    <span>{u.employee_name}</span>
                    {u.role === 'it_engineer' && <span className="text-[9px] bg-indigo-600 text-white px-1 rounded font-mono">ROOT</span>}
                  </div>
                  <div className={`text-[10px] capitalize font-medium ${u.role === 'it_engineer' ? 'text-indigo-700 font-bold' : 'text-red-700'}`}>
                    {u.role.replace('_', ' ')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-3 text-center border-t border-slate-200 text-[10px] text-slate-400">
          Connected to Supabase PostgreSQL & Authentication Engine
        </div>
      </div>
    </div>
  )
}
