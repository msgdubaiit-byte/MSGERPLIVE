import React, { useState, useEffect } from 'react'
import { useAuth, DEFAULT_ROLE_MODULES } from '../../context/AuthContext'
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  ShieldCheck,
  Zap,
  Flame,
  FileCheck2,
  Layers,
  Cpu,
  Boxes,
  Truck,
  RotateCcw,
  Compass,
  Play
} from 'lucide-react'

interface OnboardingGuideModalProps {
  isOpen?: boolean
  onClose?: () => void
  forceOpen?: boolean
}

export const OnboardingGuideModal: React.FC<OnboardingGuideModalProps> = ({
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
  forceOpen = false
}) => {
  const { currentUser, currentRole, canAccessModule } = useAuth()
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(true)

  // Check if current user has already seen this initial onboarding
  useEffect(() => {
    if (!currentUser) return
    const storageKey = `msg_onboarding_completed_${currentUser.id}`
    const alreadySeen = localStorage.getItem(storageKey)

    if (forceOpen || (!alreadySeen && controlledIsOpen === undefined)) {
      setInternalIsOpen(true)
      setCurrentStep(0)
    }
  }, [currentUser, forceOpen, controlledIsOpen])

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen

  const handleClose = () => {
    if (currentUser && dontShowAgain) {
      localStorage.setItem(`msg_onboarding_completed_${currentUser.id}`, 'true')
    }
    setInternalIsOpen(false)
    if (controlledOnClose) {
      controlledOnClose()
    }
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      handleClose()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  if (!isOpen || !currentUser) return null

  // Role details tailored specifically to current user
  const getRoleDescription = () => {
    switch (currentRole) {
      case 'it_engineer':
        return {
          title: 'Root IT Systems Administrator',
          badge: 'IT Architecture & Root Provisioning',
          badgeColor: 'bg-indigo-600 text-white',
          desc: 'You hold full authority to configure software parameters, calibrate stamps & seals, provision employee accounts, and manage Supabase Cloud sync. Sensitive commercial customer rates and profit margins are automatically obscured for maximum confidentiality.',
          highlight: 'Full Software & User Control (Data Masked)'
        }
      case 'sales_team':
        return {
          title: 'Commercial Sales Specialist',
          badge: 'Sales & Client Orders',
          badgeColor: 'bg-amber-600 text-white',
          desc: 'You can create sales orders, search available stock heats in real-time, generate automated CIPL proformas, print stickers, and reserve inventory for client POs.',
          highlight: 'Fast Order Processing & Stock Reservation'
        }
      case 'storekeeper':
        return {
          title: 'Warehouse & Yard Storekeeper',
          badge: 'Physical Yard Verification',
          badgeColor: 'bg-emerald-600 text-white',
          desc: 'You perform physical stock inspections, approve heat reservations before release, manage local purchases (LOC), and execute physical inventory dispatches.',
          highlight: 'Physical Verification & Stock Release'
        }
      case 'mtc_controller':
        return {
          title: 'Quality Assurance & MTC Controller',
          badge: 'QA/QC & Mill Certs',
          badgeColor: 'bg-blue-600 text-white',
          desc: 'You review mill test certificates, verify chemical and mechanical properties, link missing MTCs to heats, and sign off on technical compliance packages.',
          highlight: '100% Heat-to-MTC Compliance'
        }
      case 'dispatch_team':
        return {
          title: 'Logistics & Dispatch Controller',
          badge: 'Physical Shipping & DN',
          badgeColor: 'bg-purple-600 text-white',
          desc: 'You generate delivery notes, print waterproof weatherproof pallet tags, deduct physical stock, and package client transmittals.',
          highlight: 'Delivery Notes & Stock Reduction'
        }
      default:
        return {
          title: 'Enterprise Management Executive',
          badge: 'Enterprise Operations',
          badgeColor: 'bg-slate-800 text-white',
          desc: 'You have full 360° visibility over inventory movements, orders, traceability audit logs, and performance analytics across all departments.',
          highlight: 'Complete Operational Visibility'
        }
    }
  }

  const roleInfo = getRoleDescription()

  const steps = [
    {
      id: 'welcome',
      title: `Welcome, ${currentUser.employee_name}!`,
      subtitle: 'Your Account Has Been Initialized & Configured',
      icon: <Sparkles className="h-7 w-7 text-amber-400 animate-pulse" />,
      content: (
        <div className="space-y-4">
          <div className="flex items-center space-x-3 p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#0B2545] to-indigo-700 flex items-center justify-center text-white shrink-0 shadow-md">
              <Cpu className="h-6 w-6 text-indigo-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-sm text-slate-900">{currentUser.employee_name}</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${roleInfo.badgeColor}`}>
                  {roleInfo.badge}
                </span>
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {currentUser.email} • <strong>{currentUser.department}</strong>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {roleInfo.desc}
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-[11px] font-bold text-slate-700">Account Status: Active</span>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center space-x-2">
              <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0" />
              <span className="text-[11px] font-bold text-slate-700">{roleInfo.highlight}</span>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'pipeline',
      title: 'Real-Time ERP Workflow Pipeline',
      subtitle: 'From Stock Arrival to MTC Verified Dispatch',
      icon: <Layers className="h-7 w-7 text-indigo-400" />,
      content: (
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            MSG Oilfield ERP automates stock allocation, heat traceability, and MTC package generation with zero manual data entry:
          </p>

          {/* Animated workflow step cards */}
          <div className="space-y-2">
            {[
              {
                num: '1',
                title: 'Master Stock & Heat Registry',
                desc: 'Lots, heat numbers, suppliers (WMASS Germany, BENKAN), and certified YOM.',
                icon: <Boxes className="h-4 w-4 text-blue-600" />
              },
              {
                num: '2',
                title: 'Sales Orders & Auto Allocation',
                desc: 'Orders automatically allocate available stock and link corresponding MTCs.',
                icon: <Zap className="h-4 w-4 text-amber-500" />
              },
              {
                num: '3',
                title: 'Storekeeper Physical Verification',
                desc: 'Storekeeper yard checks physical stamp and releases approved quantity.',
                icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              },
              {
                num: '4',
                title: 'Fast Dispatch & Instant Stock Reduction',
                desc: '1-click delivery notes deduct inventory and compile stamped client MTC packages.',
                icon: <Truck className="h-4 w-4 text-purple-600" />
              }
            ].map(step => (
              <div
                key={step.num}
                className="flex items-center space-x-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 text-xs"
              >
                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center text-[10px] shrink-0">
                  {step.num}
                </div>
                <div className="flex-1">
                  <div className="font-extrabold text-slate-900 flex items-center space-x-1.5">
                    {step.icon}
                    <span>{step.title}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      id: 'mtc_engine',
      title: 'MTC & Quality Traceability Vault',
      subtitle: 'Heat Traceability, Stamps & Cloud Storage',
      icon: <Flame className="h-7 w-7 text-rose-400" />,
      content: (
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Every pipe, flange, and fitting is tracked by its unique <strong>Heat Number</strong>. Never lose a certificate again:
          </p>

          <div className="border border-rose-200 bg-rose-50/60 rounded-xl p-3 space-y-2 text-xs">
            <div className="flex items-center space-x-2 text-rose-900 font-extrabold">
              <FileCheck2 className="h-4 w-4 text-rose-600" />
              <span>Direct Missing MTC Upload &amp; Cloud Sync</span>
            </div>
            <p className="text-[11px] text-slate-700 leading-relaxed">
              If a heat certificate is missing, simply click <strong>&quot;Upload Missing MTC&quot;</strong> anywhere in the system. The file is instantly validated and uploaded to the Supabase Cloud Storage vault (<code className="bg-rose-100 text-rose-800 px-1 py-0.5 rounded font-mono font-bold">mtc-vault</code>) with public CDN access for client transmittals.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl border border-slate-200 bg-white">
              <div className="font-bold text-slate-900">Custom QA/QC Seal</div>
              <div className="text-[11px] text-slate-500 mt-0.5">IT can calibrate seal size, stamp text, and signature offsets in IT Console.</div>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-200 bg-white">
              <div className="font-bold text-slate-900">360° Audit Trail</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Every allocation, release, and physical stock change is immutably logged.</div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'solo_hub',
      title: 'Centralized Solo Hub (Workers Away Mode)',
      subtitle: 'Unified Command Screen for Fast Execution',
      icon: <Zap className="h-7 w-7 text-amber-400" />,
      content: (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2 text-xs">
            <div className="flex items-center space-x-2 text-amber-950 font-black">
              <Zap className="h-4 w-4 fill-current text-amber-500" />
              <span>Solo Operator Fast-Track Hub</span>
            </div>
            <p className="text-[11px] text-slate-700 leading-relaxed">
              Working weekends or after-hours when warehouse and sales staff are away? Open the <strong>Centralized Solo Hub</strong> from the left sidebar to handle everything in one screen:
            </p>
            <ul className="list-disc list-inside text-[11px] text-slate-700 space-y-1 pl-1">
              <li>1-Click Order Deliverables (SO, PO, MTC, LOC, Stickers)</li>
              <li>Instant Heat &amp; Available Stock Finder</li>
              <li>Local Purchase splitting with auto-generated L-Codes</li>
              <li>1-Click Fast Stock Deduction &amp; Physical Dispatch</li>
            </ul>
          </div>

          <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl text-xs text-indigo-950">
            <strong>Need to adjust your permissions?</strong> Contact your IT Systems Administrator (<code className="font-mono font-bold">it.engineer@msgoilfield.ae</code>) who can configure module visibility in real-time.
          </div>
        </div>
      )
    },
    {
      id: 'ready',
      title: 'You Are Ready to Get Started!',
      subtitle: 'All Systems Operational & Synced',
      icon: <CheckCircle2 className="h-7 w-7 text-emerald-400" />,
      content: (
        <div className="space-y-4 text-center py-2">
          <div className="w-16 h-16 bg-emerald-100 border border-emerald-300 rounded-2xl mx-auto flex items-center justify-center shadow-md animate-bounce">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>

          <div>
            <h4 className="font-black text-slate-900 text-sm">
              Setup Complete for {currentUser.employee_name}
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Your session is active. Explore your permitted workspaces using the left navigation sidebar.
            </p>
          </div>

          <div className="pt-2">
            <label className="inline-flex items-center space-x-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>Don&apos;t show this walkthrough automatically on next login</span>
            </label>
          </div>
        </div>
      )
    }
  ]

  const activeStepObj = steps[currentStep]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden transform transition-all">
        
        {/* Animated Top Banner */}
        <div className="bg-gradient-to-r from-slate-950 via-[#0B2545] to-indigo-950 p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
                {activeStepObj.icon}
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                  Step {currentStep + 1} of {steps.length} • Initial Guide
                </span>
                <h3 className="text-base font-black tracking-tight text-white leading-tight">
                  {activeStepObj.title}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  {activeStepObj.subtitle}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              title="Close Guide"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Progress Indicator Dots / Bar */}
          <div className="flex items-center space-x-1.5 mt-5">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentStep
                    ? 'w-8 bg-gradient-to-r from-amber-400 to-indigo-400 shadow-sm'
                    : idx < currentStep
                    ? 'w-3 bg-emerald-400/80'
                    : 'w-2 bg-white/20'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {activeStepObj.content}

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-5 mt-5 border-t border-slate-100 text-xs">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className={`px-3 py-1.5 rounded-xl border border-slate-300 font-bold flex items-center space-x-1 cursor-pointer transition-colors ${
                currentStep === 0
                  ? 'opacity-40 cursor-not-allowed text-slate-400'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-1.5 text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
              >
                Skip Walkthrough
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-2 bg-gradient-to-r from-[#0B2545] to-indigo-700 hover:from-slate-900 hover:to-indigo-800 text-white font-extrabold rounded-xl shadow-md transition-all cursor-pointer flex items-center space-x-1.5 transform hover:-translate-y-0.5"
              >
                <span>{currentStep === steps.length - 1 ? 'Launch Workspace' : 'Continue'}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
