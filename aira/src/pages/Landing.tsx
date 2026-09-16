import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Moon, Sun } from 'lucide-react'
import { Hero } from '../components/landing/Hero'
import { Features } from '../components/landing/Features'
import { HowItWorks } from '../components/landing/HowItWorks'
import { Footer } from '../components/landing/Footer'
import { useServerStore } from '../stores/serverStore'
import { useTheme } from '../hooks/useTheme'
import { Modal } from '../components/ui/Modal'
import { GradientWave } from '../components/ui/gradient-wave'

export const Landing: React.FC = () => {
  const { server } = useServerStore()
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const [isDocsOpen, setIsDocsOpen] = useState(false)
  const [isStatusOpen, setIsStatusOpen] = useState(false)

  const isOnline = server.connectionStatus === 'connected'

  return (
    <div className="min-h-screen flex flex-col bg-page text-content-primary selection:bg-accent selection:text-accent-text relative overflow-hidden">
      {/* Ambient Premium Dynamic Background Layer */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* WebGL Gradient Wave for Light Mode */}
        {!isDark && (
          <div className="absolute inset-0 opacity-40">
            <GradientWave
              isPlaying={!isDark}
              colors={["#38bdf8", "#ffffff", "#818cf8", "#ffffff", "#38bdf8", "#ffffff"]}
              className="w-full h-full"
            />
          </div>
        )}

        {/* Luminous Dark Mode Atmosphere with Soft Aurora Glow & Dark GradientWave */}
        {isDark && (
          <div className="absolute inset-0">
            {/* Liquid Dark Mesh Wave */}
            <div className="absolute inset-0 opacity-40">
              <GradientWave
                key="landing-dark-wave"
                isPlaying={true}
                colors={["#0c1427", "#0284c7", "#1e1035", "#6366f1", "#075985", "#080c16"]}
                className="w-full h-full"
                shadowPower={4}
                darkenTop={true}
              />
            </div>
            <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[900px] h-[550px] rounded-full bg-gradient-to-tr from-[#38bdf8]/15 via-[#818cf8]/15 to-transparent blur-[140px] pointer-events-none" />
            <div className="absolute top-1/3 -left-48 w-[600px] h-[600px] rounded-full bg-[#38bdf8]/10 blur-[150px] pointer-events-none" />
            <div className="absolute top-2/3 -right-48 w-[600px] h-[600px] rounded-full bg-[#818cf8]/10 blur-[150px] pointer-events-none" />
          </div>
        )}

        {/* Subtle Precision Engineering Dot Grid */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(currentColor 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
          }}
        />

        {/* Smooth Vignette Mask to blend sections naturally */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-page/25 to-page pointer-events-none" />
      </div>

      {/* Fixed Sticky Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 h-14 z-40 bg-overlay/85 backdrop-blur-xl border-b border-border/80 px-4 sm:px-8 flex items-center justify-between transition-colors">
        {/* Logo & Wordmark */}
        <Link to="/" className="flex items-center gap-2.5 no-underline text-content-primary">
          <svg
            className="w-6 h-6 text-content-primary"
            viewBox="0 0 100 100"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
          >
            <polygon points="50,6 90,29 90,75 50,98 10,75 10,29" />
          </svg>
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-sm tracking-tight">AIRA</span>
            <span className="text-[11px] font-mono uppercase text-content-tertiary">
              MRPL
            </span>
          </div>
        </Link>

        {/* Right Nav Actions */}
        <div className="flex items-center gap-3">
          {/* Docs trigger */}
          <button
            onClick={() => setIsDocsOpen(true)}
            className="btn-ghost !text-xs !py-1.5 !px-2.5 hidden sm:inline-flex"
          >
            Docs
          </button>

          {/* Status Dot */}
          <button
            onClick={() => setIsStatusOpen(true)}
            className="btn-ghost !text-xs !py-1.5 !px-2.5 flex items-center gap-2"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-success shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-danger'
              }`}
            />
            <span className="text-content-secondary hidden sm:inline">
              {isOnline ? 'Cluster Online' : 'Cluster Offline'}
            </span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="btn-icon !w-8 !h-8 text-content-secondary"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Enter App Primary CTA */}
          <Link to="/app" className="btn-primary !py-2 !px-4 !text-xs">
            <span>Enter App</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </header>

      {/* Main Content Sections */}
      <main className="flex-1 relative z-10">
        <Hero />
        <Features />
        <HowItWorks />
      </main>

      {/* Landing Footer */}
      <Footer />

      {/* Docs Modal */}
      <Modal
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
        title="MRPL AIRA System Documentation"
        description="Air-Gapped Sovereign AI Architecture Overview"
      >
        <div className="space-y-4 text-xs text-content-secondary leading-relaxed">
          <p>
            <strong>AIRA (AI Research Assistant)</strong> is deployed on dedicated hardware
            within the Mangalore Refinery perimeter. All model weights and embeddings operate on internal NVLink GPU clusters without internet connectivity.
          </p>
          <div className="p-3 bg-elevated rounded-lg border border-border">
            <div className="font-semibold text-content-primary mb-1">Local Network Cluster Topology:</div>
            <ul className="list-disc pl-4 space-y-1">
              <li>Primary Qwen Node: <code className="break-all">{server.g15_1_url}</code> (Qwen3-8B)</li>
              <li>Local Ollama Node: <code>{server.g15_2_url}</code> (Local Node)</li>
              <li>OCR Engine: EasyOCR Multilingual (English &amp; Hindi)</li>
            </ul>
          </div>
          <p>
            Connected to on-premise inference cluster via sovereign tunnel.
          </p>
        </div>
      </Modal>

      {/* Status Modal */}
      <Modal
        isOpen={isStatusOpen}
        onClose={() => setIsStatusOpen(false)}
        title="Local GPU Cluster Status"
        description="Real-time health of MRPL on-premise compute nodes"
      >
        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between p-3 rounded-lg bg-elevated border border-border">
            <div className="min-w-0 pr-2">
              <div className="font-medium text-content-primary">Qwen Cloudflare Tunnel Node</div>
              <div className="text-content-tertiary font-mono truncate text-[11px]">{server.g15_1_url}</div>
            </div>
            <span className={`px-2 py-0.5 rounded-pill text-[11px] font-medium shrink-0 ${
              server.primaryStatus === 'connected' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
            }`}>
              {server.primaryStatus === 'connected' ? 'Operational' : 'Offline'}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-elevated border border-border">
            <div className="min-w-0 pr-2">
              <div className="font-medium text-content-primary">Local Ollama Node (Qwen3-8B)</div>
              <div className="text-content-tertiary font-mono text-[11px]">{server.g15_2_url}</div>
            </div>
            <span className={`px-2 py-0.5 rounded-pill text-[11px] font-medium shrink-0 ${
              server.coderStatus === 'connected' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
            }`}>
              {server.coderStatus === 'connected' ? 'Operational' : 'Offline'}
            </span>
          </div>

          <div className="p-2.5 text-center text-content-tertiary text-[11px]">
            Live Qwen inference active &middot; Zero third-party telemetry
          </div>
        </div>
      </Modal>
    </div>
  )
}
