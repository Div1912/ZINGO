import React, { useEffect, useMemo, useState } from 'react'
import {
  FileText,
  CheckCircle2,
  Download,
  Search,
  AlertTriangle,
  Clock,
  UserCheck,
  PenTool,
  ChevronRight,
  ShieldCheck,
  X,
  Brain,
  Sparkles,
  History,
  Check,
  RotateCcw,
  Edit3,
  AlertCircle,
  Activity,
  Flame,
  Filter,
  Layers,
} from 'lucide-react'
import { Badge } from '../ui/Badge'
import {
  zingoApi,
  type ActionNote,
  type LearnedPreference,
  type TemporalEvent,
  severityVariant,
} from '../../services/zingoApi'
import { ModulePage, StatCard, EmptyState, formatDateTime } from './shared'
import { useToastStore } from '../../stores/toastStore'

export const ActionNotesPanel: React.FC = () => {
  const { addToast } = useToastStore()

  // Top Tabs
  const [activeTab, setActiveTab] = useState<'notes' | 'learning' | 'temporal'>('notes')

  // Action Notes state
  const [notes, setNotes] = useState<ActionNote[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'APPROVED'>('ALL')
  const [escalationFilter, setEscalationFilter] = useState<'ALL' | 'L1' | 'L2' | 'L3'>('ALL')
  const [selectedNote, setSelectedNote] = useState<ActionNote | null>(null)

  // Pre-sign edit state in Detail Modal
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editAction, setEditAction] = useState('')

  // Sign Modal state
  const [signModalOpen, setSignModalOpen] = useState(false)
  const [signerName, setSignerName] = useState('Chief Inspection Engineer')
  const [signingNotes, setSigningNotes] = useState('Approved for immediate field execution and NDT dispatch.')
  const [submittingSign, setSubmittingSign] = useState(false)

  // Behavioral Learning state
  const [preferences, setPreferences] = useState<LearnedPreference[]>([])
  const [edits, setEdits] = useState<any[]>([])
  const [learningLoading, setLearningLoading] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')

  // Temporal Timeline state
  const [temporalTag, setTemporalTag] = useState('HE-301')
  const [temporalEvents, setTemporalEvents] = useState<TemporalEvent[]>([])
  const [temporalNarrative, setTemporalNarrative] = useState('')
  const [temporalLoading, setTemporalLoading] = useState(false)
  const [auditingEscalation, setAuditingEscalation] = useState(false)

  const fetchNotes = async () => {
    try {
      setLoading(true)
      const res = await zingoApi.actionNotes()
      setNotes(res.action_notes || [])
    } catch {
      addToast({ type: 'error', message: 'Failed to load engineering action notes.' })
    } finally {
      setLoading(false)
    }
  }

  const fetchLearningData = async () => {
    try {
      setLearningLoading(true)
      const [prefRes, editsRes] = await Promise.all([
        zingoApi.learnedPreferences(),
        zingoApi.engineerEdits(),
      ])
      setPreferences(prefRes.preferences || [])
      setEdits(editsRes.edits || [])
    } catch {
      addToast({ type: 'error', message: 'Failed to load learned preferences.' })
    } finally {
      setLearningLoading(false)
    }
  }

  const fetchTemporalData = async (tag: string) => {
    try {
      setTemporalLoading(true)
      const res = await zingoApi.temporalTimeline(tag)
      setTemporalEvents(res.events || [])
      setTemporalNarrative(res.narrative_context || '')
    } catch {
      setTemporalEvents([])
      setTemporalNarrative('')
    } finally {
      setTemporalLoading(false)
    }
  }

  useEffect(() => {
    fetchNotes()
  }, [])

  useEffect(() => {
    if (activeTab === 'learning') {
      fetchLearningData()
    } else if (activeTab === 'temporal') {
      fetchTemporalData(temporalTag)
    }
  }, [activeTab])

  // Sync edit buffer when selected note changes
  useEffect(() => {
    if (selectedNote) {
      setEditTitle(selectedNote.title || '')
      setEditSummary(selectedNote.anomaly_summary || '')
      setEditAction(selectedNote.recommended_action || '')
      setIsEditing(false)
    }
  }, [selectedNote])

  const hasModifications = useMemo(() => {
    if (!selectedNote) return false
    return (
      editTitle.trim() !== (selectedNote.title || '').trim() ||
      editSummary.trim() !== (selectedNote.anomaly_summary || '').trim() ||
      editAction.trim() !== (selectedNote.recommended_action || '').trim()
    )
  }, [selectedNote, editTitle, editSummary, editAction])

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (statusFilter !== 'ALL' && n.status !== statusFilter) return false
      if (escalationFilter === 'L1' && (n.escalation_level || 1) !== 1) return false
      if (escalationFilter === 'L2' && (n.escalation_level || 1) !== 2) return false
      if (escalationFilter === 'L3' && (n.escalation_level || 1) !== 3) return false

      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        n.ref_number.toLowerCase().includes(q) ||
        n.equipment_tag.toLowerCase().includes(q) ||
        n.title.toLowerCase().includes(q) ||
        n.target_role.toLowerCase().includes(q)
      )
    })
  }, [notes, statusFilter, escalationFilter, search])

  const draftCount = useMemo(() => notes.filter((n) => n.status === 'DRAFT').length, [notes])
  const approvedCount = useMemo(() => notes.filter((n) => n.status === 'APPROVED').length, [notes])
  const criticalCount = useMemo(() => notes.filter((n) => n.severity === 'CRITICAL').length, [notes])
  const escalatedCount = useMemo(() => notes.filter((n) => (n.escalation_level || 1) >= 2).length, [notes])

  // Sign Action Note with behavioral learning diffs
  const handleSignNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedNote) return
    try {
      setSubmittingSign(true)
      const payload: {
        approved_by: string
        approval_notes: string
        edited_title?: string
        edited_anomaly_summary?: string
        edited_recommended_action?: string
      } = {
        approved_by: signerName,
        approval_notes: signingNotes,
      }

      if (hasModifications) {
        payload.edited_title = editTitle.trim()
        payload.edited_anomaly_summary = editSummary.trim()
        payload.edited_recommended_action = editAction.trim()
      }

      const updated = await zingoApi.signActionNote(selectedNote.id, payload)
      addToast({
        type: 'success',
        message: hasModifications
          ? `Action Note ${selectedNote.ref_number} signed with custom modifications. AI behavioral model updated!`
          : `Action Note ${selectedNote.ref_number} approved and cryptographically signed!`,
      })
      setSelectedNote(updated)
      setSignModalOpen(false)
      fetchNotes()
      if (activeTab === 'learning') fetchLearningData()
    } catch {
      addToast({ type: 'error', message: 'Could not sign action note.' })
    } finally {
      setSubmittingSign(false)
    }
  }

  // Acknowledge Action Note
  const handleAcknowledge = async (noteId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      const updated = await zingoApi.acknowledgeActionNote(noteId, {
        engineer_id: 'Lead Shift Engineer',
        notes: 'Action noted, inspection crew alerted.',
      })
      addToast({ type: 'success', message: `Action Note acknowledged.` })
      if (selectedNote?.id === noteId) setSelectedNote(updated)
      fetchNotes()
    } catch {
      addToast({ type: 'error', message: 'Failed to acknowledge action note.' })
    }
  }

  // Toggle Learned Preference status
  const handleTogglePreference = async (pref: LearnedPreference) => {
    const nextStatus = pref.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
    try {
      await zingoApi.toggleLearnedPreference(pref.id, nextStatus)
      addToast({
        type: 'info',
        message: `Preference "${pref.title}" marked as ${nextStatus}.`,
      })
      fetchLearningData()
    } catch {
      addToast({ type: 'error', message: 'Failed to toggle preference status.' })
    }
  }

  // Manual Escalation Evaluation
  const handleRunEscalationAudit = async () => {
    if (!temporalTag) return
    try {
      setAuditingEscalation(true)
      const res = await zingoApi.evaluateEscalation(temporalTag)
      if (res.escalations_triggered > 0) {
        addToast({
          type: 'warning',
          message: `Escalation triggered for ${temporalTag}: ${res.escalations_triggered} note(s) escalated to Level 2/3!`,
        })
      } else {
        addToast({
          type: 'info',
          message: `Escalation audit complete: ${temporalTag} within normal temporal aging thresholds.`,
        })
      }
      fetchNotes()
      fetchTemporalData(temporalTag)
    } catch {
      addToast({ type: 'error', message: 'Failed to evaluate temporal escalation.' })
    } finally {
      setAuditingEscalation(false)
    }
  }

  const handleDownloadDocx = (note: ActionNote) => {
    zingoApi.downloadActionNoteDocx(note.id, note.ref_number)
    addToast({ type: 'info', message: `Downloading ${note.ref_number}.docx` })
  }

  // Unique tags for temporal selector
  const availableTags = useMemo(() => {
    const set = new Set<string>(['HE-301', 'V-102', 'E-101', 'P-101A'])
    notes.forEach((n) => {
      if (n.equipment_tag) set.add(n.equipment_tag)
    })
    return Array.from(set)
  }, [notes])

  const filteredPreferences = useMemo(() => {
    if (categoryFilter === 'ALL') return preferences
    return preferences.filter((p) => p.category === categoryFilter)
  }, [preferences, categoryFilter])

  return (
    <ModulePage
      title="Autonomous Engineering Action Notes & Behavioral Learning"
      subtitle="Sovereign action notes drafted automatically upon anomaly detection, with pre-sign behavioral learning and multi-week temporal escalation."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchNotes()
              if (activeTab === 'learning') fetchLearningData()
              if (activeTab === 'temporal') fetchTemporalData(temporalTag)
            }}
            className="btn-glass !py-1.5 !px-3 !text-xs flex items-center gap-1.5"
          >
            <Clock size={13} />
            <span>Refresh</span>
          </button>
        </div>
      }
    >
      {/* Top Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'notes'
              ? 'bg-accent text-accent-text shadow-sm'
              : 'text-content-secondary hover:bg-elevated'
          }`}
        >
          <FileText size={14} />
          <span>Action Notes</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'notes' ? 'bg-black/20 text-white' : 'bg-elevated text-content-tertiary'
            }`}
          >
            {notes.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('learning')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'learning'
              ? 'bg-accent text-accent-text shadow-sm'
              : 'text-content-secondary hover:bg-elevated'
          }`}
        >
          <Brain size={14} />
          <span>Learned Preferences</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'learning' ? 'bg-black/20 text-white' : 'bg-elevated text-content-tertiary'
            }`}
          >
            {preferences.filter((p) => p.status === 'ACTIVE').length} Active
          </span>
        </button>

        <button
          onClick={() => setActiveTab('temporal')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'temporal'
              ? 'bg-accent text-accent-text shadow-sm'
              : 'text-content-secondary hover:bg-elevated'
          }`}
        >
          <Activity size={14} />
          <span>Temporal Escalations</span>
          {escalatedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-danger text-white">
              {escalatedCount} Escalated
            </span>
          )}
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: ACTION NOTES & DIRECTIVES                          */}
      {/* ========================================================= */}
      {activeTab === 'notes' && (
        <div className="space-y-4">
          {/* Stats Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard label="Total Action Notes" value={notes.length} />
            <StatCard label="Pending Sign-off" value={draftCount} />
            <StatCard label="Approved & Signed" value={approvedCount} />
            <StatCard label="Critical Severity" value={criticalCount} />
            <StatCard label="Escalated (L2 / L3)" value={escalatedCount} />
          </div>

          {/* Filter and Search Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-surface border border-border">
            <div className="relative w-full md:w-80">
              <Search size={14} className="absolute left-3 top-2.5 text-content-tertiary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ref, equipment tag, role..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-elevated border border-border focus:border-accent outline-none text-content-primary"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Status Filters */}
              <div className="flex items-center gap-1">
                {(['ALL', 'DRAFT', 'APPROVED'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                      statusFilter === status
                        ? 'bg-accent text-accent-text'
                        : 'bg-elevated hover:bg-surface border border-border text-content-secondary'
                    }`}
                  >
                    {status === 'ALL' ? 'All Status' : status === 'DRAFT' ? 'Pending' : 'Signed'}
                  </button>
                ))}
              </div>

              <span className="text-content-tertiary">|</span>

              {/* Escalation Level Filters */}
              <div className="flex items-center gap-1">
                {(['ALL', 'L1', 'L2', 'L3'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setEscalationFilter(lvl)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                      escalationFilter === lvl
                        ? 'bg-accent text-accent-text'
                        : 'bg-elevated hover:bg-surface border border-border text-content-secondary'
                    }`}
                  >
                    {lvl === 'ALL' ? 'All Levels' : lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Notes List */}
          {loading ? (
            <div className="p-8 text-center text-xs text-content-tertiary">Loading autonomous action notes...</div>
          ) : filteredNotes.length === 0 ? (
            <EmptyState
              icon={<FileText size={24} />}
              title="No action notes found"
              hint={
                search
                  ? 'No action notes match your search filters.'
                  : 'Autonomous action notes will appear here immediately when anomalous documents are ingested.'
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredNotes.map((note) => {
                const isApproved = note.status === 'APPROVED'
                const escalationLvl = note.escalation_level || 1
                const isAcknowledged = !!note.acknowledged_at

                return (
                  <div
                    key={note.id}
                    className={`p-4 rounded-xl border bg-surface hover:border-border-strong transition-all space-y-3 ${
                      escalationLvl === 3
                        ? 'border-danger/60 bg-danger/[0.02]'
                        : escalationLvl === 2
                        ? 'border-warning/50 bg-warning/[0.02]'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-[280px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-accent">
                            {note.ref_number}
                          </span>

                          <Badge variant={severityVariant(note.severity)} size="sm">
                            {note.severity}
                          </Badge>

                          <span className="px-2 py-0.5 rounded bg-elevated border border-border text-[11px] font-mono text-content-primary">
                            {note.equipment_tag}
                          </span>

                          {/* Escalation Level Badge */}
                          {escalationLvl === 3 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-danger/15 text-danger border border-danger/30 animate-pulse">
                              <Flame size={12} />
                              L3 • Plant Head Escalation
                            </span>
                          ) : escalationLvl === 2 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-warning/15 text-warning border border-warning/30">
                              <AlertCircle size={12} />
                              L2 • Urgent Inaction (&gt;3d)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-elevated text-content-tertiary border border-border">
                              L1 • Routine Autonomous Draft
                            </span>
                          )}

                          {/* Approval Status */}
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                              isApproved
                                ? 'bg-success/10 text-success border border-success/20'
                                : 'bg-warning/10 text-warning border border-warning/20'
                            }`}
                          >
                            {isApproved ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
                            {isApproved ? 'APPROVED & SIGNED' : 'PENDING SIGNATURE'}
                          </span>

                          {/* Acknowledged status */}
                          {isAcknowledged ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <Check size={11} />
                              Ack: {note.acknowledged_by}
                            </span>
                          ) : (
                            <button
                              onClick={(e) => handleAcknowledge(note.id, e)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-elevated hover:bg-surface border border-border text-content-secondary hover:text-content-primary"
                              title="Acknowledge receipt of this action note"
                            >
                              <Clock size={11} />
                              <span>Acknowledge</span>
                            </button>
                          )}
                        </div>

                        <h3 className="text-sm font-semibold text-content-primary leading-snug">
                          {note.title}
                        </h3>

                        <p className="text-xs text-content-secondary line-clamp-2">
                          {note.anomaly_summary}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setSelectedNote(note)}
                          className="btn-glass !py-1.5 !px-3 !text-xs flex items-center gap-1.5"
                        >
                          <Edit3 size={12} />
                          <span>Review & Refine</span>
                          <ChevronRight size={13} />
                        </button>
                        <button
                          onClick={() => handleDownloadDocx(note)}
                          className="btn-glass !py-1.5 !px-2.5 !text-xs flex items-center gap-1"
                          title="Download Official Word (.docx) Note"
                        >
                          <Download size={13} />
                          <span className="hidden sm:inline">Word</span>
                        </button>
                        {!isApproved && (
                          <button
                            onClick={() => {
                              setSelectedNote(note)
                              setSignModalOpen(true)
                            }}
                            className="btn-primary !py-1.5 !px-3 !text-xs flex items-center gap-1.5 shadow-sm"
                          >
                            <PenTool size={13} />
                            <span>Sign</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50 text-[11px] text-content-tertiary">
                      <div className="flex items-center gap-3">
                        <span>
                          Target Authority:{' '}
                          <strong className="text-content-secondary font-medium">
                            {note.target_role}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>Created: {formatDateTime(note.created_at)}</span>
                        {note.due_date && (
                          <>
                            <span>•</span>
                            <span className="text-warning font-medium">Due: {note.due_date}</span>
                          </>
                        )}
                      </div>
                      {isApproved && note.signature_hash && (
                        <div className="flex items-center gap-1.5 font-mono text-success">
                          <UserCheck size={12} />
                          <span>Signed by {note.approved_by} (Hash: {note.signature_hash})</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: LEARNED BEHAVIORAL PREFERENCES                     */}
      {/* ========================================================= */}
      {activeTab === 'learning' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
            <div className="flex items-center gap-2 text-accent">
              <Sparkles size={16} />
              <h3 className="text-sm font-bold text-content-primary">
                Continuous Behavioral Learning Engine
              </h3>
            </div>
            <p className="text-xs text-content-secondary leading-relaxed">
              Whenever an engineer edits an AI-generated Action Note before signing, the system captures
              the diff and extracts engineering directives (statutory clauses, safety factors, vendor
              criteria). Patterns observed <strong>3+ times</strong> are automatically promoted to{' '}
              <span className="text-success font-semibold">ACTIVE</span> and injected into all future
              autonomous drafting prompts.
            </p>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Learned Rules" value={preferences.length} />
            <StatCard
              label="Active Prompt Injections"
              value={preferences.filter((p) => p.status === 'ACTIVE').length}
            />
            <StatCard
              label="Provisional (Learning Phase)"
              value={preferences.filter((p) => p.status === 'PROVISIONAL').length}
            />
            <StatCard label="Captured Engineer Diffs" value={edits.length} />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2 p-2 rounded-xl bg-surface border border-border">
            <Filter size={13} className="text-content-tertiary ml-2" />
            <span className="text-xs text-content-tertiary mr-2">Category:</span>
            {['ALL', 'statutory_clause', 'safety_factor', 'vendor_criteria', 'inspection_protocol'].map(
              (cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    categoryFilter === cat
                      ? 'bg-accent text-accent-text'
                      : 'bg-elevated hover:bg-surface border border-border text-content-secondary'
                  }`}
                >
                  {cat === 'ALL'
                    ? 'All Categories'
                    : cat.replace('_', ' ').toUpperCase()}
                </button>
              )
            )}
          </div>

          {/* Preferences Cards */}
          {learningLoading ? (
            <div className="p-8 text-center text-xs text-content-tertiary">Loading learned preferences...</div>
          ) : filteredPreferences.length === 0 ? (
            <EmptyState
              icon={<Brain size={24} />}
              title="No behavioral preferences learned yet"
              hint="Edit any Action Note before signing to teach the AI your organization's custom engineering clauses and safety standards."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredPreferences.map((pref) => {
                const isActive = pref.status === 'ACTIVE'
                return (
                  <div
                    key={pref.id}
                    className={`p-4 rounded-xl border bg-surface space-y-3 transition-all ${
                      isActive ? 'border-accent/40 bg-accent/[0.02]' : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={isActive ? 'success' : 'warning'} size="sm">
                            {pref.status}
                          </Badge>
                          <span className="text-[11px] font-mono uppercase text-content-tertiary px-2 py-0.5 rounded bg-elevated border border-border">
                            {pref.category.replace('_', ' ')}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-content-primary">{pref.title}</h4>
                      </div>

                      <button
                        onClick={() => handleTogglePreference(pref)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
                          isActive
                            ? 'bg-success/15 border-success/30 text-success hover:bg-success/25'
                            : 'bg-elevated border-border text-content-secondary hover:text-content-primary'
                        }`}
                      >
                        {isActive ? 'Active (Prompt Injected)' : 'Disabled / Learning'}
                      </button>
                    </div>

                    <div className="p-3 rounded-lg bg-elevated/70 border border-border/70 text-xs font-mono text-content-secondary leading-relaxed">
                      "{pref.rule_instruction}"
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-content-tertiary pt-2 border-t border-border/50">
                      <span>
                        Evidence: <strong className="text-content-primary font-mono">{pref.evidence_count}x</strong> sign-off edits
                      </span>
                      <span>Confidence: {Math.round(pref.confidence * 100)}%</span>
                      <span>Created: {formatDateTime(pref.created_at)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Edit History Log */}
          {edits.length > 0 && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-content-primary font-bold text-xs">
                <History size={14} />
                <span>Recent Engineer Pre-Sign Modifications (Audit Trail)</span>
              </div>
              <div className="border border-border rounded-xl bg-surface overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-elevated border-b border-border text-content-tertiary">
                    <tr>
                      <th className="p-2.5">Time</th>
                      <th className="p-2.5">Item Ref / Tag</th>
                      <th className="p-2.5">Field Edited</th>
                      <th className="p-2.5">Engineer</th>
                      <th className="p-2.5">Extracted Directives</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {edits.slice(0, 10).map((edit) => (
                      <tr key={edit.id} className="hover:bg-elevated/40">
                        <td className="p-2.5 text-content-tertiary whitespace-nowrap">
                          {formatDateTime(edit.created_at)}
                        </td>
                        <td className="p-2.5 font-mono font-medium text-accent">
                          {edit.equipment_tag || `Item #${edit.item_id}`}
                        </td>
                        <td className="p-2.5 capitalize text-content-secondary">
                          {edit.field_name.replace('_', ' ')}
                        </td>
                        <td className="p-2.5 text-content-primary">{edit.engineer_id}</td>
                        <td className="p-2.5 text-content-secondary text-[11px]">
                          {edit.diff_summary || 'Custom engineering modification'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: TEMPORAL ESCALATIONS & CONTINUITY                  */}
      {/* ========================================================= */}
      {activeTab === 'temporal' && (
        <div className="space-y-4">
          {/* Asset Selector & Audit Trigger */}
          <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-content-primary">Equipment Asset:</span>
                <select
                  value={temporalTag}
                  onChange={(e) => {
                    setTemporalTag(e.target.value)
                    fetchTemporalData(e.target.value)
                  }}
                  className="px-3 py-1.5 text-xs font-mono rounded-lg bg-elevated border border-border text-content-primary outline-none focus:border-accent"
                >
                  {availableTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleRunEscalationAudit}
                disabled={auditingEscalation}
                className="btn-primary !py-1.5 !px-3 !text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Activity size={13} />
                <span>{auditingEscalation ? 'Auditing Aging...' : 'Run Aging Escalation Audit'}</span>
              </button>
            </div>

            <p className="text-xs text-content-secondary leading-relaxed">
              ZINGO tracks equipment degradation continuity across multi-week sessions. If an anomaly is
              left unacted for <strong>&ge; 3 days</strong>, it auto-escalates to Level 2 (Urgent). If
              unacted for <strong>&ge; 7 days</strong> or degradation accelerates, it escalates to Level 3
              directly alerting the Plant Operations Head.
            </p>
          </div>

          {/* Temporal Narrative Context */}
          {temporalNarrative && (
            <div className="p-4 rounded-xl bg-elevated border border-border space-y-2">
              <div className="flex items-center gap-2 text-accent">
                <Layers size={14} />
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  Cross-Session Narrative Synthesis (LLM Context)
                </h4>
              </div>
              <p className="text-xs text-content-secondary whitespace-pre-wrap leading-relaxed">
                {temporalNarrative}
              </p>
            </div>
          )}

          {/* Timeline View */}
          {temporalLoading ? (
            <div className="p-8 text-center text-xs text-content-tertiary">Loading temporal history...</div>
          ) : temporalEvents.length === 0 ? (
            <EmptyState
              icon={<History size={24} />}
              title={`No temporal events recorded for ${temporalTag}`}
              hint="Ingest documents or run scans mentioning this asset to build multi-session continuity."
            />
          ) : (
            <div className="space-y-3 relative pl-6 border-l-2 border-border ml-3 my-4">
              {temporalEvents.map((evt, idx) => (
                <div key={idx} className="relative space-y-1">
                  <div
                    className={`absolute -left-[31px] top-1.5 w-3 h-3 rounded-full border-2 ${
                      evt.type === 'escalation'
                        ? 'bg-danger border-white'
                        : evt.type === 'action_note'
                        ? 'bg-accent border-white'
                        : 'bg-content-tertiary border-white'
                    }`}
                  />
                  <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-content-primary">{evt.title}</span>
                      <span className="text-[11px] text-content-tertiary font-mono">{evt.date}</span>
                    </div>
                    <p className="text-xs text-content-secondary leading-relaxed">{evt.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* DETAIL & PRE-SIGN EDIT MODAL                              */}
      {/* ========================================================= */}
      {selectedNote && !signModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl bg-surface border border-border p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-accent">{selectedNote.ref_number}</span>
                  <Badge variant={severityVariant(selectedNote.severity)} size="sm">
                    {selectedNote.severity}
                  </Badge>
                  <span className="px-2 py-0.5 rounded bg-elevated text-xs font-mono">
                    {selectedNote.equipment_tag}
                  </span>
                  {(selectedNote.escalation_level || 1) >= 2 && (
                    <Badge variant="danger" size="sm">
                      L{selectedNote.escalation_level} Escalated
                    </Badge>
                  )}
                </div>
                <h2 className="text-base font-bold text-content-primary mt-1">{selectedNote.title}</h2>
              </div>
              <button
                onClick={() => setSelectedNote(null)}
                className="btn-icon !w-8 !h-8 text-content-tertiary hover:text-content-primary"
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Metadata */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs p-3 rounded-xl bg-elevated border border-border">
              <div>
                <span className="text-content-tertiary block">Target Role</span>
                <strong className="text-content-primary">{selectedNote.target_role}</strong>
              </div>
              <div>
                <span className="text-content-tertiary block">Status</span>
                <span
                  className={
                    selectedNote.status === 'APPROVED'
                      ? 'text-success font-semibold'
                      : 'text-warning font-semibold'
                  }
                >
                  {selectedNote.status}
                </span>
              </div>
              <div>
                <span className="text-content-tertiary block">Created At</span>
                <span className="text-content-secondary">{formatDateTime(selectedNote.created_at)}</span>
              </div>
              <div>
                <span className="text-content-tertiary block">Signature Hash</span>
                <span className="text-content-secondary font-mono truncate block">
                  {selectedNote.signature_hash || 'UNSIGNED'}
                </span>
              </div>
            </div>

            {/* Pre-Sign Engineer Refine Banner */}
            {selectedNote.status !== 'APPROVED' && (
              <div className="p-3 rounded-xl bg-accent/[0.07] border border-accent/25 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-accent shrink-0" />
                  <div className="text-xs">
                    <strong className="text-content-primary block">
                      Engineer Behavioral Learning Mode
                    </strong>
                    <span className="text-content-secondary">
                      You can edit this note before signing. Your added clauses and safety margins will
                      train the autonomous agent.
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`btn-glass !py-1 !px-3 !text-xs flex items-center gap-1.5 shrink-0 ${
                    isEditing ? 'border-accent text-accent' : ''
                  }`}
                >
                  <Edit3 size={12} />
                  <span>{isEditing ? 'Viewing Edit Mode' : 'Edit Before Signing'}</span>
                </button>
              </div>
            )}

            {/* Editable or Certified Content */}
            <div className="space-y-4 text-xs leading-relaxed text-content-secondary">
              {isEditing ? (
                /* Edit Mode */
                <div className="space-y-4 p-4 rounded-xl bg-elevated border border-border">
                  <div>
                    <label className="block text-content-primary font-semibold mb-1">
                      Action Note Title
                    </label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-border text-content-primary outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-content-primary font-semibold mb-1">
                      Observation Summary
                    </label>
                    <textarea
                      rows={3}
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-border text-content-primary outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-content-primary font-semibold mb-1">
                      Recommended Engineering Action (Add statutory standards, hydrotest factors, vendor specs)
                    </label>
                    <textarea
                      rows={4}
                      value={editAction}
                      onChange={(e) => setEditAction(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-border text-content-primary outline-none focus:border-accent"
                    />
                  </div>

                  {hasModifications && (
                    <div className="flex items-center justify-between text-xs pt-2">
                      <span className="text-accent flex items-center gap-1 font-medium">
                        <Check size={12} /> Modifications staged — will be learned upon sign-off
                      </span>
                      <button
                        onClick={() => {
                          setEditTitle(selectedNote.title || '')
                          setEditSummary(selectedNote.anomaly_summary || '')
                          setEditAction(selectedNote.recommended_action || '')
                        }}
                        className="btn-ghost !py-1 !px-2 !text-xs flex items-center gap-1 text-content-tertiary"
                      >
                        <RotateCcw size={11} />
                        <span>Reset to Original</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Certified View */
                <>
                  <div>
                    <h4 className="text-xs font-bold text-content-primary uppercase tracking-wider mb-1">
                      Observation Summary
                    </h4>
                    <div className="p-3 rounded-lg bg-elevated/70 border border-border/70 whitespace-pre-wrap">
                      {selectedNote.anomaly_summary}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-content-primary uppercase tracking-wider mb-1">
                      Recommended Engineering Action
                    </h4>
                    <div className="p-3 rounded-lg bg-elevated/70 border border-border/70 whitespace-pre-wrap font-sans">
                      {selectedNote.recommended_action}
                    </div>
                  </div>

                  {selectedNote.raw_markdown && (
                    <div>
                      <h4 className="text-xs font-bold text-content-primary uppercase tracking-wider mb-1">
                        Formal Action Note Body
                      </h4>
                      <pre className="p-4 rounded-lg bg-[#0C0C0C] border border-border text-[11.5px] font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap max-h-64">
                        {selectedNote.raw_markdown}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <button
                onClick={() => handleDownloadDocx(selectedNote)}
                className="btn-glass !py-1.5 !px-3 !text-xs flex items-center gap-1.5"
              >
                <Download size={13} />
                <span>Download .docx</span>
              </button>

              <div className="flex items-center gap-2">
                {!selectedNote.acknowledged_at && (
                  <button
                    onClick={() => handleAcknowledge(selectedNote.id)}
                    className="btn-glass !py-1.5 !px-3 !text-xs flex items-center gap-1"
                  >
                    <Check size={12} />
                    <span>Acknowledge</span>
                  </button>
                )}

                <button
                  onClick={() => setSelectedNote(null)}
                  className="btn-ghost !py-1.5 !px-3 !text-xs"
                >
                  Close
                </button>

                {selectedNote.status !== 'APPROVED' && (
                  <button
                    onClick={() => setSignModalOpen(true)}
                    className="btn-primary !py-1.5 !px-3.5 !text-xs flex items-center gap-1.5 shadow-sm"
                  >
                    <PenTool size={13} />
                    <span>
                      {hasModifications ? 'Sign with Modifications' : 'Sign & Approve Note'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SIGN & APPROVE CERTIFICATION MODAL                        */}
      {/* ========================================================= */}
      {signModalOpen && selectedNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
          <form
            onSubmit={handleSignNote}
            className="w-full max-w-md rounded-2xl bg-surface border border-border p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-accent">
                <PenTool size={18} />
                <h3 className="text-sm font-bold text-content-primary">
                  Sign & Approve Action Note
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSignModalOpen(false)}
                className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-content-primary"
              >
                <X size={15} />
              </button>
            </div>

            <p className="text-xs text-content-secondary leading-relaxed">
              Certifying action note{' '}
              <strong className="text-content-primary font-mono">{selectedNote.ref_number}</strong> for
              asset <strong className="text-content-primary">{selectedNote.equipment_tag}</strong>. This
              generates an immutable SHA-256 cryptographic signature in the local audit ledger.
            </p>

            {hasModifications && (
              <div className="p-3 rounded-lg bg-accent/[0.08] border border-accent/25 text-xs text-accent space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Sparkles size={13} />
                  <span>Pre-Sign Behavioral Learning Triggered</span>
                </div>
                <p className="text-[11px] text-content-secondary">
                  Your custom additions in the title, summary, or recommendations will be analyzed for
                  statutory clauses and saved to your project's learned engineering memory.
                </p>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-content-primary font-medium mb-1">
                  Approving Engineer & Designation *
                </label>
                <input
                  type="text"
                  required
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-elevated border border-border text-content-primary outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-content-primary font-medium mb-1">
                  Approval Notes / Operational Directives
                </label>
                <textarea
                  rows={3}
                  value={signingNotes}
                  onChange={(e) => setSigningNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-elevated border border-border text-content-primary outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setSignModalOpen(false)}
                className="btn-ghost !py-1.5 !px-3 !text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingSign}
                className="btn-primary !py-1.5 !px-4 !text-xs flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 size={13} />
                <span>
                  {submittingSign
                    ? 'Generating Signature...'
                    : hasModifications
                    ? 'Confirm Edits & Sign'
                    : 'Confirm Signature & Approve'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </ModulePage>
  )
}
