# AIRA (AI Research Assistant) — Deep System Architecture Specification

## 1. Architectural Philosophy: The 4 Sovereign Pillars + Claude-Class Workbench

AIRA is engineered as an on-premise, air-gapped sovereign intelligence platform for mission-critical industrial facilities (Mangalore Refinery & Petrochemicals Ltd). It combines the **cognitive precision and interactive workflow of Claude** with the **deterministic safety protocols and temporal equipment awareness** demanded by process manufacturing.

```
       ┌────────────────────────────────────────────────────────┐
       │                 THE 4 SOVEREIGN PILLARS                 │
       ├──────────────────────────┬─────────────────────────────┤
       │ Dynamic Autonomy Control │  T-KOG (Temporal Knowledge) │
       │ (Risk/Task Sensitivity)  │  (History, Lineage, Delta-t)│
       ├──────────────────────────┼─────────────────────────────┤
       │    Policy Bound Agent    │    Sovereign Agent Fabric   │
       │ (Zero-Trust Sandbox/SQL) │    (MCP / A2A Cluster Swarm)│
       └──────────────────────────┴─────────────────────────────┘
       
       Core Mandate: "AIRA doesn't just understand—it plans, executes, and verifies."
```

---

## 2. Full Horizontal System Architecture Diagram (7 Columns: Left-to-Right)

```mermaid
flowchart LR
    %% =========================================================================
    %% COLUMN 1: CLIENT ACCESS & CLAUDE-CLASS WORKBENCH
    %% =========================================================================
    subgraph COL1["1. Access & Client Workbench"]
        direction TB
        UI_Web["AIRA Web Workbench\n(React 18 + Vite)"]
        UI_Canvas["Interactive Artifact Canvas\n(Monaco / HTML / SVG)"]
        UI_Orbs["Cognitive Telemetry\n(ThinkingOrbs CoT Stream)"]
        RBAC["Sovereign RBAC Auth\n(Zero-Trust Boundary)"]
        
        UI_Web <--> UI_Canvas
        UI_Web --> UI_Orbs
        UI_Web --> RBAC
    end

    %% =========================================================================
    %% COLUMN 2: DYNAMIC AUTONOMY CONTROLLER
    %% =========================================================================
    subgraph COL2["2. Dynamic Autonomy Control"]
        direction TB
        Risk_Class["Risk Classifier\n(Level 1 / 2 / 3)"]
        Budget_Engine["Thinking Token Budgeter\n(Adaptive CoT Depth)"]
        ReAct_Plan["ReAct Agentic Planner\n(Task Decomposition)"]
        Auto_Pipe["Autonomous Pipeline\n(10-Step Ingestion)"]
        User_Mem["Episodic Memory\n(User Habits & Past Edits)"]
        
        Risk_Class --> Budget_Engine --> ReAct_Plan
        Risk_Class --> Auto_Pipe
        User_Mem --> ReAct_Plan
    end

    %% =========================================================================
    %% COLUMN 3: T-KOG & HYBRID KNOWLEDGE CORE
    %% =========================================================================
    subgraph COL3["3. T-KOG & Knowledge Core"]
        direction TB
        Vec_Store[("Dense Vector Store\n(SOPs, Standards)")]
        Plant_Graph[("Plant Knowledge Graph\n(NetworkX Topology)")]
        Doc_Lineage[("Version Lineage\n(OISD / API Supersession)")]
        Delta_T["Delta-t Degradation Engine\n(Corrosion / SLA Drift)"]
        Easy_OCR["Multilingual EasyOCR\n(Hindi & English Text)"]
        
        Easy_OCR --> Vec_Store
        Easy_OCR --> Plant_Graph
        Plant_Graph <--> Delta_T
        Doc_Lineage <--> Vec_Store
    end

    %% =========================================================================
    %% COLUMN 4: SOVEREIGN AGENT FABRIC (MCP / A2A)
    %% =========================================================================
    subgraph COL4["4. Sovereign Agent Fabric"]
        direction TB
        MCP_Host["Native MCP Server\n(JSON-RPC 2.0 Router)"]
        Cluster_LB["Cluster Load Balancer\n(Circuit Breakers)"]
        Node1["Master Orchestrator\n(Laptop 1: Qwen3-8B)"]
        Node2["Vision Specialist\n(Laptop 2: Qwen2.5-VL)"]
        Node3["Coder / Fast QA\n(Laptop 3: Qwen3-4B)"]
        
        MCP_Host <--> Cluster_LB
        Cluster_LB --> Node1
        Cluster_LB --> Node2
        Cluster_LB --> Node3
    end

    %% =========================================================================
    %% COLUMN 5: DUAL VERIFICATION & COUNCIL
    %% =========================================================================
    subgraph COL5["5. Verification & Council"]
        direction TB
        ToT["Tree-of-Thought (ToT)\n(Deterministic Constraints)"]
        Council["Council Consensus Engine\n(Multi-Model Cross-Check)"]
        Safety_OISD["OISD Refinery Guardrails\n(Statutory Policy Filter)"]
        Contradict_Check["Contradiction Firewall\n(Cross-Doc Validation)"]
        
        ToT --> Council --> Safety_OISD
        Contradict_Check --> Safety_OISD
    end

    %% =========================================================================
    %% COLUMN 6: POLICY BOUND SANDBOX RUNTIME
    %% =========================================================================
    subgraph COL6["6. Policy Bound Sandbox"]
        direction TB
        Path_Shield["Path Traversal Shield\n(Workspace Perimeter)"]
        SQL_Guard["Read-Only SQL Guard\n(SELECT Enforcer)"]
        Sandbox_Run["Python Code Sandbox\n(/inputs/ -> /scratch/ -> /outputs/)"]
        OOXML_QA["3-Layer OOXML QA\n(Content, File, Visual)"]
        Audit_DB[("Immutable Audit Trail\n(zingo_audit.db)")]
        
        Path_Shield --> Sandbox_Run
        SQL_Guard --> Sandbox_Run
        Sandbox_Run --> OOXML_QA
    end

    %% =========================================================================
    %% COLUMN 7: ARTIFACT DELIVERY & BEHAVIORAL LOOP
    %% =========================================================================
    subgraph COL7["7. Artifacts & Learning"]
        direction TB
        Stream_Out["KaTeX & Markdown Stream\n(Real-Time SSE)"]
        Deck_Gen["pptxgenjs Deck Compiler\n(16:9 Presentation)"]
        Doc_Exporter["Report Exporter\n(PDF, DOCX, XLSX)"]
        Action_Alerts["Signed Action Notes\n(Engineer Dispatch)"]
        Learn_Engine["Behavioral Learning Loop\n(Diff Promotion >= 3)"]
        
        Action_Alerts --> Learn_Engine
    end

    %% =========================================================================
    %% CROSS-COLUMN CONNECTIONS (FLOWING LEFT-TO-RIGHT)
    %% =========================================================================
    RBAC -->|"User Prompt & Identity"| Risk_Class
    ReAct_Plan <-->|"Hybrid Graph-RAG"| COL3
    ReAct_Plan -->|"Dispatches Approved Calls"| MCP_Host
    
    Node1 & Node2 & Node3 --> ToT
    Delta_T --> Contradict_Check
    
    Safety_OISD --> Sandbox_Run
    Safety_OISD -.->|"Tamper-Proof Audit"| Audit_DB
    
    OOXML_QA --> Deck_Gen
    OOXML_QA --> Doc_Exporter
    Safety_OISD --> Stream_Out
    Safety_OISD --> Action_Alerts
    
    Learn_Engine -.->|"Promoted Prompt Rules"| User_Mem
    Stream_Out -.->|"Token Feed"| UI_Canvas
```

---

## 3. Tiered System Architecture Diagram (7 Horizontal Tiers: Top-to-Bottom)

```mermaid
flowchart TB
    %% TIER 1
    subgraph T1["Tier 1: Sovereign Client Access & Claude-Class Interactive Workbench"]
        direction LR
        W_UI["AIRA Web Workbench (React 18 + Vite)"]
        W_Can["Interactive Artifact Canvas (Monaco / HTML / SVG)"]
        W_Orb["Cognitive Orbital Telemetry (ThinkingOrbs)"]
        W_Auth["Sovereign RBAC & Local Zero-Trust Identity"]
        W_UI <--> W_Can
        W_UI --> W_Orb
        W_UI --> W_Auth
    end

    %% TIER 2
    subgraph T2["Tier 2: Dynamic Autonomy Controller & Cognitive Governor"]
        direction LR
        D_Risk["Risk & Sensitivity Classifier (L1 Assist / L2 Calc / L3 Swarm)"]
        D_Budg["Thinking Token Budgeter (Adaptive CoT)"]
        D_Plan["ReAct Agentic Planner (Task Decomposition)"]
        D_Pipe["Autonomous 10-Step Ingestion Coordinator"]
        D_Mem["Episodic User Memory & Historical Preferences"]
        D_Risk --> D_Budg --> D_Plan
        D_Risk --> D_Pipe
        D_Mem --> D_Plan
    end

    %% TIER 3
    subgraph T3["Tier 3: T-KOG — Temporal Official Knowledge Graph & Hybrid Retrieval"]
        direction LR
        K_Vec[("Dense Vector Store (ChromaDB / SOPs & Standards)")]
        K_Graph[("Plant Topology Graph (NetworkX Equipment Connectivity)")]
        K_Ver[("Document Version Lineage (OISD / API Supersession)")]
        K_Delta["Delta-t Degradation Engine (Corrosion & SLA Drift)"]
        K_OCR["Multilingual EasyOCR Engine (Hindi / English Scans)"]
        K_OCR --> K_Vec
        K_OCR --> K_Graph
        K_Graph <--> K_Delta
        K_Ver <--> K_Vec
    end

    %% TIER 4
    subgraph T4["Tier 4: Sovereign Agent Fabric & Distributed GPU Cluster (MCP / A2A)"]
        direction LR
        F_MCP["Native MCP JSON-RPC 2.0 Host (Tool Discovery & Execution)"]
        F_LB["Cluster Load Balancer & Tunnel Router (Circuit Breakers)"]
        F_N1["Master Node 1: Qwen3-8B (Reasoning & Orchestration)"]
        F_N2["Vision Node 2: Qwen2.5-VL (P&IDs & Blueprints)"]
        F_N3["Coder Node 3: Qwen3-4B / Qwen2.5-Coder (Math & Scripts)"]
        F_MCP <--> F_LB
        F_LB --> F_N1
        F_LB --> F_N2
        F_LB --> F_N3
    end

    %% TIER 5
    subgraph T5["Tier 5: Dual Verification & Multi-Model Council Layer"]
        direction LR
        V_ToT["Tree-of-Thought (ToT) Verifier (Deterministic Constraints)"]
        V_Coun["Council Consensus Engine (Multi-Model Cross-Check)"]
        V_Safe["OISD Refinery Guardrails (Statutory Safety Filter)"]
        V_Contra["Contradiction Firewall (Historical Cross-Doc Scan)"]
        V_ToT --> V_Coun --> V_Safe
        V_Contra --> V_Safe
    end

    %% TIER 6
    subgraph T6["Tier 6: Policy Bound Agent & Zero-Trust Sandbox Runtime"]
        direction LR
        S_Path["Path Traversal Defense (Workspace Shield)"]
        S_SQL["Read-Only SQL Guard (SELECT Enforcer)"]
        S_Run["Sandboxed Python/Bash Runtime (/inputs/ -> /scratch/ -> /outputs/)"]
        S_QA["3-Layer OOXML Deliverable QA (Content, File, Visual)"]
        S_Aud[("Immutable Audit Trail (zingo_audit.db / Hashes)")]
        S_Path --> S_Run
        S_SQL --> S_Run
        S_Run --> S_QA
    end

    %% TIER 7
    subgraph T7["Tier 7: Claude-Style Artifact Delivery & Behavioral Learning Loop"]
        direction LR
        O_Stream["Live Streamed KaTeX & Markdown (SSE Telemetry)"]
        O_Deck["Presentation Engine (pptxgenjs 16:9 Compiler)"]
        O_Doc["Artifact Exporter (Production .docx, .xlsx, .pdf)"]
        O_Note["Signed Action Notes (Role Dispatch & Work Orders)"]
        O_Learn["Behavioral Learning Engine (Diff Promotion >= 3)"]
        O_Note --> O_Learn
    end

    %% INTER-TIER FLOWS
    W_Auth -->|"Governed Query"| D_Risk
    D_Plan <-->|"Hybrid Graph-RAG Retrieval"| T3
    D_Plan -->|"Approved Tool Invocations"| F_MCP
    F_N1 & F_N2 & F_N3 --> V_ToT
    K_Delta --> V_Contra
    V_Safe --> S_Run
    V_Safe -.->|"Tamper-Proof Audit Logging"| S_Aud
    S_QA --> O_Deck
    S_QA --> O_Doc
    V_Safe --> O_Stream
    V_Safe --> O_Note
    O_Learn -.->|"Promoted Statutory Preferences"| D_Mem
    O_Stream -.->|"Real-Time Token Stream"| W_Can
```

---

## 4. Deep Layer-by-Layer Technical Specification

### Layer 1: Sovereign Client Access & Claude-Class Interactive Workbench
* **Workbench UI (`/aira`)**: Built on React 18, Vite 6, Tailwind CSS, and Framer Motion. Designed with an ultra-clean, Claude-inspired typographic hierarchy (Newsreader serif headers + Plus Jakarta Sans body) to minimize cognitive fatigue during complex engineering shifts.
* **Interactive Artifact Canvas**: A dedicated split-pane canvas allowing real-time viewing and interaction with code, reports, slide decks, and data sheets without losing chat context.
* **Monaco / Prism Code Editor**: Live syntax highlighting, in-canvas execution, and diff viewing for Python scripts, thermodynamic calculations, and configuration files.
* **Cognitive Orbital Telemetry (`ThinkingOrbs`)**: Multi-phase visual telemetry that displays the internal cognitive state as live tokens stream:
  1. `Classifying Intent & Risk`
  2. `Traversing T-KOG & Standards`
  3. `Executing Sandboxed Calculation`
  4. `Council Consensus Cross-Check`
  5. `Synthesizing Verified Response`
* **Sovereign RBAC**: Zero external OAuth dependencies. Authenticates locally using signed JWT tokens mapped to plant roles (*Field Operator, Static Equipment Engineer, Rotating Specialist, Process Safety Lead, Chief Refinery Engineer*).

---

### Layer 2: Dynamic Autonomy Controller & Cognitive Governor
* **Risk & Task Sensitivity Classifier (`subagent_engine.py`)**:
  * **Level 1 (Assisted Lookup)**: Routine queries, glossary definitions, single-document summarization. Handled on a single model node with tight token budgets and zero subagent dispatches.
  * **Level 2 (Analytical Calculation)**: Unit conversions, steam table interpolations, pressure vessel thickness verification. Triggers sandboxed code execution and Hybrid RAG retrieval.
  * **Level 3 (Autonomous Swarm)**: High-consequence engineering challenges (Root Cause Failure Analysis, Tube Ruptures, High Temperature Hydrogen Attack [HTHA], HAZOP / SIL reviews, Overpressure Relief Sizing). AIRA elevates autonomy, decomposing the problem and dispatching parallel specialist nodes.
* **Thinking Token Budgeter**: Dynamically scales Chain-of-Thought (CoT) tokens from 1,024 to 8,192 based on query complexity.
* **Autonomous 10-Step Pipeline (`autonomous_pipeline.py`)**:
  Event-driven background pipeline triggered upon document upload:
  `Ingest` $\to$ `Tag Match` $\to$ `History Retrieval` $\to$ `Pattern Analysis` $\to$ `Action Note Auto-Draft` $\to$ `SOP Trigger Evaluation` $\to$ `Contradiction Detection` $\to$ `Role Alert Dispatch` $\to$ `Audit Trail Log` $\to$ `Plant Health Map Update`.
* **Long-Term Episodic Memory**: Persists user context, preferred units (SI metric vs Imperial), and plant unit assignments across sessions.

---

### Layer 3: T-KOG — Temporal Official Knowledge Graph & Hybrid RAG
* **Topological Equipment Graph (`plant_graph.gpickle`)**: NetworkX directed graph modeling physical plant equipment, piping connections, flow directions, and unit dependencies (e.g., *Atmospheric Distillation Unit (ADU) $\to$ Vacuum Column $\to$ Heat Exchanger Network*).
* **Dense Vector Store (ChromaDB)**: 100% on-premise embeddings of MRPL operating manuals, maintenance histories, and statutory standards.
* **Version & Supersession Lineage**: Tracks historical versions of standards and SOPs (e.g., identifying when OISD-130 v2.0 was superseded by v2.1) to guarantee that recommendations are grounded in active regulatory frameworks.
* **Delta-t ($\Delta t$) Degradation Engine (`temporal_reasoning.py`)**:
  * Tracks degradation across consecutive inspection dates (e.g., wall thickness measurements from 2022 $\to$ 2024 $\to$ 2026).
  * Automatically calculates thinning rate ($\text{mm/year}$) against statutory retirement thickness ($t_{\text{retire}} = 5.0\,\text{mm}$).
  * Triggers automated SLA escalation (Level 1 $\to$ Level 2 $\to$ Level 3) when unacted inspection flags exceed statutory response windows.
* **Multilingual EasyOCR**: Extracts structured English and Hindi text from physical plant scan sheets, logs, and vendor P&IDs.

---

### Layer 4: Sovereign Agent Fabric & Distributed GPU Cluster (MCP / A2A)
* **Model Context Protocol (MCP JSON-RPC 2.0 Server)**:
  * Implements the standardized MCP protocol (`/api/mcp/jsonrpc`).
  * Supports `initialize`, `tools/list`, and `tools/call`.
  * Enables internal subagents and external clients (Claude Desktop, Cursor) to dynamically discover and invoke tools without system re-architecting.
* **Cluster Load Balancer & Tunnel Router (`server.py`)**:
  * Real-time VRAM and stream tracking across three on-premise hardware nodes.
  * Pre-flight circuit breakers: probes remote node health with 30s TTL caching. If a node disconnects, AIRA falls back instantaneously to local nodes with zero UI hang.
* **Distributed Node Specialization**:
  * **Master Orchestrator (Laptop 1 - `qwen3:8b`)**: High-depth reasoning, ReAct planning, cross-domain synthesis.
  * **Vision Specialist (Laptop 2 - `qwen2.5-vl:3b`)**: P&ID blueprint analysis, corrosion visual grading, mechanical schematics.
  * **Coder / Fast QA (Laptop 3 - `qwen3:4b` / `qwen2.5-coder`)**: High-speed mathematical proofs, Python script compilation, fast conversational Q&A.

---

### Layer 5: Dual Verification & Multi-Model Council Layer
* **Tree-of-Thought (ToT) Verifier (`tot_verifier.py`)**:
  * Evaluates reasoning branches against deterministic test specifications.
  * Formulates falsification hypotheses before committing to a final engineering recommendation.
* **Council Consensus Engine (`council_engine.py`)**:
  * For safety-critical queries, dispatches the prompt to two independent model architectures simultaneously.
  * Cross-examines outputs: if discrepancies exist regarding design pressures, temperature thresholds, or metallurgy, the Council flags the conflict for human engineer signoff.
* **OISD / API Statutory Guardrails**:
  * Enforces compliance with OISD-STD-128, OISD-STD-129, OISD-130, API 510, API 570, and ASME Section VIII Division 1.
* **Contradiction Firewall**:
  * Detects when a newly uploaded document contradicts historical baseline measurements or active plant operating parameters.

---

### Layer 6: Policy Bound Agent & Zero-Trust Sandbox Runtime
* **Path Traversal Defense (`_safe_resolve_path`)**:
  * Restricts all filesystem access strictly to the sovereign workspace root. Any attempt to traverse (`../`) triggers an immediate `PermissionError`.
* **Read-Only SQL Enforcer (`execute_sqlite_query`)**:
  * Rejects all non-`SELECT` statements. Prevents SQL injection or accidental data corruption by LLM agents.
* **Three-Chamber Sandbox File Runtime (`/api/sandbox`)**:
  * `/inputs/`: Read-only mount of user files and plant data.
  * `/scratch/`: Ephemeral isolated execution directory where Python/Bash scripts run.
  * `/outputs/`: Promoted deliverables folder. Files are only moved here after passing automated QA validation.
* **3-Layer OOXML Deliverable QA Pipeline (`routers/sandbox.py`)**:
  1. *Layer 1 (Content QA)*: Scans for unexpanded template tokens (`[Insert Date]`, `Lorem ipsum`, `NaN`, `undefined`).
  2. *Layer 2 (File QA)*: Unpacks ZIP archive, verifies mandatory OPC relationships, validates XML syntax, and strips illegal raw `#` hex color prefixes that corrupt Microsoft PowerPoint.
  3. *Layer 3 (Visual QA)*: Enforces 16:9 widescreen coordinate geometry, margins, and canvas overflow boundaries.
* **Immutable Audit Trail (`zingo_audit.db`)**:
  * Append-only SQLite store recording every user query, tool execution, model timestamp, and engineer signoff with SHA-256 integrity hashes.

---

### Layer 7: Claude-Style Artifact Delivery & Behavioral Learning Loop
* **Real-Time KaTeX & Markdown Stream**:
  * Renders complex fluid dynamics, thermodynamic balances, and metallurgical stress equations natively in the browser via Server-Sent Events (SSE).
* **Automated Presentation Engine (`presentation_engine.py`)**:
  * Two-model collaborative generation: Researcher Node extracts domain insights; Compiler Node compiles them into production-ready `.pptx` decks via `pptxgenjs`.
* **Multi-Format Artifact Exporters**:
  * One-click generation of `.docx` executive briefings, `.xlsx` datasheets, and print-ready signed `.pdf` reports.
* **Signed Action Notes**:
  * Directly converts identified anomalies into formatted plant work orders complete with statutory citations, recommended actions, and digital signoff blocks.
* **Behavioral Learning Engine (`behavior_learning.py`)**:
  * Tracks text diffs when senior engineers edit AI-generated action notes before signing.
  * Extracts recurring statutory clauses, vendor criteria, and safety margin adjustments.
  * When a pattern is edited $\ge 3$ times, it is automatically promoted to an **Active System Rule** injected into future prompt contexts—enabling continuous learning without model fine-tuning.

---

## 5. Security & Air-Gap Compliance Checklist

| Requirement | Implementation Mechanism | Verification Status |
|---|---|:---:|
| **Zero External Network Calls** | 100% on-premise Ollama / vLLM local endpoints; zero telemetry. | ✅ Verified |
| **Data Immutability** | SQLite WAL mode with append-only `audit_log` table. | ✅ Verified |
| **Execution Containment** | Ephemeral subprocess sandboxing with 20s timeout and memory limits. | ✅ Verified |
| **Statutory Adherence** | OISD-STD-128/129/130, API 510/570 rules hardcoded in guardrails. | ✅ Verified |
| **Fault Tolerance** | Pre-flight circuit breaker with 30s TTL cache and auto-failover. | ✅ Verified |
| **Model Extensibility** | Native Model Context Protocol (MCP JSON-RPC 2.0). | ✅ Verified |
