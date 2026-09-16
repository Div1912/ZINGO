import type { Message, ModelId, Source, TaskType } from '../types'

// MRPL Document Repository Knowledge Base for mock grounding
const MOCK_SOURCES_POOL: Source[] = [
  {
    id: 'src-cdu2-sop',
    title: 'MRPL CDU-2 Standard Operating Procedure Rev 4',
    document: 'MRPL_CDU2_SOP_Rev4.pdf',
    page: 14,
    excerpt: 'Isolation procedure requires confirming all feed valves to CDU-2 are in closed position with double-block-and-bleed verified before hydro-servicing begins.',
    relevanceScore: 0.94,
  },
  {
    id: 'src-oisd-ptw',
    title: 'OISD-105 Work Permit System & Safety Guidelines',
    document: 'MRPL_OISD_PermitToWork_2023.pdf',
    page: 8,
    excerpt: 'Hot work authorization in Phase-1 process area requires continuous LEL monitoring (< 0% detectable) and valid H2S detector certification within 12 hours.',
    relevanceScore: 0.89,
  },
  {
    id: 'src-insp-2023',
    title: 'MRPL Annual Turnaround & Mechanical Inspection Report',
    document: 'MRPL_Annual_Inspection_2023.pdf',
    page: 63,
    excerpt: 'Ultrasonic thickness testing on CDU-2 column transfer line 24"-CR-201 indicated 1.2mm wall thinning near elbow E-4 due to naphthenic acid corrosion.',
    relevanceScore: 0.86,
  },
  {
    id: 'src-equip-reg',
    title: 'MRPL Equipment Registry & Asset Specifications',
    document: 'MRPL_Equipment_Registry.xlsx',
    page: 19,
    excerpt: 'Desalter D-101 dual grid electrostatic unit operating specs: primary voltage 18 kV, maximum water cut 8 vol%, chemical demulsifier dosage 12-18 ppm.',
    relevanceScore: 0.81,
  },
  {
    id: 'src-pid-cdu',
    title: 'Engineering P&ID — CDU Crude Column & Overhead System',
    document: 'MRPL_P&ID_CDU_0201.pdf',
    page: 2,
    excerpt: 'Drawing MRPL-0201-P&ID: Reflux drum D-102 sour water boot drain with automated pneumatic level control valve LV-0210 to Sour Water Stripping (SWS).',
    relevanceScore: 0.78,
  },
]

export function detectTaskType(content: string): TaskType {
  const text = content.toLowerCase()

  const codeKeywords = [
    'code', 'script', 'python', 'bash', 'function', 'def ', 'import ', 'sql',
    'algorithm', 'regex', 'curl', 'api', 'calculator', 'formula', 'yield'
  ]
  const documentKeywords = [
    'sop', 'oisd', 'permit', 'manual', 'procedure', 'cdu', 'vdu', 'valve',
    'safety', 'ptw', 'inspection', 'standard', 'flange', 'iso', 'turnaround'
  ]
  const analysisKeywords = [
    'analyze', 'analysis', 'compare', 'trend', 'summary', 'audit', 'findings',
    'corrosion', 'fouling', 'root cause', 'efficiency', 'loss'
  ]

  if (codeKeywords.some((k) => text.includes(k))) return 'code'
  if (documentKeywords.some((k) => text.includes(k))) return 'document'
  if (analysisKeywords.some((k) => text.includes(k))) return 'analysis'
  return 'general'
}

export async function mockCheckConnection(): Promise<'connected' | 'disconnected'> {
  await new Promise((resolve) => setTimeout(resolve, 1400))
  return Math.random() > 0.15 ? 'connected' : 'disconnected'
}

function generateMockContent(prompt: string, taskType: TaskType): { text: string; sources: Source[] } {
  const lower = prompt.toLowerCase()

  if (taskType === 'code') {
    return {
      text: `### Atmospheric Distillation Optimization Script (MRPL Standards)

Here is a specialized Python automation script using NumPy and Pandas to calculate cut points and monitor furnace coil outlet temperatures (COT) for Mangalore Refinery units:

\`\`\`python
import pandas as pd
import numpy as np

def analyze_furnace_passes(pass_temps: dict, target_cot: float = 365.0, tolerance: float = 3.5):
    """
    Analyzes multi-pass heater balance for MRPL CDU-2 Atmospheric Furnace F-101.
    Alerts on coking risk or heat imbalance across Passes A, B, C, and D.
    """
    df = pd.DataFrame(list(pass_temps.items()), columns=["Pass_ID", "Temp_C"])
    df["Deviation"] = df["Temp_C"] - target_cot
    df["Status"] = np.where(
        np.abs(df["Deviation"]) > tolerance, 
        "ALERT: Re-balance Fuel Gas", 
        "OPTIMAL"
    )
    
    max_delta = df["Temp_C"].max() - df["Temp_C"].min()
    coking_risk = "HIGH" if max_delta > (tolerance * 2) else "NORMAL"
    
    return {
        "summary": df.to_dict(orient="records"),
        "max_pass_delta_c": round(max_delta, 2),
        "overall_health": coking_risk
    }

# Simulating live DCS telemetry from CDU-2
current_telemetry = {
    "Pass_A": 364.8,
    "Pass_B": 368.2,
    "Pass_C": 363.9,
    "Pass_D": 369.4
}

report = analyze_furnace_passes(current_telemetry)
print(f"Max Coil Delta: {report['max_pass_delta_c']} °C | Risk: {report['overall_health']}")
for row in report["summary"]:
    print(f"  {row['Pass_ID']}: {row['Temp_C']}°C -> {row['Status']}")
\`\`\`

#### Key Execution Highlights:
1. **Pass Deviation Check**: Flagging pass variance over $\\pm 3.5^\\circ\\text{C}$ prevents localized hydrocarbon overheating and furnace tube coking.
2. **Local GPU Acceleration**: This script executes in **< 15ms** on the on-premise G15 #2 instance.
3. You can click **Run ›** above to simulate this directly in your sovereign sandbox.`,
      sources: [MOCK_SOURCES_POOL[0], MOCK_SOURCES_POOL[3]],
    }
  }

  if (taskType === 'document' || lower.includes('sop') || lower.includes('permit') || lower.includes('oisd')) {
    return {
      text: `### Verified Procedures — MRPL Operational Protocols

According to the official **MRPL Operations Manual** and **OISD-105** statutory standards:

#### 1. Pre-requisite Safety Verifications
* **Cold & Hot Work Certification**: Class-A permit authorization required by the Area Shift In-charge.
* **Continuous Gas Monitoring**: Atmosphere must be monitored for:
  * **Oxygen**: Between 19.5% and 21.0% volume.
  * **Combustible Gases (LEL)**: 0% LEL prior to hot work ignition.
  * **Hydrogen Sulfide ($H_2S$)**: Strictly < 5 ppm (permissible occupational limit).

#### 2. Mechanical Isolation Matrix
| Line / Equipment | Isolation Type | Blinding Location | Verification Sign-off |
| :--- | :--- | :--- | :--- |
| **CDU-2 Raw Feed Header** | Double Block & Bleed | Blind Flange FB-012 | Shift Engineer |
| **Desalter Mud Wash Line** | Spectacle Blind | Nozzle N-3 | Safety Officer |
| **Sour Off-gas Blowdown** | Locked Closed Valve | Header Manifold M-1 | Operations Lead |

#### 3. Execution & Restoration
* Positive lockout tags (**LOTO**) must remain on primary breakers at the local electrical substation.
* Any unblinding activity requires dual-custody physical inspection before plant re-commissioning.`,
      sources: [MOCK_SOURCES_POOL[0], MOCK_SOURCES_POOL[1], MOCK_SOURCES_POOL[2]],
    }
  }

  // Default / Analysis
  return {
    text: `### MRPL Engineering Assessment & Operational Summary

An analysis of internal operational logs and equipment specifications indicates the following findings:

1. **Process Equilibrium**:
   * Operating parameters for atmospheric distillation are within standard threshold envelopes.
   * Energy intensity index across CDU-2 shows a **1.8% efficiency improvement** following the last turn-around bundle replacement.

2. **Compliance & Integrity**:
   * All piping circuits comply with **OISD-105** and **API 510/570** inspection intervals.
   * Ultrasonic NDT test points on the overhead condenser shell reveal corrosion rates well below the design allowance of 0.12 mm/year.

3. **Recommended Next Actions**:
   * Continue routine chemical desalter dosage optimization.
   * Schedule quarterly thermography audit on high-temperature bypass piping.`,
    sources: [MOCK_SOURCES_POOL[1], MOCK_SOURCES_POOL[2], MOCK_SOURCES_POOL[3], MOCK_SOURCES_POOL[4]],
  }
}

export async function mockStreamResponse(
  messages: Message[],
  taskType: TaskType,
  onChunk: (chunk: string) => void,
  onSources: (sources: Source[]) => void,
  onDone: (meta: { tokensUsed: number; latencyMs: number; modelUsed: ModelId }) => void,
  signal?: AbortSignal
): Promise<void> {
  const startTime = Date.now()
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || ''
  
  const { text, sources } = generateMockContent(lastUserMsg, taskType)
  const modelUsed: ModelId = taskType === 'code' ? 'qwen2.5-coder-7b' : 'qwen2.5-7b'

  // Fire sources right away so the user sees source citations being pulled
  onSources(sources)

  // Split into words while preserving spaces and newlines
  const words = text.split(/(\s+)/)
  let accumulated = ''

  for (let i = 0; i < words.length; i++) {
    if (signal?.aborted) {
      break
    }

    const word = words[i]
    accumulated += word
    onChunk(accumulated)

    // Realistic randomized typing delay (30ms - 80ms)
    // Faster on whitespaces
    const delay = word.trim() === '' ? 15 : Math.floor(Math.random() * 45) + 30
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  const latencyMs = Math.max(850, Date.now() - startTime)
  const tokensUsed = Math.floor(text.length / 3.8) + Math.floor(Math.random() * 25)

  onDone({
    tokensUsed,
    latencyMs,
    modelUsed,
  })
}
