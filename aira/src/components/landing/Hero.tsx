import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, ShieldCheck, LogIn } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { LaptopShowcase } from './LaptopShowcase'

export const Hero: React.FC = () => {
  const { user, profile, openAuthModal } = useAuthStore()

  const scrollToFeatures = () => {
    const el = document.getElementById('features')
    el?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="relative min-h-app-screen flex flex-col items-center justify-start text-center px-3 sm:px-6 pt-24 sm:pt-28 pb-16 overflow-hidden">
      {/* Sovereign Air-Gap Badge */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 mb-6 shadow-xs"
      >
        <ShieldCheck size={14} className="text-emerald-500 stroke-[2.5]" />
        <span>Sovereign AI — No Data Leaves Your Network</span>
      </motion.div>

      {/* Main Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.1 }}
        className="text-4xl sm:text-5xl md:text-6xl lg:text-[62px] font-bold text-slate-900 dark:text-white tracking-[-0.035em] leading-[1.1] max-w-4xl mx-auto"
      >
        Turn your internal knowledge <br />
        <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 bg-clip-text text-transparent">
          into action.
        </span>
      </motion.h1>

      {/* Subhead */}
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.2 }}
        className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto mt-4 leading-relaxed font-normal"
      >
        AIRA reads your documents, understands your context, uses the right tools, and
        delivers production-ready outputs — entirely within MRPL.
      </motion.p>

      {/* Call to Actions */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.3 }}
        className="flex flex-wrap items-center justify-center gap-3.5 mt-7 mb-4"
      >
        {!user ? (
          <button
            onClick={() => openAuthModal('signin')}
            className="h-11 px-5 rounded-full bg-slate-950 hover:bg-black text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950 font-medium text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2 group cursor-pointer"
          >
            <LogIn size={15} />
            <span>Sign In to Access Workspace</span>
            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : (
          <Link
            to="/app"
            className="h-11 px-5 rounded-full bg-slate-950 hover:bg-black text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950 font-medium text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2 group"
          >
            <span>Open Workspace ({profile?.display_name || user.email?.split('@')[0]})</span>
            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}
        <button
          onClick={scrollToFeatures}
          className="h-11 px-5 rounded-full bg-white/80 hover:bg-white text-slate-800 dark:bg-slate-900/80 dark:hover:bg-slate-800 dark:text-slate-200 border border-slate-200/90 dark:border-slate-800 font-medium text-xs sm:text-sm shadow-xs transition-all flex items-center gap-1.5 cursor-pointer backdrop-blur-xl"
        >
          <span>See how it works</span>
          <ChevronDown size={14} />
        </button>
      </motion.div>

      {/* Laptop & Architecture Data Flow Showcase */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.35 }}
        className="w-full"
      >
        <LaptopShowcase />
      </motion.div>
    </section>
  )
}
