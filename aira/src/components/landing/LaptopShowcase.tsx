import React, { useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Lock,
  CheckCircle2,
  FileText,
  FileSpreadsheet,
  Layers,
  Database,
  Compass,
  Calculator,
  Search,
  ArrowRight,
  ShieldCheck,
  Boxes,
  FileCheck2,
  Wrench,
  Bot,
  Workflow,
  History,
  Check,
} from 'lucide-react'

// --- Input Data Sources (Left Column) ---
const INPUT_SOURCES = [
  {
    id: 'sop',
    title: 'SOP Manuals',
    ext: 'PDF',
    iconBg: 'from-rose-500 to-red-600',
    icon: FileText,
  },
  {
    id: 'reports',
    title: 'Inspection Reports',
    ext: 'DOCX',
    iconBg: 'from-blue-500 to-blue-600',
    icon: FileText,
  },
  {
    id: 'drawings',
    title: 'Drawings / P&IDs',
    ext: 'DWG',
    iconBg: 'from-sky-400 to-cyan-500',
    icon: Layers,
  },
  {
    id: 'sheets',
    title: 'Spreadsheets',
    ext: 'XLSX',
    iconBg: 'from-emerald-500 to-teal-600',
    icon: FileSpreadsheet,
  },
  {
    id: 'databases',
    title: 'Internal Databases',
    ext: 'SQL',
    iconBg: 'from-indigo-500 to-blue-600',
    icon: Database,
  },
]

// --- Output Deliverables (Right Column) ---
const OUTPUT_DELIVERABLES = [
  {
    id: 'reports-out',
    title: 'Reports & Documents',
    desc: 'Ready-to-use reports, summaries and compliance documents',
    type: 'doc',
  },
  {
    id: 'insights-out',
    title: 'Analysis & Insights',
    desc: 'Extracted information, trend analysis and actionable insights',
    type: 'chart',
  },
  {
    id: 'code-out',
    title: 'Code & Calculations',
    desc: 'Scripts, calculations and model outputs using approved tools',
    type: 'code',
  },
  {
    id: 'drawings-out',
    title: 'Drawings & Visuals',
    desc: 'Annotated drawings and extracted details from P&IDs',
    type: 'drawing',
  },
]

// --- Laptop App Workbench Actions ---
const WORKBENCH_ACTIONS = [
  {
    title: 'Generate Report',
    desc: 'Create reports from inspection data',
    icon: FileText,
    iconColor: 'text-blue-600 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-400',
  },
  {
    title: 'Analyze Drawing',
    desc: 'Extract details from P&IDs and drawings',
    icon: Compass,
    iconColor: 'text-purple-600 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-400',
  },
  {
    title: 'Run Calculation',
    desc: 'Use approved engineering tools',
    icon: Calculator,
    iconColor: 'text-sky-600 bg-sky-50 dark:bg-sky-950/60 dark:text-sky-400',
  },
  {
    title: 'Find Information',
    desc: 'Search across SOPs, standards and records',
    icon: Search,
    iconColor: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-400',
  },
]

// --- Pipeline Stepper Stages ---
const PIPELINE_STAGES = [
  'Understand',
  'Use Right Tools',
  'Process',
  'Verify',
  'Deliver',
]

// --- High-Fidelity Deliverable Preview Thumbnails ---
const DocThumbnail: React.FC = () => (
  <div className="w-13 h-15 sm:w-14 sm:h-16 rounded-md bg-white dark:bg-[#1a1e29] border border-slate-200/90 dark:border-slate-700/80 shadow-xs p-1.5 flex flex-col justify-between shrink-0 overflow-hidden">
    <div className="space-y-1">
      <div className="h-1.5 w-6 bg-red-500/80 rounded-xs" />
      <div className="h-1 w-full bg-slate-300 dark:bg-slate-600 rounded-xs" />
      <div className="h-1 w-4/5 bg-slate-200 dark:bg-slate-700 rounded-xs" />
      <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-xs" />
      <div className="h-1 w-3/5 bg-slate-200 dark:bg-slate-700 rounded-xs" />
    </div>
    <div className="flex items-center justify-between pt-0.5 border-t border-slate-100 dark:border-slate-800">
      <div className="h-0.5 w-4 bg-slate-300 dark:bg-slate-600 rounded-xs" />
      <Check size={8} className="text-emerald-500 stroke-[3]" />
    </div>
  </div>
)

const ChartThumbnail: React.FC = () => (
  <div className="w-13 h-15 sm:w-14 sm:h-16 rounded-md bg-white dark:bg-[#1a1e29] border border-slate-200/90 dark:border-slate-700/80 shadow-xs p-1.5 flex flex-col justify-between shrink-0 overflow-hidden">
    <div className="flex items-center justify-between">
      <div className="h-1 w-5 bg-blue-500 rounded-xs" />
      <span className="text-[7px] font-mono text-emerald-500 font-bold">+24%</span>
    </div>
    <svg className="w-full h-7 overflow-visible" viewBox="0 0 50 24" fill="none">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path
        d="M 2 20 Q 14 16 24 10 T 48 3 L 48 24 L 2 24 Z"
        fill="url(#chartGrad)"
      />
      <path
        d="M 2 20 Q 14 16 24 10 T 48 3"
        stroke="#3b82f6"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="48" cy="3" r="1.5" fill="#3b82f6" />
    </svg>
    <div className="flex gap-0.5 items-end h-2">
      <div className="w-1.5 h-1.5 bg-blue-400 rounded-xs" />
      <div className="w-1.5 h-2 bg-blue-500 rounded-xs" />
      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-xs" />
      <div className="w-1.5 h-2 bg-sky-400 rounded-xs" />
    </div>
  </div>
)

const CodeThumbnail: React.FC = () => (
  <div className="w-13 h-15 sm:w-14 sm:h-16 rounded-md bg-[#131620] border border-slate-800 shadow-xs p-1.5 flex flex-col justify-between shrink-0 overflow-hidden">
    <div className="flex items-center gap-1 pb-1 border-b border-slate-800">
      <div className="w-1 h-1 rounded-full bg-red-500/80" />
      <div className="w-1 h-1 rounded-full bg-amber-500/80" />
      <div className="w-1 h-1 rounded-full bg-emerald-500/80" />
    </div>
    <div className="space-y-1 py-0.5">
      <div className="flex gap-1">
        <div className="h-0.5 w-3 bg-purple-400 rounded-xs" />
        <div className="h-0.5 w-4 bg-sky-300 rounded-xs" />
      </div>
      <div className="flex gap-1 pl-1.5">
        <div className="h-0.5 w-2 bg-emerald-400 rounded-xs" />
        <div className="h-0.5 w-5 bg-amber-300 rounded-xs" />
      </div>
      <div className="flex gap-1 pl-1.5">
        <div className="h-0.5 w-4 bg-sky-400 rounded-xs" />
        <div className="h-0.5 w-2 bg-purple-300 rounded-xs" />
      </div>
      <div className="h-0.5 w-3 bg-emerald-400 rounded-xs" />
    </div>
    <div className="h-0.5 w-6 bg-slate-600 rounded-xs" />
  </div>
)

const DrawingThumbnail: React.FC = () => (
  <div className="w-13 h-15 sm:w-14 sm:h-16 rounded-md bg-[#f8fafc] dark:bg-[#151923] border border-slate-200 dark:border-slate-700/80 shadow-xs p-1 flex flex-col justify-between shrink-0 relative overflow-hidden">
    {/* Blueprint CAD schematic lines */}
    <div
      className="absolute inset-0 opacity-20 dark:opacity-10 pointer-events-none"
      style={{
        backgroundImage: 'radial-gradient(#3b82f6 0.5px, transparent 0.5px)',
        backgroundSize: '4px 4px',
      }}
    />
    <svg className="w-full h-full" viewBox="0 0 48 48" fill="none">
      {/* Vessel / P&ID tank */}
      <rect
        x="6"
        y="12"
        width="16"
        height="24"
        rx="2"
        stroke="#64748b"
        strokeWidth="1"
        strokeDasharray="2 1"
      />
      {/* Piping */}
      <path
        d="M 22 24 L 38 24 L 38 34"
        stroke="#0284c7"
        strokeWidth="1.2"
        fill="none"
      />
      {/* Valve symbol */}
      <polygon points="27,21 33,27 33,21 27,27" fill="#0284c7" />
      {/* Red Callout Inspection Box */}
      <rect
        x="24"
        y="17"
        width="18"
        height="16"
        stroke="#ef4444"
        strokeWidth="1.2"
        fill="rgba(239, 68, 68, 0.12)"
        rx="1"
      />
      <circle cx="33" cy="24" r="1.5" fill="#ef4444" />
    </svg>
  </div>
)

export const LaptopShowcase: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const leftCardRefs = useRef<(HTMLDivElement | null)[]>([])
  const rightCardRefs = useRef<(HTMLDivElement | null)[]>([])
  const leftBadgeRef = useRef<HTMLDivElement>(null)
  const rightBadgeRef = useRef<HTMLDivElement>(null)
  const laptopScreenRef = useRef<HTMLDivElement>(null)

  const [paths, setPaths] = useState<{
    leftCurves: string[]
    leftToLaptop: string
    laptopToRight: string
    rightCurves: string[]
  }>({
    leftCurves: [],
    leftToLaptop: '',
    laptopToRight: '',
    rightCurves: [],
  })

  // Measure and compute responsive curved paths connecting cards to laptop
  useEffect(() => {
    const updateCoordinates = () => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()

      // Left cards right-center points
      const leftCardPoints = leftCardRefs.current.map((card) => {
        if (!card) return null
        const r = card.getBoundingClientRect()
        return {
          x: r.right - containerRect.left,
          y: r.top - containerRect.top + r.height / 2,
        }
      })

      // Left badge connection points
      let leftBadgeLeft = { x: 0, y: 0 }
      let leftBadgeRight = { x: 0, y: 0 }
      if (leftBadgeRef.current) {
        const r = leftBadgeRef.current.getBoundingClientRect()
        leftBadgeLeft = {
          x: r.left - containerRect.left,
          y: r.top - containerRect.top + r.height / 2,
        }
        leftBadgeRight = {
          x: r.right - containerRect.left,
          y: r.top - containerRect.top + r.height / 2,
        }
      }

      // Laptop connection points
      let laptopLeft = { x: 0, y: 0 }
      let laptopRight = { x: 0, y: 0 }
      if (laptopScreenRef.current) {
        const r = laptopScreenRef.current.getBoundingClientRect()
        laptopLeft = {
          x: r.left - containerRect.left,
          y: r.top - containerRect.top + r.height / 2,
        }
        laptopRight = {
          x: r.right - containerRect.left,
          y: r.top - containerRect.top + r.height / 2,
        }
      }

      // Right badge connection points
      let rightBadgeLeft = { x: 0, y: 0 }
      let rightBadgeRight = { x: 0, y: 0 }
      if (rightBadgeRef.current) {
        const r = rightBadgeRef.current.getBoundingClientRect()
        rightBadgeLeft = {
          x: r.left - containerRect.left,
          y: r.top - containerRect.top + r.height / 2,
        }
        rightBadgeRight = {
          x: r.right - containerRect.left,
          y: r.top - containerRect.top + r.height / 2,
        }
      }

      // Right cards left-center points
      const rightCardPoints = rightCardRefs.current.map((card) => {
        if (!card) return null
        const r = card.getBoundingClientRect()
        return {
          x: r.left - containerRect.left,
          y: r.top - containerRect.top + r.height / 2,
        }
      })

      // Build Left Curves (Cards -> Left Badge)
      const newLeftCurves = leftCardPoints
        .filter((pt): pt is { x: number; y: number } => pt !== null)
        .map((pt) => {
          const midX = pt.x + (leftBadgeLeft.x - pt.x) * 0.55
          return `M ${pt.x} ${pt.y} C ${midX} ${pt.y}, ${midX} ${leftBadgeLeft.y}, ${leftBadgeLeft.x} ${leftBadgeLeft.y}`
        })

      // Left Badge -> Laptop Screen
      const newLeftToLaptop =
        leftBadgeRight.x > 0 && laptopLeft.x > 0
          ? `M ${leftBadgeRight.x} ${leftBadgeRight.y} C ${
              (leftBadgeRight.x + laptopLeft.x) / 2
            } ${leftBadgeRight.y}, ${
              (leftBadgeRight.x + laptopLeft.x) / 2
            } ${laptopLeft.y}, ${laptopLeft.x} ${laptopLeft.y}`
          : ''

      // Laptop Screen -> Right Badge
      const newLaptopToRight =
        laptopRight.x > 0 && rightBadgeLeft.x > 0
          ? `M ${laptopRight.x} ${laptopRight.y} C ${
              (laptopRight.x + rightBadgeLeft.x) / 2
            } ${laptopRight.y}, ${
              (laptopRight.x + rightBadgeLeft.x) / 2
            } ${rightBadgeLeft.y}, ${rightBadgeLeft.x} ${rightBadgeLeft.y}`
          : ''

      // Build Right Curves (Right Badge -> Deliverable Cards)
      const newRightCurves = rightCardPoints
        .filter((pt): pt is { x: number; y: number } => pt !== null)
        .map((pt) => {
          const midX = rightBadgeRight.x + (pt.x - rightBadgeRight.x) * 0.45
          return `M ${rightBadgeRight.x} ${rightBadgeRight.y} C ${midX} ${rightBadgeRight.y}, ${midX} ${pt.y}, ${pt.x} ${pt.y}`
        })

      setPaths({
        leftCurves: newLeftCurves,
        leftToLaptop: newLeftToLaptop,
        laptopToRight: newLaptopToRight,
        rightCurves: newRightCurves,
      })
    }

    updateCoordinates()
    const timer = setTimeout(updateCoordinates, 150)
    window.addEventListener('resize', updateCoordinates)
    const observer = new ResizeObserver(updateCoordinates)
    if (containerRef.current) observer.observe(containerRef.current)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateCoordinates)
      observer.disconnect()
    }
  }, [])

  return (
    <div className="w-full max-w-[1360px] mx-auto mt-6 sm:mt-10 px-2 sm:px-4">
      {/* ==================================================================== */}
      {/* DESKTOP ARCHITECTURE FLOW DIAGRAM (MATCHES AIRAAA.PNG DOWN TO PIXEL) */}
      {/* ==================================================================== */}
      <div
        ref={containerRef}
        className="relative hidden lg:flex items-center justify-between min-h-[510px] w-full"
      >
        {/* SVG Dynamic Glowing Connectors Overlay */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          style={{ overflow: 'visible' }}
        >
          <defs>
            {/* Left Cyan/Blue Flow Gradient */}
            <linearGradient id="leftFlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.55" />
              <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.95" />
            </linearGradient>

            {/* Right Emerald/Cyan Flow Gradient */}
            <linearGradient id="rightFlowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.55" />
            </linearGradient>

            {/* Subtle glow filter */}
            <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Left Curves: 5 Input Cards -> Badge */}
          {paths.leftCurves.map((d, i) => (
            <g key={`left-curve-${i}`}>
              <path
                d={d}
                fill="none"
                stroke="url(#leftFlowGrad)"
                strokeWidth="1.8"
                filter="url(#lineGlow)"
                className="opacity-75 dark:opacity-85"
              />
            </g>
          ))}

          {/* Left Badge -> Laptop Screen */}
          {paths.leftToLaptop && (
            <path
              d={paths.leftToLaptop}
              fill="none"
              stroke="url(#leftFlowGrad)"
              strokeWidth="2"
              filter="url(#lineGlow)"
              className="opacity-80 dark:opacity-90"
            />
          )}

          {/* Laptop Screen -> Right Badge */}
          {paths.laptopToRight && (
            <path
              d={paths.laptopToRight}
              fill="none"
              stroke="url(#rightFlowGrad)"
              strokeWidth="2"
              filter="url(#lineGlow)"
              className="opacity-80 dark:opacity-90"
            />
          )}

          {/* Right Curves: Badge -> 4 Deliverable Cards */}
          {paths.rightCurves.map((d, i) => (
            <g key={`right-curve-${i}`}>
              <path
                d={d}
                fill="none"
                stroke="url(#rightFlowGrad)"
                strokeWidth="1.8"
                filter="url(#lineGlow)"
                className="opacity-75 dark:opacity-85"
              />
            </g>
          ))}
        </svg>

        {/* ------------------------------------------------------------------ */}
        {/* COLUMN 1: LEFT INPUT DATA CARDS (5 items)                         */}
        {/* ------------------------------------------------------------------ */}
        <div className="w-[220px] xl:w-[240px] flex flex-col justify-between py-2 space-y-3 z-20 shrink-0">
          {INPUT_SOURCES.map((source, index) => {
            const Icon = source.icon
            return (
              <motion.div
                key={source.id}
                ref={(el) => (leftCardRefs.current[index] = el)}
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 * index }}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-white/95 dark:bg-[#121620]/95 border border-slate-200/90 dark:border-slate-800/90 shadow-sm hover:shadow-md hover:border-blue-400/50 transition-all backdrop-blur-md cursor-default group"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl bg-gradient-to-br ${source.iconBg} flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform`}
                  >
                    <Icon size={16} />
                  </div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 tracking-tight">
                    {source.title}
                  </span>
                </div>
                <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-slate-500 tracking-wider">
                  {source.ext}
                </span>
              </motion.div>
            )
          })}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* LEFT CONNECTOR BADGE: [ 🔒 Your Internal Data ]                    */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex items-center justify-center px-1.5 z-20 shrink-0">
          <motion.div
            ref={leftBadgeRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 dark:bg-[#121620]/95 border border-blue-200 dark:border-blue-900/80 shadow-md shadow-blue-500/10 text-xs font-medium text-blue-700 dark:text-blue-300 backdrop-blur-xl"
          >
            <div className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Lock size={10} className="stroke-[2.5]" />
            </div>
            <span className="font-semibold tracking-tight text-[11px]">
              Your Internal Data
            </span>
          </motion.div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* COLUMN 2: CENTERPIECE APPLE MACBOOK PRO MOCKUP                     */}
        {/* ------------------------------------------------------------------ */}
        <div
          ref={laptopScreenRef}
          className="flex-1 max-w-[620px] xl:max-w-[660px] mx-1.5 z-20 flex flex-col items-center"
        >
          {/* MacBook Pro Display Clamshell Assembly */}
          <div className="w-full bg-[#161820] dark:bg-[#11131a] rounded-t-[24px] p-2 xl:p-2.5 border-[1.5px] border-[#383d4c] dark:border-[#282d3b] ring-1 ring-black/70 shadow-[0_30px_70px_-15px_rgba(0,0,0,0.5)] relative overflow-hidden">
            {/* CNC Machined Outer Bevel Highlight */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

            {/* Subtle Apple Anti-Reflective Glass Reflection Sheen */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-transparent rounded-t-[22px] pointer-events-none z-30" />

            {/* Inner Screen Display (Apple Liquid Retina XDR + AIRA App Workbench) */}
            <div className="w-full bg-white dark:bg-[#0c0e15] rounded-t-[14px] rounded-b-[4px] border border-slate-200/60 dark:border-slate-800/80 overflow-hidden text-left flex flex-col shadow-inner min-h-[315px] xl:min-h-[330px] relative">
              {/* macOS Window Title Bar + Iconic MacBook Pro Camera Notch */}
              <div className="h-8 border-b border-slate-100 dark:border-slate-800/80 px-3 flex items-center justify-between bg-slate-50/90 dark:bg-[#0e1119]/90 relative z-20">
                {/* macOS Traffic Light Buttons + AIRA Wordmark */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] border border-[#e0443e]/60 shadow-2xs" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] border border-[#dea123]/60 shadow-2xs" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f] border border-[#1aab29]/60 shadow-2xs" />
                  </div>
                  <div className="h-3 w-[1px] bg-slate-200 dark:bg-slate-700 hidden sm:block" />
                  <div className="flex items-center gap-1.5">
                    <svg
                      className="w-3.5 h-3.5 text-slate-800 dark:text-slate-200"
                      viewBox="0 0 100 100"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="10"
                    >
                      <polygon points="50,6 90,29 90,75 50,98 10,75 10,29" />
                    </svg>
                    <span className="font-bold text-[11px] tracking-tight text-slate-800 dark:text-slate-200">
                      AIRA
                    </span>
                  </div>
                </div>

                {/* The Iconic MacBook Pro Notch */}
                <div className="absolute left-1/2 -translate-x-1/2 top-0 w-24 h-4 bg-[#0a0a0f] rounded-b-[7px] flex items-center justify-center gap-2 shadow-xs">
                  {/* FaceTime HD Camera Lens */}
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1b1f2e] ring-[0.5px] ring-slate-600 flex items-center justify-center">
                    <div className="w-0.5 h-0.5 rounded-full bg-cyan-400" />
                  </div>
                  {/* Camera Active Green Indicator LED */}
                  <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                </div>

                {/* macOS Right Status Icons + MRPL Badge */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[8.5px] font-mono font-medium text-emerald-700 dark:text-emerald-300">
                      SOVEREIGN
                    </span>
                  </div>
                </div>
              </div>

              {/* Workbench Main Body: Sidebar + Main Area */}
              <div className="flex flex-1 overflow-hidden">
                {/* Mini Left Sidebar */}
                <div className="w-28 xl:w-32 border-r border-slate-100 dark:border-slate-800/80 p-2 bg-slate-50/40 dark:bg-[#0f121a]/40 flex flex-col justify-between shrink-0">
                  <div className="space-y-1">
                    {/* + New Task Button */}
                    <div className="w-full py-1.5 px-2 rounded-md bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white flex items-center justify-between text-[10px] font-medium shadow-xs mb-2 cursor-default">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs leading-none font-bold">+</span>
                        <span>New Task</span>
                      </div>
                      <span className="text-[8px] font-mono opacity-50 px-1 py-0.2 rounded bg-white/15">⌘K</span>
                    </div>

                    {/* Nav List */}
                    {[
                      { icon: FileText, label: 'Documents' },
                      { icon: Wrench, label: 'Tools' },
                      { icon: Bot, label: 'Agents' },
                      { icon: Workflow, label: 'Workflows' },
                      { icon: History, label: 'History' },
                    ].map((nav, idx) => {
                      const NavIcon = nav.icon
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 px-2 py-1 rounded text-[9.5px] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-default transition-colors"
                        >
                          <NavIcon size={11} className="text-slate-400" />
                          <span>{nav.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 p-2.5 xl:p-3 flex flex-col justify-between bg-white dark:bg-[#0c0e15]">
                  {/* Search / Command Prompt Bar */}
                  <div className="w-full rounded-full border border-slate-200/90 dark:border-slate-700/80 px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 shadow-2xs bg-slate-50/50 dark:bg-[#121622]/50">
                    <span className="truncate">Ask AIRA or give a task...</span>
                    <div className="w-5 h-5 rounded-full bg-slate-900 dark:bg-slate-700 flex items-center justify-center text-white shrink-0 shadow-xs">
                      <ArrowRight size={11} />
                    </div>
                  </div>

                  {/* 4 Quick Action Cards Grid */}
                  <div className="grid grid-cols-2 gap-1.5 my-2">
                    {WORKBENCH_ACTIONS.map((action, idx) => {
                      const ActionIcon = action.icon
                      return (
                        <div
                          key={idx}
                          className="p-1.5 xl:p-2 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/30 dark:bg-[#111420]/30 hover:border-blue-300 dark:hover:border-blue-900 transition-colors"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${action.iconColor}`}
                            >
                              <ActionIcon size={11} />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                              {action.title}
                            </span>
                          </div>
                          <p className="text-[8.5px] text-slate-400 dark:text-slate-500 leading-tight line-clamp-1">
                            {action.desc}
                          </p>
                        </div>
                      )
                    })}
                  </div>

                  {/* Bottom Pipeline Stepper (5 Nodes) */}
                  <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="relative flex items-center justify-between px-2">
                      {/* Connecting Line */}
                      <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-[1.5px] bg-blue-500/30 dark:bg-blue-400/20 z-0" />

                      {PIPELINE_STAGES.map((stage, idx) => (
                        <div
                          key={idx}
                          className="relative z-10 flex flex-col items-center gap-1"
                        >
                          <div className="w-2 h-2 rounded-full bg-blue-600 ring-2 ring-blue-100 dark:ring-blue-900/60 shadow-xs" />
                          <span className="text-[8px] xl:text-[8.5px] font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {stage}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* MacBook Pro Display Hinge Clutch Barrel */}
          <div className="w-[96%] h-1.5 bg-gradient-to-r from-[#12141a] via-[#242834] to-[#12141a] border-t border-black/70 rounded-t-[1px]" />

          {/* MacBook Pro Lower Aluminum Unibody Chassis Deck */}
          <div className="w-[104%] h-4 bg-gradient-to-b from-[#e3e7ef] via-[#cbd2de] to-[#9aa3b4] dark:from-[#353b49] dark:via-[#222631] dark:to-[#161820] rounded-b-[14px] border-t border-white/60 dark:border-white/15 shadow-md relative z-10 flex items-start justify-center">
            {/* Precision CNC-Machined Thumb Opening Notch */}
            <div className="w-20 sm:w-24 h-1.5 bg-[#848c9c] dark:bg-[#0c0e14] rounded-b-[6px] shadow-inner mx-auto" />

            {/* Subtle Rubber Non-Slip Feet (Corners) */}
            <div className="absolute left-4 bottom-0 w-6 h-[2px] bg-black/40 rounded-full" />
            <div className="absolute right-4 bottom-0 w-6 h-[2px] bg-black/40 rounded-full" />
          </div>

          {/* Multi-Layered Photorealistic MacBook Ambient Ground Shadow */}
          <div className="w-[94%] h-5 bg-slate-900/25 dark:bg-black/60 blur-xl rounded-full -mt-2.5 pointer-events-none" />
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* RIGHT CONNECTOR BADGE: [ ✔ Production Ready Output ]               */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex items-center justify-center px-1.5 z-20 shrink-0">
          <motion.div
            ref={rightBadgeRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 dark:bg-[#121620]/95 border border-emerald-200 dark:border-emerald-900/80 shadow-md shadow-emerald-500/10 text-xs font-medium text-emerald-700 dark:text-emerald-300 backdrop-blur-xl"
          >
            <div className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={11} className="stroke-[2.5]" />
            </div>
            <span className="font-semibold tracking-tight text-[11px]">
              Production Ready Output
            </span>
          </motion.div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* COLUMN 3: RIGHT DELIVERABLE CARDS (4 items with thumbnails)       */}
        {/* ------------------------------------------------------------------ */}
        <div className="w-[260px] xl:w-[280px] flex flex-col justify-between py-2 space-y-2.5 z-20 shrink-0">
          {OUTPUT_DELIVERABLES.map((item, index) => (
            <motion.div
              key={item.id}
              ref={(el) => (rightCardRefs.current[index] = el)}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 * index }}
              className="flex items-center justify-between p-2.5 rounded-2xl bg-white/95 dark:bg-[#121620]/95 border border-slate-200/90 dark:border-slate-800/90 shadow-sm hover:shadow-md hover:border-emerald-400/50 transition-all backdrop-blur-md cursor-default group"
            >
              <div className="flex-1 pr-2">
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100 tracking-tight">
                  {item.title}
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug line-clamp-2">
                  {item.desc}
                </p>
              </div>

              {/* Vector Preview Thumbnail */}
              {item.type === 'doc' && <DocThumbnail />}
              {item.type === 'chart' && <ChartThumbnail />}
              {item.type === 'code' && <CodeThumbnail />}
              {item.type === 'drawing' && <DrawingThumbnail />}
            </motion.div>
          ))}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MOBILE / TABLET RESPONSIVE FALLBACK (< 1024px)                       */}
      {/* ==================================================================== */}
      <div className="lg:hidden flex flex-col items-center space-y-6">
        {/* Mobile Central MacBook Pro View */}
        <div className="w-full max-w-[500px]">
          <div className="w-full bg-[#161820] dark:bg-[#11131a] rounded-t-[20px] p-2 border-[1.5px] border-[#383d4c] dark:border-[#282d3b] shadow-xl relative overflow-hidden">
            {/* Gloss sheen */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-transparent rounded-t-[18px] pointer-events-none" />

            <div className="w-full bg-white dark:bg-[#0c0e15] rounded-t-[12px] rounded-b-[4px] border border-slate-200/60 dark:border-slate-800/80 p-2.5 text-left relative">
              {/* Traffic lights + Notch */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-2 relative">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-[#ff5f56]" />
                  <div className="w-2 h-2 rounded-full bg-[#ffbd2e]" />
                  <div className="w-2 h-2 rounded-full bg-[#27c93f]" />
                  <span className="font-bold text-[11px] ml-1.5">AIRA</span>
                </div>
                {/* Mobile Camera Notch */}
                <div className="absolute left-1/2 -translate-x-1/2 top-0 w-16 h-3 bg-black rounded-b-md flex items-center justify-center gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-cyan-400" />
                  <div className="w-0.5 h-0.5 rounded-full bg-emerald-400" />
                </div>
                <span className="text-[9px] font-mono text-emerald-500 font-medium">SOVEREIGN</span>
              </div>
              <div className="rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1 text-xs text-slate-400 mb-2.5 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
                <span className="truncate">Ask AIRA or give a task...</span>
                <ArrowRight size={12} />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {WORKBENCH_ACTIONS.map((action, i) => (
                  <div
                    key={i}
                    className="p-1.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-[10px]"
                  >
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{action.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Mobile MacBook Aluminum Base */}
          <div className="w-[103%] -ml-[1.5%] h-3 bg-gradient-to-b from-[#e3e7ef] to-[#9aa3b4] dark:from-[#353b49] dark:to-[#161820] rounded-b-lg flex justify-center">
            <div className="w-14 h-1 bg-[#848c9c] dark:bg-[#0c0e14] rounded-b-xs" />
          </div>
          <div className="w-[90%] h-3 bg-slate-900/20 dark:bg-black/50 blur-md rounded-full -mt-1 mx-auto" />
        </div>

        {/* Mobile Input Data Sources Pills */}
        <div className="w-full">
          <div className="text-center mb-2">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              🔒 Your Internal Data
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {INPUT_SOURCES.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 p-2 rounded-xl bg-white/90 dark:bg-[#121620]/90 border border-slate-200 dark:border-slate-800 text-xs"
              >
                <div
                  className={`w-6 h-6 rounded-lg bg-gradient-to-br ${s.iconBg} flex items-center justify-center text-white text-[10px] shrink-0`}
                >
                  <s.icon size={12} />
                </div>
                <div className="truncate">
                  <div className="font-medium text-[11px] truncate">{s.title}</div>
                  <div className="text-[9px] font-mono text-slate-400">{s.ext}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile Verified Output Deliverables */}
        <div className="w-full">
          <div className="text-center mb-2">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              ✔ Production Ready Output
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {OUTPUT_DELIVERABLES.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-white/90 dark:bg-[#121620]/90 border border-slate-200 dark:border-slate-800"
              >
                <div className="pr-2">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {item.title}
                  </div>
                  <div className="text-[10px] text-slate-400 line-clamp-1">{item.desc}</div>
                </div>
                {item.type === 'doc' && <DocThumbnail />}
                {item.type === 'chart' && <ChartThumbnail />}
                {item.type === 'code' && <CodeThumbnail />}
                {item.type === 'drawing' && <DrawingThumbnail />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* BOTTOM TRUST PILLARS BAR (4 PILLARS MATCHING AIRAAA.PNG)            */}
      {/* ==================================================================== */}
      <div className="w-full max-w-5xl mx-auto mt-12 sm:mt-16 bg-white/80 dark:bg-[#111520]/80 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800/90 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-0">
          {/* Pillar 1: Air-Gapped */}
          <div className="flex items-center gap-3 lg:border-r border-slate-200/80 dark:border-slate-800/80 lg:px-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <Lock size={17} />
            </div>
            <div>
              <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                Air-Gapped
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Runs entirely on MRPL&apos;s infrastructure
              </p>
            </div>
          </div>

          {/* Pillar 2: Policy Bound */}
          <div className="flex items-center gap-3 lg:border-r border-slate-200/80 dark:border-slate-800/80 lg:px-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <ShieldCheck size={17} />
            </div>
            <div>
              <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                Policy Bound
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Follows organizational rules and access control
              </p>
            </div>
          </div>

          {/* Pillar 3: Multi-Agent */}
          <div className="flex items-center gap-3 lg:border-r border-slate-200/80 dark:border-slate-800/80 lg:px-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <Boxes size={17} />
            </div>
            <div>
              <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                Multi-Agent
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Uses the right model and tool for each task
              </p>
            </div>
          </div>

          {/* Pillar 4: Source Verified */}
          <div className="flex items-center gap-3 lg:px-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <FileCheck2 size={17} />
            </div>
            <div>
              <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                Source Verified
              </h5>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Every output is linked to its source
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
