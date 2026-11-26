import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Shield, Lock, Mail, Eye, EyeOff, CheckCircle2, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react'

type AuthMode = 'login' | 'forgot' | 'recovery'

export const LoginPage: React.FC = () => {
  const { login, resetPasswordForEmail, updatePassword, isRecoveryMode } = useAuth()

  const [mode, setMode] = useState<AuthMode>(isRecoveryMode ? 'recovery' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      if (!res.success) setErrorMessage(res.message || 'Invalid email or password.')
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
      if (res.success) setSuccessMessage(res.message)
      else setErrorMessage(res.message)
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
        setSuccessMessage('Password updated successfully. Please sign in.')
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
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Clean Commercial Header */}
        <div className="px-7 pt-7 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 p-1.5 flex items-center justify-center shrink-0">
              <img
                src="/logo.png"
                alt="MSG Logo"
                className="max-h-full max-w-full object-contain"
                onError={(e) => {
                  ;(e.target as HTMLElement).style.display = 'none'
                }}
              />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">MSG Oilfield Equipment Trading LLC</h1>
              <p className="text-xs text-slate-500">Stock, Heat Traceability &amp; MTC Portal</p>
            </div>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mt-4">
            {mode === 'login' ? 'Sign in to your account' : mode === 'forgot' ? 'Reset password' : 'Set new password'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter your corporate credentials to access the ERP workspace.
          </p>
        </div>

        <div className="p-7">
          {errorMessage && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Corporate Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@msgoilfield.ae"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-700">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot')
                      setErrorMessage('')
                      setSuccessMessage('')
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-9 pr-10 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900"
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

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-md text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
              >
                <Shield className="h-4 w-4" />
                <span>{isLoading ? 'Signing in...' : 'Sign In'}</span>
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Corporate Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@msgoilfield.ae"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login')
                    setErrorMessage('')
                    setSuccessMessage('')
                  }}
                  className="px-3 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-md text-xs flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-md text-xs cursor-pointer disabled:opacity-70"
                >
                  {isLoading ? 'Submitting...' : 'Request Password Reset'}
                </button>
              </div>
            </form>
          )}

          {mode === 'recovery' && (
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">New Password (min 6 chars)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-md text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <KeyRound className="h-4 w-4" />
                <span>{isLoading ? 'Updating...' : 'Save New Password'}</span>
              </button>
            </form>
          )}
        </div>

        <div className="bg-slate-50 px-7 py-3 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Authorized Corporate Access</span>
          <span className="flex items-center gap-1 text-emerald-700 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            <span>Encrypted Session</span>
          </span>
        </div>
      </div>
    </div>
  )
}
