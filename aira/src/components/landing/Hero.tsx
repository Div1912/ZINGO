import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, ShieldCheck, LogIn } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

export const Hero: React.FC = () => {
  const { user, profile, openAuthModal } = useAuthStore()

  const scrollToFeatures = () => {
    const el = document.getElementById('features')
    el?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="relative min-h-app-screen flex flex-col items-center justify-center text-center px-4 pt-20 pb-12 overflow-hidden">
      {/* Sovereign Air-Gap Badge */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill bg-surface/85 dark:bg-surface/75 backdrop-blur-xl border border-border/80 text-xs font-medium text-content-primary mb-8 shadow-xs"
      >
        <ShieldCheck size={14} className="text-success" />
        <span>Sovereign AI — No Data Leaves Your Network</span>
      </motion.div>

      {/* Main Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.1 }}
        className="text-4xl sm:text-5xl md:text-6xl lg:text-[56px] font-semibold text-content-primary tracking-[-0.04em] leading-[1.08] max-w-2xl mx-auto"
      >
        Intelligent Assistant for MRPL Operations
      </motion.h1>

      {/* Subhead */}
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.2 }}
        className="text-base sm:text-lg text-content-secondary max-w-md mx-auto mt-6 leading-relaxed font-normal"
      >
        A private, air-gapped AI workbench running entirely on MRPL&apos;s
        own servers. Search internal documents, generate reports,
        write code — nothing leaves the premises.
      </motion.p>

      {/* Call to Actions */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.3 }}
        className="flex flex-wrap items-center justify-center gap-3.5 mt-9"
      >
        {!user ? (
          <button
            onClick={() => openAuthModal('signin')}
            className="btn-primary shadow-sm hover:shadow-md transition-shadow flex items-center gap-2"
          >
            <LogIn size={15} />
            <span>Sign In to Access Workspace</span>
            <ArrowRight size={15} />
          </button>
        ) : (
          <Link
            to="/app"
            className="btn-primary shadow-sm hover:shadow-md transition-shadow flex items-center gap-2"
          >
            <span>Open Workspace ({profile?.display_name || user.email?.split('@')[0]})</span>
            <ArrowRight size={15} />
          </Link>
        )}
        <button onClick={scrollToFeatures} className="btn-glass !backdrop-blur-xl bg-surface/60 hover:bg-surface/90">
          <span>See how it works</span>
          <ChevronDown size={15} />
        </button>
      </motion.div>

      {/* Subtle Animated Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-content-tertiary cursor-pointer"
        onClick={scrollToFeatures}
      >
        <span className="text-[11px] tracking-wider uppercase">Scroll</span>
        <motion.div
          animate={{ y: [0, 5, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown size={14} />
        </motion.div>
      </motion.div>
    </section>
  )
}
