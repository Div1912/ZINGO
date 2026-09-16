import React from 'react'
import { Modal } from '../ui/Modal'
import { FolderKanban, ArrowUpRight, CheckCircle2, Clock } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import { useChatStore } from '../../stores/chatStore'
import { useNavigate } from 'react-router-dom'

interface ProjectsModalProps {
  isOpen: boolean
  onClose: () => void
}

const REFINERY_PROJECTS = [
  {
    id: 'proj-1',
    title: 'CDU-2 Turnaround & Revamp 2026',
    unit: 'Crude Distillation Unit 2',
    status: 'Active',
    priority: 'High',
    description: 'Column tray overhaul, preheat train descaling, and OISD-105 safety clearance.',
    conversationsCount: 14,
    lastActive: '10m ago',
    tags: ['CDU-2', 'Turnaround', 'Trays'],
  },
  {
    id: 'proj-2',
    title: 'VDU Vacuum Column Yield Optimization',
    unit: 'Vacuum Distillation Unit',
    status: 'Active',
    priority: 'Normal',
    description: 'Heavy vacuum gas oil (HVGO) cut point maximization and ejector steam balancing.',
    conversationsCount: 8,
    lastActive: '2h ago',
    tags: ['VDU', 'HVGO', 'Steam Balance'],
  },
  {
    id: 'proj-3',
    title: 'Refinery-wide OISD PTW Audit',
    unit: 'Safety & Environment',
    status: 'In Review',
    priority: 'Urgent',
    description: 'Hot work permits, LEL gas detector calibrations, and electrical lockout logs.',
    conversationsCount: 6,
    lastActive: '1d ago',
    tags: ['OISD-105', 'PTW', 'Compliance'],
  },
  {
    id: 'proj-4',
    title: 'Furnace E-101 Coil Outlet Temp Balancing',
    unit: 'Fired Heaters',
    status: 'Monitoring',
    priority: 'Normal',
    description: 'Multi-pass coil outlet temperature equalization and coking mitigation.',
    conversationsCount: 5,
    lastActive: '3d ago',
    tags: ['COT', 'Heater', 'Fouling'],
  },
]

export const ProjectsModal: React.FC<ProjectsModalProps> = ({ isOpen, onClose }) => {
  const { addToast } = useToastStore()
  const { createChat } = useChatStore()
  const navigate = useNavigate()

  const handleSelectProject = (project: typeof REFINERY_PROJECTS[0]) => {
    const newChatId = createChat()
    navigate(`/app/chat/${newChatId}`)
    onClose()
    addToast({
      type: 'info',
      title: project.title,
      message: `Switched context to ${project.unit}. Ask any project-specific question.`,
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="MRPL Refinery Projects"
      description="Active engineering workstreams and plant turnaround workspaces"
      maxWidth="xl"
    >
      <div className="space-y-3 pt-1 select-none">
        {REFINERY_PROJECTS.map((project) => (
          <div
            key={project.id}
            onClick={() => handleSelectProject(project)}
            className="group p-4 rounded-xl bg-elevated hover:bg-surface border border-border transition-all cursor-pointer space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center text-content-primary shrink-0">
                  <FolderKanban size={16} />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-content-primary group-hover:text-accent transition-colors flex items-center gap-1.5">
                    <span>{project.title}</span>
                    <ArrowUpRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                  <span className="text-[11px] text-content-tertiary font-mono">
                    {project.unit}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/15 text-success">
                  <CheckCircle2 size={10} />
                  <span>{project.status}</span>
                </span>
              </div>
            </div>

            <p className="text-xs text-content-secondary leading-relaxed">
              {project.description}
            </p>

            <div className="flex items-center justify-between pt-1 text-[11px] text-content-tertiary">
              <div className="flex items-center gap-1.5">
                {project.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded-md bg-surface border border-border text-[10px] font-mono">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Clock size={11} />
                <span>{project.lastActive}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
