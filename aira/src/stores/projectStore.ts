import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import JSZip from 'jszip'
import type { Project, ProjectFile, VirtualProject, VirtualFile } from '../types/project'

interface ProjectStore {
  projects: Project[]
  activeProjectId: string | null
  virtualProjects: VirtualProject[]
  activeVirtualProjectId: string | null

  // Actions
  createProject: (data: { title: string; description?: string; customInstructions?: string }) => string
  updateProject: (id: string, updates: Partial<Project>) => void
  deleteProject: (id: string) => void
  setActiveProject: (id: string | null) => void
  getActiveProject: () => Project | undefined
  getProject: (id: string) => Project | undefined
  addFileToProject: (projectId: string, file: Omit<ProjectFile, 'id' | 'uploadedAt'>) => void
  removeFileFromProject: (projectId: string, fileId: string) => void
  linkChatToProject: (projectId: string, chatId: string) => void

  // Virtual Project Actions (Interactive Sandbox Workspace)
  isSandboxCanvasOpen: boolean
  openSandboxCanvas: (projectId?: string) => void
  closeSandboxCanvas: () => void
  saveVirtualProject: (vproj: VirtualProject) => string
  updateVirtualFile: (projectId: string, filePath: string, content: string) => void
  addVirtualFile: (projectId: string, file: VirtualFile) => void
  removeVirtualFile: (projectId: string, filePath: string) => void
  getVirtualProject: (id: string) => VirtualProject | undefined
  setActiveVirtualProject: (id: string | null) => void
  deleteVirtualProject: (id: string) => void
  exportProjectAsZip: (projectId: string) => Promise<Blob>
}



const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-cdu2-turnaround',
    title: 'CDU-2 Turnaround & Revamp 2026',
    description: 'Column tray overhaul, preheat train descaling, and OISD-105 safety clearance.',
    customInstructions: `Operating Context: Lead Process Engineer for MRPL CDU-2 Turnaround.
Guidance:
1. Always cite specific equipment tags (e.g. E-101A/B, V-CDU2-041, CBD-2).
2. Operational safety limits: Furnace COT <= 370°C, stripping steam ratio 0.15 kg/kg.
3. Positively isolate tubeside and shellside with physical spectacle slip blinds before offline servicing.
4. Verify hydrocarbon vapors < 0.0% LEL and zero toxic H2S prior to cold work.`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    chatIds: [],
    files: [
      {
        id: 'file-cdu2-basis',
        name: 'CDU2_Process_Design_Basis.txt',
        size: 1420,
        type: 'text/plain',
        uploadedAt: new Date().toISOString(),
        content: `MRPL CDU-2 Design Basis:
- Crude Feed Capacity: 120,000 BPD
- Crude Source: Arab Light (API 33.4, Sulfur 1.78 wt%)
- Furnace Coil Outlet Temp (COT): 368.5 °C Normal, 372.0 °C Maximum
- Flash Zone Pressure: 1.45 kg/cm²g
- Stripping Steam: 4.5 MT/h superheated DM steam at 260 °C
- Overflash Ratio: 2.5 vol% on crude
- Target Residue Cut Temp: 370.0 °C True Boiling Point`,
      },
      {
        id: 'file-e101-specs',
        name: 'E101_Exchanger_Bundle_Specs.txt',
        size: 980,
        type: 'text/plain',
        uploadedAt: new Date().toISOString(),
        content: `Exchanger Train E-101A/B Specifications:
- Type: AES Shell and Tube (Floating Head with Backing Device)
- Shellside Fluid: Reduced Crude Bottoms (Atm Residue) at 345 °C
- Tubeside Fluid: Raw Desalted Crude at 185 °C
- Tube Specs: 19.05 mm OD x 2.11 mm BWG Carbon Steel SA-179 Seamless
- Design Pressure: Shell 28.5 kg/cm²g, Tube 32.0 kg/cm²g
- Cleaning Cycle: Chemical backwash every 90 days, offline hydrojet at 700 bar during turnaround`,
      },
    ],
  },
  {
    id: 'proj-safety-oisd',
    title: 'Refinery Process Safety & OISD Compliance Matrix',
    description: 'Hot/Cold work permit protocols, LEL gas testing, electrical lockout, and statutory audit readiness.',
    customInstructions: `Safety Standard: OISD-105 Work Permit System & OISD-GDN-145 Refinery Integrity.
Guidance:
1. Enforce zero-tolerance compliance.
2. Hot work strictly prohibited without certified calibrated multi-gas detector reading 0.0% LEL and zero H2S.
3. Confined space entry requires continuous oxygen monitoring (19.5% - 22.5% O2) and standby observer.
4. Class-A permit valid for single 8-hour shift only.`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    chatIds: [],
    files: [
      {
        id: 'file-oisd-ptw-summary',
        name: 'OISD_105_Permit_Guidelines.txt',
        size: 1150,
        type: 'text/plain',
        uploadedAt: new Date().toISOString(),
        content: `OISD-105 Permit-to-Work Summary:
1. Cold Work: Any work not involving open flame or heat production (torqueing, scaffolding, visual inspection).
2. Hot Work: Welding, cutting, grinding, or using non-intrinsically-safe electrical equipment in hazardous Zone 1/2.
3. Positive Isolation: Valves alone are NOT acceptable isolation. Spectacle blinds, spade blinds, or physical disconnection required.
4. Gas Testing: Within 30 minutes before work commencement, and at minimum every 4 hours thereafter.`,
      },
    ],
  },
]

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: INITIAL_PROJECTS,
      activeProjectId: null,
      virtualProjects: [],
      activeVirtualProjectId: null,
      isSandboxCanvasOpen: false,

      openSandboxCanvas: (projectId) => {
        set((state) => ({
          isSandboxCanvasOpen: true,
          activeVirtualProjectId: projectId || state.activeVirtualProjectId || (state.virtualProjects[0]?.id ?? null),
        }))
      },

      closeSandboxCanvas: () => {
        set({ isSandboxCanvasOpen: false })
      },

      createProject: ({ title, description, customInstructions }) => {
        const id = 'proj-' + Date.now()
        const now = new Date().toISOString()
        const newProject: Project = {
          id,
          title,
          description,
          customInstructions,
          files: [],
          chatIds: [],
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({
          projects: [newProject, ...state.projects],
          activeProjectId: id,
        }))
        return id
      },

      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
          ),
        }))
      },

      deleteProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }))
      },

      setActiveProject: (id) => {
        set({ activeProjectId: id })
      },

      getActiveProject: () => {
        const { activeProjectId, projects } = get()
        if (!activeProjectId) return undefined
        return projects.find((p) => p.id === activeProjectId)
      },

      getProject: (id) => {
        return get().projects.find((p) => p.id === id)
      },

      addFileToProject: (projectId, fileData) => {
        const id = 'file-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6)
        const newFile: ProjectFile = {
          ...fileData,
          id,
          uploadedAt: new Date().toISOString(),
        }
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  files: [...p.files, newFile],
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        }))
      },

      removeFileFromProject: (projectId, fileId) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  files: p.files.filter((f) => f.id !== fileId),
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        }))
      },

      linkChatToProject: (projectId, chatId) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId && !p.chatIds.includes(chatId)
              ? { ...p, chatIds: [...p.chatIds, chatId], updatedAt: new Date().toISOString() }
              : p
          ),
        }))
      },

      saveVirtualProject: (vproj) => {
        const now = new Date().toISOString()
        set((state) => {
          const exists = state.virtualProjects.some((p) => p.id === vproj.id)
          const updatedVirtual = exists
            ? state.virtualProjects.map((p) =>
                p.id === vproj.id
                  ? { ...p, ...vproj, updatedAt: now, version: (p.version || 1) + 1 }
                  : p
              )
            : [{ ...vproj, createdAt: now, updatedAt: now, version: 1 }, ...state.virtualProjects]

          // Also mirror/link into projects list if not already linked
          const projectTitle = vproj.title || 'Code Workspace Project'
          let updatedProjects = [...state.projects]
          const existingParent = updatedProjects.find((p) => p.id === vproj.id || p.title === projectTitle)
          if (!existingParent) {
            updatedProjects.unshift({
              id: vproj.id,
              title: projectTitle,
              description: vproj.description || `Interactive multi-file sandbox application (${Object.keys(vproj.files).length} files)`,
              files: Object.values(vproj.files).map((f) => ({
                id: f.id,
                name: f.name,
                size: f.size,
                type: f.language === 'html' ? 'text/html' : f.language === 'css' ? 'text/css' : 'text/javascript',
                content: f.content,
                uploadedAt: now,
              })),
              virtualProject: vproj,
              createdAt: now,
              updatedAt: now,
              chatIds: vproj.chatId ? [vproj.chatId] : [],
            })
          } else {
            updatedProjects = updatedProjects.map((p) =>
              p.id === existingParent.id
                ? {
                    ...p,
                    virtualProject: vproj,
                    files: Object.values(vproj.files).map((f) => ({
                      id: f.id,
                      name: f.name,
                      size: f.size,
                      type: f.language === 'html' ? 'text/html' : f.language === 'css' ? 'text/css' : 'text/javascript',
                      content: f.content,
                      uploadedAt: now,
                    })),
                    updatedAt: now,
                  }
                : p
            )
          }

          return {
            virtualProjects: updatedVirtual,
            projects: updatedProjects,
            activeVirtualProjectId: vproj.id,
            activeProjectId: vproj.id,
          }
        })
        return vproj.id
      },

      updateVirtualFile: (projectId, filePath, content) => {
        const now = new Date().toISOString()
        set((state) => ({
          virtualProjects: state.virtualProjects.map((p) => {
            if (p.id !== projectId) return p
            const existingFile = p.files[filePath]
            if (!existingFile) return p
            const updatedFile: VirtualFile = {
              ...existingFile,
              content,
              size: new Blob([content]).size,
              updatedAt: now,
            }
            return {
              ...p,
              files: {
                ...p.files,
                [filePath]: updatedFile,
              },
              updatedAt: now,
            }
          }),
        }))
      },

      addVirtualFile: (projectId, file) => {
        const now = new Date().toISOString()
        set((state) => ({
          virtualProjects: state.virtualProjects.map((p) => {
            if (p.id !== projectId) return p
            return {
              ...p,
              files: {
                ...p.files,
                [file.path]: { ...file, updatedAt: now },
              },
              updatedAt: now,
            }
          }),
        }))
      },

      removeVirtualFile: (projectId, filePath) => {
        const now = new Date().toISOString()
        set((state) => ({
          virtualProjects: state.virtualProjects.map((p) => {
            if (p.id !== projectId) return p
            const nextFiles = { ...p.files }
            delete nextFiles[filePath]
            return {
              ...p,
              files: nextFiles,
              updatedAt: now,
            }
          }),
        }))
      },

      getVirtualProject: (id) => {
        return get().virtualProjects.find((p) => p.id === id)
      },

      setActiveVirtualProject: (id) => {
        set({ activeVirtualProjectId: id })
      },

      deleteVirtualProject: (id) => {
        set((state) => ({
          virtualProjects: state.virtualProjects.filter((p) => p.id !== id),
          activeVirtualProjectId: state.activeVirtualProjectId === id ? null : state.activeVirtualProjectId,
        }))
      },

      exportProjectAsZip: async (projectId) => {
        const project = get().virtualProjects.find((p) => p.id === projectId)
        if (!project) throw new Error(`Project ${projectId} not found`)

        const zip = new JSZip()
        for (const [filePath, file] of Object.entries(project.files)) {
          zip.file(filePath, file.content)
        }

        // Add a clean README.md if missing
        if (!project.files['README.md']) {
          zip.file(
            'README.md',
            `# ${project.title || 'Sandbox Project'}\n\nGenerated with ZINGO Interactive AI Studio.\n\n## Getting Started\nOpen \`${project.entryPoint || 'index.html'}\` in any modern web browser.\n`
          )
        }

        return await zip.generateAsync({ type: 'blob' })
      },
    }),
    {
      name: 'aira-projects-v1',
    }
  )
)

