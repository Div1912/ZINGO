import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Artifact, ArtifactType, ArtifactVersion } from '../types/artifact'

interface ArtifactStore {
  artifacts: Artifact[]
  activeArtifactId: string | null
  isViewerOpen: boolean

  // Actions
  addArtifact: (artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt' | 'versions' | 'currentVersionIndex'> & { versions?: ArtifactVersion[]; currentVersionIndex?: number }) => string
  addArtifactVersion: (id: string, newContent: string, title?: string, summary?: string) => void
  setArtifactVersion: (id: string, versionNumber: number) => void
  updateActiveVersionContent: (id: string, newContent: string) => void
  createOrUpdateArtifact: (data: {
    identifier?: string
    title: string
    type: ArtifactType
    language: string
    content: string
    chatId?: string
    summary?: string
  }) => string
  updateArtifact: (id: string, updates: Partial<Artifact>) => void
  deleteArtifact: (id: string) => void
  getArtifact: (id: string) => Artifact | undefined
  openArtifact: (id: string) => void
  closeArtifact: () => void
  bindPlantContext: (id: string, tag: string, context?: any) => void
  saveArtifactState: (id: string, state: any) => void
  openInSandbox: (content: string, language?: string, title?: string) => string
  extractArtifactsFromMessage: (messageContent: string, chatId?: string) => Artifact[]
}

const RAW_INITIAL_ARTIFACTS: Omit<Artifact, 'versions' | 'currentVersionIndex'>[] = [
  {
    id: 'art-cdu2-yield-calc',
    title: 'CDU-2 Cut Yield & Flash Zone Interactive Simulator',
    type: 'html',
    language: 'html',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CDU-2 Cut Yield Simulator</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; }
  </style>
</head>
<body class="bg-[#090D16] text-slate-100 p-4 sm:p-6 min-h-screen">
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="border-b border-slate-800 pb-4 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-violet-400 flex items-center gap-2">
          <svg class="w-5 h-5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          MRPL CDU-2 Column Flash Zone Simulator
        </h1>
        <p class="text-xs text-slate-400 mt-1">Real-time cut balance with crude API gravity and coil outlet temperature (COT)</p>
      </div>
      <span class="px-2.5 py-1 rounded-full text-xs font-mono bg-violet-500/10 text-violet-300 border border-violet-500/20">
        Live Model v4.2
      </span>
    </div>

    <!-- Parameter Inputs -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
        <label class="text-xs font-semibold text-slate-300 flex justify-between">
          <span>Crude Feed Rate</span>
          <span id="rateVal" class="text-violet-400 font-mono">120,000 BPD</span>
        </label>
        <input type="range" id="rateSlider" min="80000" max="150000" step="1000" value="120000" class="w-full accent-violet-500 cursor-pointer">
      </div>

      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
        <label class="text-xs font-semibold text-slate-300 flex justify-between">
          <span>Furnace COT</span>
          <span id="cotVal" class="text-amber-400 font-mono">368.5 °C</span>
        </label>
        <input type="range" id="cotSlider" min="350" max="385" step="0.5" value="368.5" class="w-full accent-amber-500 cursor-pointer">
      </div>

      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
        <label class="text-xs font-semibold text-slate-300 flex justify-between">
          <span>Crude API Gravity</span>
          <span id="apiVal" class="text-emerald-400 font-mono">33.4 °API</span>
        </label>
        <input type="range" id="apiSlider" min="28.0" max="38.0" step="0.1" value="33.4" class="w-full accent-emerald-500 cursor-pointer">
      </div>
    </div>

    <!-- Cut Yield Output Table -->
    <div class="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
      <div class="px-4 py-3 bg-slate-800/60 border-b border-slate-800 flex justify-between items-center text-xs font-semibold text-slate-300">
        <span>Fractionated Product Streams</span>
        <span id="totalBpd" class="font-mono text-violet-400">Total: 120,000 BPD (100.0%)</span>
      </div>
      <div class="divide-y divide-slate-800/60 text-xs" id="cutsTable">
        <!-- populated dynamically -->
      </div>
    </div>

    <!-- Live Yield Distribution Bar -->
    <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
      <h3 class="text-xs font-semibold text-slate-300">Yield Distribution Spectrum</h3>
      <div class="h-6 w-full rounded-lg overflow-hidden flex" id="distBar">
        <!-- populated dynamically -->
      </div>
    </div>
  </div>

  <script>
    const cuts = [
      { name: 'LPG (C3-C4)', basePct: 0.0267, color: 'bg-rose-500', cotSens: 0.0002 },
      { name: 'Light Naphtha (C5-85°C)', basePct: 0.0585, color: 'bg-orange-500', cotSens: 0.0004 },
      { name: 'Heavy Naphtha (85-140°C)', basePct: 0.0975, color: 'bg-amber-500', cotSens: 0.0006 },
      { name: 'ATF / Jet A-1 (140-240°C)', basePct: 0.1489, color: 'bg-emerald-500', cotSens: 0.0005 },
      { name: 'High Speed Diesel (240-370°C)', basePct: 0.2703, color: 'bg-cyan-500', cotSens: -0.0004 },
      { name: 'Atmospheric Residue (370°C+)', basePct: 0.3981, color: 'bg-slate-600', cotSens: -0.0013 }
    ];

    function recalculate() {
      const bpd = parseFloat(document.getElementById('rateSlider').value);
      const cot = parseFloat(document.getElementById('cotSlider').value);
      const api = parseFloat(document.getElementById('apiSlider').value);

      document.getElementById('rateVal').innerText = bpd.toLocaleString() + ' BPD';
      document.getElementById('cotVal').innerText = cot.toFixed(1) + ' °C';
      document.getElementById('apiVal').innerText = api.toFixed(1) + ' °API';

      const cotDelta = cot - 368.5;
      const apiDelta = api - 33.4;

      let adjusted = cuts.map(c => {
        let pct = c.basePct + (c.cotSens * cotDelta) + (c.name.includes('Naphtha') ? apiDelta * 0.003 : -apiDelta * 0.002);
        return { ...c, pct: Math.max(0.005, pct) };
      });

      const sum = adjusted.reduce((acc, c) => acc + c.pct, 0);
      adjusted = adjusted.map(c => ({ ...c, normPct: c.pct / sum }));

      // Render table
      const table = document.getElementById('cutsTable');
      table.innerHTML = adjusted.map(c => {
        const cutBpd = Math.round(bpd * c.normPct);
        const cutMetricTons = Math.round(cutBpd * 0.134);
        return \`
          <div class="px-4 py-2.5 flex items-center justify-between hover:bg-slate-800/30">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-sm \${c.color}"></span>
              <span class="font-medium text-slate-200">\${c.name}</span>
            </div>
            <div class="flex items-center gap-6 font-mono text-slate-300">
              <span>\${(c.normPct * 100).toFixed(2)}%</span>
              <span class="w-24 text-right text-violet-300">\${cutBpd.toLocaleString()} BPD</span>
              <span class="w-24 text-right text-slate-400">\${cutMetricTons.toLocaleString()} MT/d</span>
            </div>
          </div>
        \`;
      }).join('');

      // Render bar
      const bar = document.getElementById('distBar');
      bar.innerHTML = adjusted.map(c => \`
        <div style="width: \${(c.normPct * 100).toFixed(2)}%" class="\${c.color} h-full transition-all duration-200" title="\${c.name}: \${(c.normPct * 100).toFixed(1)}%"></div>
      \`).join('');

      document.getElementById('totalBpd').innerText = 'Total: ' + bpd.toLocaleString() + ' BPD (100.0%)';
    }

    document.getElementById('rateSlider').addEventListener('input', recalculate);
    document.getElementById('cotSlider').addEventListener('input', recalculate);
    document.getElementById('apiSlider').addEventListener('input', recalculate);
    recalculate();
  </script>
</body>
</html>`,
  },
  {
    id: 'art-oisd-ptw-checklist',
    title: 'OISD-105 Work Permit System & Safety Verification Matrix',
    type: 'html',
    language: 'html',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OISD-105 PTW Matrix</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#0b0f19] text-slate-100 p-6 min-h-screen">
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="border-b border-slate-800 pb-3 flex items-center justify-between">
      <div>
        <h1 class="text-lg font-bold text-amber-400 flex items-center gap-2">
          <svg class="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          OISD-105 Hot/Cold Work Permit Clearance
        </h1>
        <p class="text-xs text-slate-400">Standard safety verification protocol before refinery maintenance</p>
      </div>
      <div id="statusBadge" class="px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
        Incomplete (0/5 Cleared)
      </div>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
      <h2 class="text-xs font-semibold text-slate-300 uppercase tracking-wider">Mandatory Verification Checklist</h2>
      <div class="space-y-2.5 text-xs">
        <label class="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800/80 cursor-pointer transition">
          <input type="checkbox" class="chk w-4 h-4 accent-amber-500 rounded">
          <span>1. Combustible gas detector calibration verified & hydrocabon read < 0.0% LEL</span>
        </label>
        <label class="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800/80 cursor-pointer transition">
          <input type="checkbox" class="chk w-4 h-4 accent-amber-500 rounded">
          <span>2. Physical slip blinds installed on suction and discharge lines per blind list</span>
        </label>
        <label class="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800/80 cursor-pointer transition">
          <input type="checkbox" class="chk w-4 h-4 accent-amber-500 rounded">
          <span>3. Electrical lockout/tagout (LOTO) breaker racked out and padlock tag affixed</span>
        </label>
        <label class="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800/80 cursor-pointer transition">
          <input type="checkbox" class="chk w-4 h-4 accent-amber-500 rounded">
          <span>4. Firewater hose charged to 8.5 kg/cm² and positioned within 15 meters</span>
        </label>
        <label class="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800/80 cursor-pointer transition">
          <input type="checkbox" class="chk w-4 h-4 accent-amber-500 rounded">
          <span>5. Joint inspection signed by Operations Shift Engineer & Safety Officer</span>
        </label>
      </div>
    </div>

    <div class="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs">
      <span class="text-slate-400">Permit Validity: Standard 8-Hour Shift (07:00 - 15:00 hrs)</span>
      <button id="authBtn" disabled class="px-4 py-2 rounded-lg font-medium bg-slate-800 text-slate-500 cursor-not-allowed transition">
        Authorize Work Permit
      </button>
    </div>
  </div>

  <script>
    const checks = document.querySelectorAll('.chk');
    const badge = document.getElementById('statusBadge');
    const btn = document.getElementById('authBtn');

    checks.forEach(c => c.addEventListener('change', () => {
      const checked = Array.from(checks).filter(x => x.checked).length;
      if (checked === checks.length) {
        badge.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        badge.innerText = 'Cleared for Work (5/5)';
        btn.disabled = false;
        btn.className = 'px-4 py-2 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-lg shadow-emerald-600/20';
      } else {
        badge.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30';
        badge.innerText = \`Incomplete (\${checked}/5 Cleared)\`;
        btn.disabled = true;
        btn.className = 'px-4 py-2 rounded-lg font-medium bg-slate-800 text-slate-500 cursor-not-allowed';
      }
    }));

    btn.addEventListener('click', () => {
      alert('Class-A Work Permit authorized for plant execution.');
    });
  </script>
</body>
</html>`,
  },
  {
    id: 'art-plant-he301-fouling-calc',
    title: 'HE-301 Fouling Resistance & Thermal Duty Calculator',
    type: 'html',
    language: 'html',
    equipmentTag: 'HE-301',
    isPlantAware: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HE-301 Fouling & Thermal Duty</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body { font-family: ui-sans-serif, system-ui, sans-serif; }</style>
</head>
<body class="bg-[#090D16] text-slate-100 p-4 sm:p-6 min-h-screen">
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="border-b border-slate-800 pb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded text-xs font-mono font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">ASSET: HE-301</span>
          <span class="px-2 py-0.5 rounded text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">TEMA Class R Reboiler</span>
        </div>
        <h1 class="text-xl font-bold text-slate-100 mt-1">HE-301 Thermal Duty & Fouling Resistance Calculation</h1>
        <p class="text-xs text-slate-400 mt-0.5">Pre-populated with real operating parameters and fouling history from plant database.</p>
      </div>
      <button onclick="saveCalculationToPlant()" id="saveBtn" class="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white transition flex items-center gap-1.5 shadow-lg shadow-violet-600/20">
        <span>Save to Equipment Dossier</span>
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
        <label class="text-xs font-semibold text-slate-300 flex justify-between">
          <span>Hot Side Inlet Temp (Th,in)</span>
          <span id="thinVal" class="text-amber-400 font-mono">310.0 °C</span>
        </label>
        <input type="range" id="thinSlider" min="260" max="360" step="1" value="310" class="w-full accent-amber-500 cursor-pointer" oninput="recalc()">
      </div>

      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
        <label class="text-xs font-semibold text-slate-300 flex justify-between">
          <span>Cold Side Inlet Temp (Tc,in)</span>
          <span id="tcinVal" class="text-sky-400 font-mono">165.0 °C</span>
        </label>
        <input type="range" id="tcinSlider" min="120" max="210" step="1" value="165" class="w-full accent-sky-500 cursor-pointer" oninput="recalc()">
      </div>

      <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
        <label class="text-xs font-semibold text-slate-300 flex justify-between">
          <span>Crude Throughput</span>
          <span id="flowVal" class="text-emerald-400 font-mono">320 m³/h</span>
        </label>
        <input type="range" id="flowSlider" min="200" max="450" step="5" value="320" class="w-full accent-emerald-500 cursor-pointer" oninput="recalc()">
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Clean U-Value</span>
        <span class="text-xl font-bold font-mono text-slate-100 mt-1 block">420 W/m²K</span>
        <span class="text-[10px] text-slate-500">Design Clean Baseline</span>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Current U-Value</span>
        <span id="uCurrent" class="text-xl font-bold font-mono text-amber-400 mt-1 block">224 W/m²K</span>
        <span class="text-[10px] text-amber-400/80">46.7% Thermal Drop</span>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Fouling Resistance (Rf)</span>
        <span id="rfVal" class="text-xl font-bold font-mono text-rose-400 mt-1 block">0.00208 m²K/W</span>
        <span class="text-[10px] text-rose-400 font-semibold">Above TEMA Limit (0.0018)</span>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">Effective Duty (Q)</span>
        <span id="qDuty" class="text-xl font-bold font-mono text-violet-300 mt-1 block">9.45 MW</span>
        <span class="text-[10px] text-slate-500">Design 14.2 MW (-33.4%)</span>
      </div>
    </div>

    <div class="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200">
      <strong class="font-semibold text-rose-300">Refinery Recommendation: Hydro-blast Cleaning Due in 12 Days</strong>
      <p class="mt-0.5 leading-relaxed text-slate-300">Fouling growth rate exceeds standard seasonal baseline. Scheduled cleaning window advised.</p>
    </div>
  </div>

  <script>
    const U_CLEAN = 420;
    const AREA = 485;

    function recalc() {
      const thIn = parseFloat(document.getElementById('thinSlider').value);
      const tcIn = parseFloat(document.getElementById('tcinSlider').value);
      const flow = parseFloat(document.getElementById('flowSlider').value);

      document.getElementById('thinVal').innerText = thIn.toFixed(1) + ' °C';
      document.getElementById('tcinVal').innerText = tcIn.toFixed(1) + ' °C';
      document.getElementById('flowVal').innerText = flow.toFixed(0) + ' m³/h';

      const dt1 = thIn - (tcIn + 55);
      const dt2 = (thIn - 65) - tcIn;
      const lmtd = (dt1 - dt2) / Math.log(Math.max(dt1, 1) / Math.max(dt2, 1));
      const uCurrent = Math.max(160, Math.min(380, U_CLEAN * (1 - 0.48 * (flow / 320))));
      const rf = (1 / uCurrent) - (1 / U_CLEAN);
      const qDuty = (uCurrent * AREA * lmtd) / 1e6;

      document.getElementById('uCurrent').innerText = Math.round(uCurrent) + ' W/m²K';
      document.getElementById('rfVal').innerText = rf.toFixed(5) + ' m²K/W';
      document.getElementById('qDuty').innerText = qDuty.toFixed(2) + ' MW';
    }

    function saveCalculationToPlant() {
      const payload = {
        tag: 'HE-301',
        title: 'Thermal Duty & Fouling Calculation',
        state: {
          current_u: document.getElementById('uCurrent').innerText,
          fouling_resistance: document.getElementById('rfVal').innerText,
          effective_duty: document.getElementById('qDuty').innerText,
          timestamp: new Date().toISOString()
        }
      };
      window.parent.postMessage({ type: 'ZINGO_SAVE_CALCULATION', payload }, '*');
      const btn = document.getElementById('saveBtn');
      btn.innerText = 'Saved to Equipment Record!';
      btn.className = 'px-3.5 py-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white transition';
      setTimeout(() => {
        btn.innerText = 'Save to Equipment Dossier';
        btn.className = 'px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white transition';
      }, 3000);
    }
    recalc();
  </script>
</body>
</html>`,
  },
]

const INITIAL_ARTIFACTS: Artifact[] = RAW_INITIAL_ARTIFACTS.map((art) => ({
  ...art,
  versions: [
    {
      version: 1,
      content: art.content,
      title: art.title,
      timestamp: art.createdAt,
    },
  ],
  currentVersionIndex: 0,
}))

export const useArtifactStore = create<ArtifactStore>()(
  persist(
    (set, get) => ({
      artifacts: INITIAL_ARTIFACTS,
      activeArtifactId: null,
      isViewerOpen: false,

      addArtifact: (artifact) => {
        const id = artifact.identifier
          ? `art-${artifact.identifier.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`
          : 'art-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)
        const now = new Date().toISOString()
        const initialVersions: ArtifactVersion[] =
          artifact.versions && artifact.versions.length > 0
            ? artifact.versions
            : [
                {
                  version: 1,
                  content: artifact.content,
                  title: artifact.title,
                  timestamp: now,
                },
              ]

        const newArtifact: Artifact = {
          ...artifact,
          id,
          versions: initialVersions,
          currentVersionIndex: artifact.currentVersionIndex ?? (initialVersions.length - 1),
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          artifacts: [newArtifact, ...state.artifacts],
          activeArtifactId: id,
          isViewerOpen: true,
        }))
        return id
      },

      addArtifactVersion: (id, newContent, title, summary) => {
        const now = new Date().toISOString()
        set((state) => ({
          artifacts: state.artifacts.map((a) => {
            if (a.id !== id) return a
            const versions =
              a.versions && a.versions.length > 0
                ? a.versions
                : [{ version: 1, content: a.content, title: a.title, timestamp: a.createdAt }]
            const nextVerNum = versions.length + 1
            const newVersion: ArtifactVersion = {
              version: nextVerNum,
              content: newContent,
              title: title || a.title,
              timestamp: now,
              summary,
            }
            const updatedVersions = [...versions, newVersion]
            return {
              ...a,
              title: title || a.title,
              content: newContent,
              versions: updatedVersions,
              currentVersionIndex: updatedVersions.length - 1,
              updatedAt: now,
            }
          }),
          activeArtifactId: id,
          isViewerOpen: true,
        }))
      },

      setArtifactVersion: (id, versionNumber) => {
        set((state) => ({
          artifacts: state.artifacts.map((a) => {
            if (a.id !== id || !a.versions || a.versions.length === 0) return a
            const targetIdx = a.versions.findIndex((v) => v.version === versionNumber)
            if (targetIdx === -1) return a
            const targetVersion = a.versions[targetIdx]
            return {
              ...a,
              currentVersionIndex: targetIdx,
              content: targetVersion.content,
              title: targetVersion.title || a.title,
            }
          }),
        }))
      },

      updateActiveVersionContent: (id, newContent) => {
        const now = new Date().toISOString()
        set((state) => ({
          artifacts: state.artifacts.map((a) => {
            if (a.id !== id) return a
            const versions = [
              ...(a.versions && a.versions.length > 0
                ? a.versions
                : [{ version: 1, content: a.content, title: a.title, timestamp: a.createdAt }]),
            ]
            const idx =
              a.currentVersionIndex >= 0 && a.currentVersionIndex < versions.length
                ? a.currentVersionIndex
                : versions.length - 1
            versions[idx] = {
              ...versions[idx],
              content: newContent,
              timestamp: now,
            }
            return {
              ...a,
              content: newContent,
              versions,
              updatedAt: now,
            }
          }),
        }))
      },

      createOrUpdateArtifact: (data) => {
        const { identifier, title, type, language, content, chatId, summary } = data
        const artifacts = get().artifacts

        // Match by identifier, id, or matching title in the same chat
        const existing = artifacts.find(
          (a) =>
            (identifier && (a.identifier === identifier || a.id === `art-${identifier.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`)) ||
            (chatId && a.chatId === chatId && a.title.toLowerCase().trim() === title.toLowerCase().trim())
        )

        if (existing) {
          if (existing.content.trim() !== content.trim()) {
            get().addArtifactVersion(existing.id, content, title, summary)
          } else {
            get().openArtifact(existing.id)
          }
          return existing.id
        }

        return get().addArtifact({
          identifier,
          chatId,
          title,
          type,
          language,
          content,
        })
      },

      updateArtifact: (id, updates) => {
        set((state) => ({
          artifacts: state.artifacts.map((a) =>
            a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
          ),
        }))
      },

      deleteArtifact: (id) => {
        set((state) => ({
          artifacts: state.artifacts.filter((a) => a.id !== id),
          activeArtifactId: state.activeArtifactId === id ? null : state.activeArtifactId,
          isViewerOpen: state.activeArtifactId === id ? false : state.isViewerOpen,
        }))
      },

      getArtifact: (id) => {
        return get().artifacts.find((a) => a.id === id)
      },

      openArtifact: (id) => {
        set({ activeArtifactId: id, isViewerOpen: true })
      },

      closeArtifact: () => {
        set({ isViewerOpen: false })
      },

      bindPlantContext: (id, tag, context) => {
        set((state) => ({
          artifacts: state.artifacts.map((a) =>
            a.id === id
              ? {
                  ...a,
                  equipmentTag: tag,
                  isPlantAware: true,
                  plantContext: context,
                  updatedAt: new Date().toISOString(),
                }
              : a
          ),
        }))
      },

      saveArtifactState: (id, savedState) => {
        set((state) => ({
          artifacts: state.artifacts.map((a) =>
            a.id === id ? { ...a, savedState, updatedAt: new Date().toISOString() } : a
          ),
        }))
      },

      openInSandbox: (content, language, title) => {
        const lang = (language || 'html').toLowerCase()
        let type: ArtifactType = 'html'
        if (['jsx', 'tsx', 'react'].includes(lang)) type = 'react'
        else if (lang === 'svg') type = 'svg'
        else if (lang === 'mermaid') type = 'mermaid'
        else if (['markdown', 'md'].includes(lang)) type = 'markdown'
        else if (content.includes('<!DOCTYPE') || content.includes('<html') || content.includes('<div')) type = 'html'
        else type = 'code'

        let inferredTitle = title
        if (!inferredTitle) {
          const titleMatch = content.match(/<title>([^<]+)<\/title>/i)
          if (titleMatch) {
            inferredTitle = titleMatch[1].trim()
          } else {
            inferredTitle =
              type === 'html' || type === 'react'
                ? 'Interactive Web Application'
                : 'Live Sandbox Application'
          }
        }

        return get().createOrUpdateArtifact({
          title: inferredTitle,
          type,
          language: lang,
          content,
        })
      },

      extractArtifactsFromMessage: (messageContent, chatId) => {
        const detected: Artifact[] = []
        if (!messageContent) return detected

        // Regex 1: Explicit <artifact ...>...</artifact> and <antArtifact ...>...</antArtifact>
        // Supports attributes: identifier, title, type, language in any order
        const tagRegex = /<(?:artifact|antArtifact)\b([^>]*)>([\s\S]*?)<\/(?:artifact|antArtifact)>/gi
        let tagMatch: RegExpExecArray | null
        while ((tagMatch = tagRegex.exec(messageContent)) !== null) {
          const rawAttrs = tagMatch[1] || ''
          const content = tagMatch[2].trim()

          const idMatch = rawAttrs.match(/identifier="([^"]+)"/i)
          const titleMatch = rawAttrs.match(/title="([^"]+)"/i)
          const typeMatch = rawAttrs.match(/type="([^"]+)"/i)
          const langMatch = rawAttrs.match(/language="([^"]+)"/i)

          const identifier = idMatch ? idMatch[1] : undefined
          const title = titleMatch ? titleMatch[1] : 'Interactive Artifact'
          let lang = (langMatch ? langMatch[1] : (typeMatch ? typeMatch[1] : 'html')).toLowerCase()
          let type: ArtifactType = 'html'

          if (typeMatch) {
            const rawType = typeMatch[1].toLowerCase()
            if (['html', 'react', 'svg', 'mermaid', 'markdown', 'code'].includes(rawType)) {
              type = rawType as ArtifactType
            }
          } else {
            if (['jsx', 'tsx', 'react'].includes(lang)) type = 'react'
            else if (lang === 'svg') type = 'svg'
            else if (lang === 'mermaid') type = 'mermaid'
            else if (['markdown', 'md'].includes(lang)) type = 'markdown'
            else if (['python', 'py', 'javascript', 'js', 'bash', 'sh'].includes(lang)) type = 'code'
          }

          const id = get().createOrUpdateArtifact({
            identifier,
            chatId,
            title,
            type,
            language: lang,
            content,
          })
          const added = get().getArtifact(id)
          if (added && !detected.some((d) => d.id === added.id)) detected.push(added)
        }

        // Regex 2: Fallback for substantial fenced code blocks (> 15 lines)
        // Claude definition: substantial & self-contained (> 15 lines)
        const codeBlockRegex = /```([a-zA-Z0-9_-]+)?\s*\n([\s\S]+?)\n```/g
        let codeMatch: RegExpExecArray | null
        while ((codeMatch = codeBlockRegex.exec(messageContent)) !== null) {
          const rawLang = (codeMatch[1] || '').toLowerCase()
          const codeContent = codeMatch[2].trim()
          const lineCount = codeContent.split('\n').length

          // Check if already captured by Regex 1
          if (detected.some((d) => d.content === codeContent)) continue

          // Check qualifying threshold: substantial (> 15 lines or complete standalone HTML/SVG/Mermaid)
          const isCompleteHtml =
            codeContent.includes('<!DOCTYPE') ||
            (codeContent.includes('<html') && codeContent.includes('</html>'))
          const isCompleteSvg = codeContent.includes('<svg') && codeContent.includes('</svg>')
          const isMermaid =
            rawLang === 'mermaid' ||
            codeContent.startsWith('graph ') ||
            codeContent.startsWith('flowchart ') ||
            codeContent.startsWith('sequenceDiagram')
          const isReactComp =
            ['jsx', 'tsx', 'react'].includes(rawLang) &&
            (codeContent.includes('export default') ||
              codeContent.includes('function App') ||
              codeContent.includes('const App'))

          const qualifiesAsArtifact =
            lineCount >= 15 ||
            isCompleteHtml ||
            isCompleteSvg ||
            (isMermaid && lineCount >= 6) ||
            isReactComp

          // Only qualify designated artifact languages: html, react, svg, mermaid, markdown, python, or complete apps
          const isArtifactLang =
            ['html', 'htm', 'svg', 'jsx', 'tsx', 'react', 'mermaid', 'markdown', 'md'].includes(rawLang) ||
            isCompleteHtml ||
            isCompleteSvg ||
            isMermaid ||
            (['python', 'py'].includes(rawLang) && lineCount >= 20)

          if (qualifiesAsArtifact && isArtifactLang) {
            let type: ArtifactType = 'html'
            let lang = rawLang || 'html'

            if (isMermaid || rawLang === 'mermaid') {
              type = 'mermaid'
              lang = 'mermaid'
            } else if (rawLang === 'svg' || isCompleteSvg) {
              type = 'svg'
              lang = 'svg'
            } else if (['jsx', 'tsx', 'react'].includes(rawLang) || isReactComp) {
              type = 'react'
              lang = rawLang || 'tsx'
            } else if (['markdown', 'md'].includes(rawLang)) {
              type = 'markdown'
              lang = 'markdown'
            } else if (['python', 'py'].includes(rawLang)) {
              type = 'code'
              lang = 'python'
            } else if (isCompleteHtml || rawLang === 'html' || rawLang === 'htm') {
              type = 'html'
              lang = 'html'
            }

            let inferredTitle = 'Live Interactive Artifact'
            const titleMatch = codeContent.match(/<title>([^<]+)<\/title>/i)
            if (titleMatch) {
              inferredTitle = titleMatch[1].trim()
            } else if (type === 'mermaid') {
              inferredTitle = 'Architecture & Flow Diagram'
            } else if (type === 'svg') {
              inferredTitle = 'Interactive Vector Graphic'
            } else if (type === 'react') {
              inferredTitle = 'React Application Component'
            } else if (type === 'code' && lang === 'python') {
              inferredTitle = 'Engineering Script / Model'
            }

            const id = get().createOrUpdateArtifact({
              chatId,
              title: inferredTitle,
              type,
              language: lang,
              content: codeContent,
            })
            const added = get().getArtifact(id)
            if (added && !detected.some((d) => d.id === added.id)) detected.push(added)
          }
        }

        return detected
      },
    }),
    {
      name: 'aira-artifacts-v2',
      // Migrate existing persisted artifacts in localStorage that might lack versions or currentVersionIndex
      migrate: (persistedState: any) => {
        if (!persistedState || !Array.isArray(persistedState.artifacts)) return persistedState
        const normalized = persistedState.artifacts.map((a: any) => {
          const versions =
            Array.isArray(a.versions) && a.versions.length > 0
              ? a.versions
              : [
                  {
                    version: 1,
                    content: a.content || '',
                    title: a.title || 'Artifact',
                    timestamp: a.createdAt || new Date().toISOString(),
                  },
                ]
          return {
            ...a,
            versions,
            currentVersionIndex:
              typeof a.currentVersionIndex === 'number' ? a.currentVersionIndex : versions.length - 1,
            content: a.content || versions[versions.length - 1].content,
          }
        })
        return {
          ...persistedState,
          artifacts: normalized,
        }
      },
    }
  )
)
