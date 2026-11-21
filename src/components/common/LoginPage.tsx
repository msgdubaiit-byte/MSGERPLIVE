import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Shield, Lock, Mail, Eye, EyeOff, CheckCircle2, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react'

type AuthMode = 'login' | 'forgot' | 'recovery'

export const LoginPage: React.FC = () => {
  const { login, resetPasswordForEmail, updatePassword, isRecoveryMode } = useAuth()
  
  const [mode, setMode] = useState<AuthMode>(isRecoveryMode ? 'recovery' : 'login')
  
  // Login & Shared State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  
  // Recovery State
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const res = await login(email, password)
      if (!res.success) {
        setErrorMessage(res.message || 'Invalid email or password.')
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication service error.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const res = await resetPasswordForEmail(email)
      if (res.success) {
        setSuccessMessage(res.message)
      } else {
        setErrorMessage(res.message)
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error sending password reset.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    if (newPassword !== confirmPassword) {
      setIsLoading(false)
      setErrorMessage('Passwords do not match.')
      return
    }

    try {
      const res = await updatePassword(newPassword)
      if (res.success) {
        setSuccessMessage('Password reset successfully! Please sign in with your new password.')
        setMode('login')
      } else {
        setErrorMessage(res.message)
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error updating password.')
    } finally {
      setIsLoading(false)
    }
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
          <p className="text-xs text-slate-300 mt-1">Automated Stock, Heat Traceability &amp; MTC Management</p>
          <div className="inline-flex items-center space-x-1.5 bg-slate-800/80 border border-slate-600 text-slate-200 text-[10px] font-semibold px-3 py-1 rounded-full mt-2">
            <Shield className="h-3 w-3 text-emerald-400" />
            <span>Secure Enterprise Production Portal</span>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start space-x-2 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* MODE: LOGIN */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Corporate Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="it.engineer@msgoilfield.ae"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2545] focus:border-transparent text-slate-900"
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
                    className="w-full pl-9 pr-10 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2545] focus:border-transparent text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="text-[11px] text-slate-500">Live Supabase Authentication</span>

                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setErrorMessage(''); setSuccessMessage(''); }}
                  className="text-[#0B2545] hover:text-blue-800 font-semibold cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#0B2545] hover:bg-[#133C55] text-white font-bold py-2.5 rounded-lg text-xs transition-colors flex items-center justify-center space-x-2 shadow-md cursor-pointer disabled:opacity-70"
              >
                {isLoading ? (
                  <span>Authenticating with Supabase...</span>
                ) : (
                  <>
                    <Shield className="h-4 w-4 text-emerald-400" />
                    <span>Sign In to System</span>
                  </>
                )}
              </button>

              <div className="pt-2 text-center text-[11px] text-slate-500">
                Authorized Staff Only. User accounts are created &amp; provisioned by the IT Systems Administrator.
              </div>
            </form>
          )}

          {/* MODE: FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="text-xs text-slate-600">
                Enter your registered corporate email to receive a secure Supabase password recovery link.
              </div>

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
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2545] text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setErrorMessage(''); setSuccessMessage(''); }}
                  className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-[#0B2545] hover:bg-[#133C55] text-white font-bold py-2.5 rounded-lg text-xs transition-colors flex items-center justify-center space-x-2 shadow-md cursor-pointer disabled:opacity-70"
                >
                  {isLoading ? <span>Sending Link...</span> : <span>Send Reset Link</span>}
                </button>
              </div>
            </form>
          )}

          {/* MODE: PASSWORD RECOVERY */}
          {mode === 'recovery' && (
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div className="text-xs text-slate-600 font-medium">
                Set a new password for your authenticated Supabase user account.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Password (Min 6 chars)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2545] text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2545] text-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#0B2545] hover:bg-[#133C55] text-white font-bold py-2.5 rounded-lg text-xs transition-colors flex items-center justify-center space-x-2 shadow-md cursor-pointer disabled:opacity-70"
              >
                <KeyRound className="h-4 w-4 text-amber-400" />
                <span>{isLoading ? 'Updating Password...' : 'Save New Password'}</span>
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-3 text-center border-t border-slate-200 text-[10px] text-slate-400 flex items-center justify-center space-x-1.5">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          <span>Connected to Supabase PostgreSQL &amp; Auth (Authorized Accounts Only)</span>
        </div>
      </div>
    </div>
  )
}
