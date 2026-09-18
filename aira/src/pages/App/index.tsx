import React, { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from '../../components/layout/Sidebar'
import { Header } from '../../components/layout/Header'
import { CommandBar } from '../../components/layout/CommandBar'
import { ToastContainer } from '../../components/ui/ToastContainer'
import { useKeyboard } from '../../hooks/useKeyboard'
import { useTheme } from '../../hooks/useTheme'
import { useChatStore } from '../../stores/chatStore'
import { SettingsPage, type TabKey } from './Settings'
import { CodeRunnerModal } from '../../components/chat/CodeRunnerModal'
import { ProjectsModal } from '../../components/layout/ProjectsModal'
import { ArtifactsModal } from '../../components/layout/ArtifactsModal'
import { ArtifactViewer } from '../../components/artifacts/ArtifactViewer'
import { GradientWave } from '../../components/ui/gradient-wave'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAuthStore } from '../../stores/authStore'
import { NamePromptModal } from '../../components/auth/NamePromptModal'
import { AuthModal } from '../../components/auth/AuthModal'

export const AppShell: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const isSettingsRoute = location.pathname === '/app/settings'

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isCommandBarOpen, setIsCommandBarOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(isSettingsRoute)
  const [settingsTab, setSettingsTab] = useState<TabKey>('general')
  const [codeRunnerSnippet, setCodeRunnerSnippet] = useState<string | null>(null)
  const [isProjectsOpen, setIsProjectsOpen] = useState(false)
  const [isArtifactsOpen, setIsArtifactsOpen] = useState(false)

  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const { stopGeneration, isGenerating } = useChatStore()
  const { settings } = useSettingsStore()

  const fontClass =
    settings.chatFont === 'serif'
      ? 'font-serif'
      : settings.chatFont === 'mono'
      ? 'font-mono'
      : 'font-sans'

  // Keep modal open if on /app/settings
  useEffect(() => {
    if (isSettingsRoute) {
      setIsSettingsOpen(true)
    }
  }, [isSettingsRoute])

  // Automatically close mobile sidebar on route navigation
  useEffect(() => {
    setIsMobileSidebarOpen(false)
  }, [location.pathname])

  // Initialize Supabase Auth & Session Listener
  useEffect(() => {
    useAuthStore.getState().initialize()
  }, [])

  const handleOpenSettings = (tab: string = 'general') => {
    setSettingsTab(tab as TabKey)
    setIsSettingsOpen(true)
  }

  const handleCloseSettings = () => {
    setIsSettingsOpen(false)
    if (isSettingsRoute) {
      navigate('/app')
    }
  }

  const handleOpenCodeRunner = () => {
    setCodeRunnerSnippet(`import numpy as np
import pandas as pd

# MRPL CDU-2 Column Flash Zone & Cut Balance
crude_flow_bpd = 120_000
cot_temp_c = 368.5

cut_yields = {
    "LPG (C3-C4)": 0.0267,
    "Light Naphtha (C5-85°C)": 0.0585,
    "Heavy Naphtha (85-140°C)": 0.0975,
    "ATF / Kerosene (140-240°C)": 0.1489,
    "High Speed Diesel (240-370°C)": 0.2703,
    "Atmospheric Residue (370°C+)": 0.3981
}

print("=" * 56)
print("  MRPL CDU-2 CRUDE ASSAY & CUT FRACTIONS")
print("=" * 56)
for frac, yield_pct in cut_yields.items():
    bpd = yield_pct * crude_flow_bpd
    print(f"  {frac:<32} : {yield_pct*100:6.2f} %  ({bpd:8.0f} BPD)")
print("=" * 56)
print(f"  Coil Outlet Temperature: {cot_temp_c} °C [PASS NORMAL]")
`)
  }

  // Register global shortcuts
  useKeyboard({
    onOpenCommandBar: () => setIsCommandBarOpen(true),
    onOpenSettings: () => handleOpenSettings('general'),
    onToggleSidebar: () => {
      if (window.innerWidth < 1024) {
        setIsMobileSidebarOpen((prev) => !prev)
      } else {
        setIsSidebarCollapsed((prev) => !prev)
      }
    },
    onToggleTheme: () => toggleTheme(),
    onStopGeneration: () => {
      if (isGenerating) {
        stopGeneration()
      }
    },
  })

  return (
    <div className={`flex h-app-screen w-screen overflow-hidden bg-page text-content-primary relative ${fontClass}`}>
      {/* Ambient WebGL Gradient Wave Background — Adaptive Light & Dark Mode */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {!isDark ? (
          /* Light Mode: Luminous Oceanic Wave */
          <div className="absolute inset-0 opacity-30">
            <GradientWave
              key="light-wave"
              isPlaying={true}
              colors={["#38bdf8", "#ffffff", "#818cf8", "#ffffff", "#38bdf8", "#ffffff"]}
              className="w-full h-full"
            />
          </div>
        ) : (
          /* Dark Mode: Sovereign Deep Aurora Wave (Inspired by light mode, aesthetic & premium) */
          <div className="absolute inset-0">
            {/* Liquid Dark Mesh Wave */}
            <div className="absolute inset-0 opacity-35">
              <GradientWave
                key="dark-wave"
                isPlaying={true}
                colors={["#0c1427", "#0284c7", "#1e1035", "#6366f1", "#075985", "#080c16"]}
                className="w-full h-full"
                shadowPower={4}
                darkenTop={true}
              />
            </div>

            {/* Ambient Aurora Blooms for Depth */}
            <div className="absolute -top-32 left-1/3 w-[700px] h-[500px] rounded-full bg-gradient-to-tr from-[#0284c7]/12 via-[#6366f1]/10 to-transparent blur-[140px] pointer-events-none" />
            <div className="absolute bottom-10 right-10 w-[550px] h-[550px] rounded-full bg-[#4338ca]/10 blur-[150px] pointer-events-none" />

            {/* Precision Technical Engineering Dot Grid */}
            <div
              className="absolute inset-0 opacity-[0.035] pointer-events-none"
              style={{
                backgroundImage: `radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)`,
                backgroundSize: '28px 28px',
              }}
            />

            {/* Deep Obsidian Vignette to keep text contrast 100% crisp */}
            <div className="absolute inset-0 bg-gradient-to-t from-page/80 via-transparent to-page/40 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Sidebar Navigation */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobileOpen={isMobileSidebarOpen}
        setIsMobileOpen={setIsMobileSidebarOpen}
        onOpenSettings={handleOpenSettings}
        onOpenCodeRunner={handleOpenCodeRunner}
        onOpenProjects={() => setIsProjectsOpen(true)}
        onOpenArtifacts={() => setIsArtifactsOpen(true)}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative z-10">
        <Header
          isSidebarCollapsed={isSidebarCollapsed}
          isMobileSidebarOpen={isMobileSidebarOpen}
          onToggleSidebar={() => {
            if (window.innerWidth < 1024) {
              setIsMobileSidebarOpen(!isMobileSidebarOpen)
            } else {
              setIsSidebarCollapsed(!isSidebarCollapsed)
            }
          }}
          onNewChat={() => {
            const newId = useChatStore.getState().createChat()
            navigate(`/app/chat/${newId}`)
          }}
        />

        {/* Dynamic Nested Content (Chat or Settings) */}
        <main className="flex-1 flex min-w-0 overflow-hidden relative">
          <Outlet />
        </main>
      </div>

      {/* Projects Modal */}
      <ProjectsModal
        isOpen={isProjectsOpen}
        onClose={() => setIsProjectsOpen(false)}
      />

      {/* Artifacts Modal */}
      <ArtifactsModal
        isOpen={isArtifactsOpen}
        onClose={() => setIsArtifactsOpen(false)}
        onOpenCodeRunner={handleOpenCodeRunner}
      />

      {/* Live Interactive Artifact Side Panel / Viewer */}
      <ArtifactViewer />

      {/* User Settings Modal */}
      <SettingsPage
        isOpen={isSettingsRoute || isSettingsOpen}
        initialTab={settingsTab}
        onClose={handleCloseSettings}
      />

      {/* Code Execution Sandbox Modal */}
      <CodeRunnerModal
        code={codeRunnerSnippet}
        onClose={() => setCodeRunnerSnippet(null)}
      />

      {/* Command Palette Modal */}
      <CommandBar
        isOpen={isCommandBarOpen}
        onClose={() => setIsCommandBarOpen(false)}
      />

      {/* Supabase Authentication & Name Prompt Modals */}
      <NamePromptModal />
      <AuthModal />

      {/* Notification Toast Stack */}
      <ToastContainer />
    </div>
  )
}
