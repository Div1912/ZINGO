import React, { useState } from 'react'
import { Modal } from '../ui/Modal'
import {
  FolderKanban,
  Plus,
  ArrowRight,
  FileText,
  Upload,
  Trash2,
  Settings,
  MessageSquare,
  ArrowLeft,
  Search,
  BookOpen,
} from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'
import { useChatStore } from '../../stores/chatStore'
import { useToastStore } from '../../stores/toastStore'
import { useNavigate } from 'react-router-dom'
import type { Project } from '../../types/project'

interface ProjectsModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({ isOpen, onClose }) => {
  const {
    projects,
    activeProjectId,
    createProject,
    updateProject,
    deleteProject,
    setActiveProject,
    addFileToProject,
    removeFileFromProject,
  } = useProjectStore()

  const { createChat, chats } = useChatStore()
  const { addToast } = useToastStore()
  const navigate = useNavigate()

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'files' | 'instructions' | 'chats'>('files')
  const [searchQuery, setSearchQuery] = useState('')

  // Create Project State
  const [isCreating, setIsCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newInstructions, setNewInstructions] = useState('')

  // Selected project object
  const currentProject = projects.find((p) => p.id === (selectedProjectId || activeProjectId))

  const handleStartChatInProject = (project: Project) => {
    setActiveProject(project.id)
    const newChatId = createChat()
    navigate(`/app/chat/${newChatId}`)
    onClose()
    addToast({
      type: 'success',
      title: project.title,
      message: `Project workspace active. Knowledge base & instructions loaded.`,
    })
  }

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return

    const id = createProject({
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      customInstructions: newInstructions.trim() || undefined,
    })

    setIsCreating(false)
    setNewTitle('')
    setNewDesc('')
    setNewInstructions('')
    setSelectedProjectId(id)
    addToast({ type: 'success', message: `Created project "${newTitle.trim()}"` })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !currentProject) return

    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        addFileToProject(currentProject.id, {
          name: file.name,
          size: file.size,
          type: file.type || 'text/plain',
          content: text.slice(0, 100_000), // store up to 100k chars for context
        })
        addToast({ type: 'success', message: `Added ${file.name} to project knowledge` })
      } catch {
        addToast({ type: 'error', message: `Could not read file ${file.name}` })
      }
    }
  }

  // Chats belonging to this project
  const projectChats = currentProject
    ? chats.filter((c) => currentProject.chatIds.includes(c.id) || (c.projectId === currentProject.id))
    : []

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setIsCreating(false)
        setSelectedProjectId(null)
        onClose()
      }}
      title={currentProject ? currentProject.title : 'Project Workspaces'}
      description={
        currentProject
          ? currentProject.description || 'Project memory, knowledge base, and custom instructions'
          : 'Persistent workspaces with shared knowledge and custom instructions across conversations'
      }
      maxWidth="2xl"
    >
      <div className="space-y-4 pt-1 select-none">
        {/* VIEW 1: Create New Project Form */}
        {isCreating ? (
          <form onSubmit={handleCreateProject} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-content-primary mb-1">
                Project Name *
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. CDU-2 Turnaround & Revamp"
                className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-border text-content-primary focus:border-accent outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-content-primary mb-1">
                Description
              </label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Brief objective of this workspace..."
                className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-border text-content-primary focus:border-accent outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-content-primary mb-1">
                Custom Project Instructions (System Prompt)
              </label>
              <textarea
                rows={4}
                value={newInstructions}
                onChange={(e) => setNewInstructions(e.target.value)}
                placeholder="Specific rules, parameters, standards (e.g. OISD, API-510), and constraints every chat in this project should follow..."
                className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-border text-content-primary focus:border-accent outline-none font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="btn-ghost !py-1.5 !px-3 !text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary !py-1.5 !px-3.5 !text-xs flex items-center gap-1.5"
              >
                <Plus size={13} />
                <span>Create Workspace</span>
              </button>
            </div>
          </form>
        ) : currentProject ? (
          /* VIEW 2: Project Detail & Knowledge Workspace */
          <div className="space-y-4">
            {/* Top Back Nav & Quick Launch Bar */}
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/60">
              <button
                type="button"
                onClick={() => setSelectedProjectId(null)}
                className="flex items-center gap-1.5 text-xs text-content-secondary hover:text-content-primary transition"
              >
                <ArrowLeft size={13} />
                <span>All Projects</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStartChatInProject(currentProject)}
                  className="btn-primary !py-1.5 !px-3 !text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <MessageSquare size={13} />
                  <span>Start Chat in Project</span>
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 border-b border-border text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('files')}
                className={`flex items-center gap-1.5 px-3 py-2 font-medium border-b-2 transition ${
                  activeTab === 'files'
                    ? 'border-accent text-content-primary'
                    : 'border-transparent text-content-secondary hover:text-content-primary'
                }`}
              >
                <BookOpen size={13} />
                <span>Project Knowledge ({currentProject.files.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('instructions')}
                className={`flex items-center gap-1.5 px-3 py-2 font-medium border-b-2 transition ${
                  activeTab === 'instructions'
                    ? 'border-accent text-content-primary'
                    : 'border-transparent text-content-secondary hover:text-content-primary'
                }`}
              >
                <Settings size={13} />
                <span>Custom Instructions</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('chats')}
                className={`flex items-center gap-1.5 px-3 py-2 font-medium border-b-2 transition ${
                  activeTab === 'chats'
                    ? 'border-accent text-content-primary'
                    : 'border-transparent text-content-secondary hover:text-content-primary'
                }`}
              >
                <MessageSquare size={13} />
                <span>Conversations ({projectChats.length})</span>
              </button>
            </div>

            {/* Tab 1: Files / Knowledge Base */}
            {activeTab === 'files' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-content-secondary">
                    Files uploaded here provide permanent context for every chat in this project.
                  </span>
                  <label className="btn-glass !py-1 !px-2.5 !text-xs flex items-center gap-1.5 cursor-pointer">
                    <Upload size={12} />
                    <span>Add File</span>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {currentProject.files.map((file) => (
                    <div
                      key={file.id}
                      className="p-3 rounded-xl bg-elevated border border-border flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText size={15} className="text-accent shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-content-primary truncate">
                            {file.name}
                          </p>
                          <p className="text-[11px] text-content-tertiary">
                            {(file.size / 1024).toFixed(1)} KB • Uploaded{' '}
                            {new Date(file.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFileFromProject(currentProject.id, file.id)}
                        className="btn-icon !w-6 !h-6 text-content-tertiary hover:text-danger"
                        title="Remove file"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}

                  {currentProject.files.length === 0 && (
                    <div className="p-8 text-center text-xs text-content-tertiary border border-dashed border-border rounded-xl">
                      <Upload size={20} className="mx-auto mb-2 opacity-50" />
                      <p className="font-medium text-content-secondary">No files in project knowledge base</p>
                      <p className="text-[11px] mt-1">Upload SOPs, engineering reports, or design basis files to ground chats.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Custom Instructions */}
            {activeTab === 'instructions' && (
              <div className="space-y-3">
                <p className="text-xs text-content-secondary">
                  These instructions are automatically sent to the model with every prompt in this project.
                </p>
                <textarea
                  rows={7}
                  value={currentProject.customInstructions || ''}
                  onChange={(e) =>
                    updateProject(currentProject.id, { customInstructions: e.target.value })
                  }
                  placeholder="Set guidelines, operational constraints, preferred formats, or standard references..."
                  className="w-full p-3 text-xs rounded-xl bg-surface border border-border text-content-primary font-mono focus:border-accent outline-none"
                />
              </div>
            )}

            {/* Tab 3: Conversations */}
            {activeTab === 'chats' && (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {projectChats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => {
                      navigate(`/app/chat/${chat.id}`)
                      onClose()
                    }}
                    className="p-3 rounded-xl bg-elevated hover:bg-surface border border-border flex items-center justify-between cursor-pointer transition text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MessageSquare size={14} className="text-content-secondary" />
                      <span className="font-medium text-content-primary truncate">
                        {chat.title}
                      </span>
                    </div>
                    <ArrowRight size={13} className="text-content-tertiary" />
                  </div>
                ))}

                {projectChats.length === 0 && (
                  <div className="p-6 text-center text-xs text-content-tertiary">
                    <p>No conversations started in this project yet.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* VIEW 3: All Projects List */
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-2.5 text-content-tertiary pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-content-primary placeholder-content-tertiary focus:border-accent outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="btn-primary !py-1.5 !px-3 !text-xs flex items-center gap-1.5 shrink-0 shadow-sm"
              >
                <Plus size={13} />
                <span>New Project</span>
              </button>
            </div>

            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {projects
                .filter(
                  (p) =>
                    !searchQuery.trim() ||
                    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
                )
                .map((project) => {
                  const isActive = activeProjectId === project.id

                  return (
                    <div
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`group p-4 rounded-xl border transition-all cursor-pointer space-y-2 ${
                        isActive
                          ? 'bg-accent/10 border-accent/40 shadow-xs'
                          : 'bg-elevated hover:bg-surface border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                              isActive
                                ? 'bg-accent text-white border-accent'
                                : 'bg-surface border-border text-content-primary'
                            }`}
                          >
                            <FolderKanban size={16} />
                          </div>
                          <div>
                            <h3 className="text-xs sm:text-sm font-semibold text-content-primary group-hover:text-accent transition-colors flex items-center gap-1.5">
                              <span>{project.title}</span>
                              {isActive && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-accent/20 text-accent border border-accent/30">
                                  ACTIVE
                                </span>
                              )}
                            </h3>
                            {project.description && (
                              <p className="text-xs text-content-secondary line-clamp-1 mt-0.5">
                                {project.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartChatInProject(project)
                            }}
                            className="btn-glass !py-1 !px-2.5 !text-xs flex items-center gap-1 text-content-primary"
                          >
                            <MessageSquare size={12} />
                            <span>Chat</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (window.confirm(`Delete project "${project.title}"?`)) {
                                deleteProject(project.id)
                                addToast({ type: 'info', message: 'Project removed' })
                              }
                            }}
                            className="btn-icon !w-7 !h-7 text-content-tertiary hover:text-danger hover:bg-danger/10"
                            title="Delete Project"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-content-tertiary pt-1 border-t border-border/40">
                        <div className="flex items-center gap-3">
                          <span>{project.files.length} knowledge files</span>
                          <span>•</span>
                          <span>{project.chatIds.length} chats</span>
                        </div>
                        <span className="text-accent group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                          <span>Open Workspace</span>
                          <ArrowRight size={11} />
                        </span>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
