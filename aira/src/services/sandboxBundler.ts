import type { VirtualProject } from '../types/project'

export interface BundleResult {
  html: string
  entryPoint: string
  warnings: string[]
  isReact: boolean
  isPython: boolean
}

/**
 * Returns true if enough of the JS file's top-level identifiers already appear
 * inside inline <script> blocks in the HTML, indicating the content is already present.
 */
function hasSignificantOverlap(jsContent: string, htmlContent: string): boolean {
  // Extract identifiers (function/const/let/var names) from JS
  const identifiers = [...jsContent.matchAll(/(?:function|const|let|var)\s+([a-zA-Z_$][\w$]*)/g)]
    .map(m => m[1])
    .slice(0, 8)
  if (identifiers.length === 0) return false
  const matches = identifiers.filter(id => htmlContent.includes(id))
  return matches.length >= Math.min(3, Math.ceil(identifiers.length * 0.6))
}

/**
 * Returns true if enough of the CSS file's top-level selectors already appear
 * inside inline <style> blocks in the HTML, indicating the content is already present.
 */
function hasSignificantCssOverlap(cssContent: string, htmlContent: string): boolean {
  const selectors = [...cssContent.matchAll(/([.#][a-zA-Z_-][\w-]*|[a-z][\w-]+)\s*\{/g)]
    .map(m => m[1]).slice(0, 6)
  if (selectors.length === 0) return false
  const matches = selectors.filter(s => htmlContent.includes(s))
  return matches.length >= Math.min(2, Math.ceil(selectors.length * 0.5))
}

/**
 * Creates an isolated, executable HTML document from virtual project files.
 * Inlines stylesheets, scripts, telemetry hooks, and necessary CDN libraries.
 */
export function bundleVirtualProject(project: VirtualProject): BundleResult {
  const files = project.files
  const warnings: string[] = []

  let entryPath = project.entryPoint || 'index.html'
  let entryFile = files[entryPath]

  // Fallback to any html file if entryPoint is not found
  if (!entryFile) {
    const htmlKey = Object.keys(files).find((k) => k.endsWith('.html'))
    if (htmlKey) {
      entryPath = htmlKey
      entryFile = files[htmlKey]
    }
  }

  // Check if project is React / JSX without an index.html
  const isReact =
    !entryFile &&
    Object.values(files).some(
      (f) =>
        f.language === 'jsx' ||
        f.language === 'tsx' ||
        f.name.endsWith('.jsx') ||
        f.name.endsWith('.tsx')
    )

  // Check if project is Python
  const isPython =
    !entryFile &&
    Object.values(files).some(
      (f) => f.language === 'python' || f.name.endsWith('.py')
    )

  // -------------------------------------------------------------------------
  // Case A: React Component project without full HTML wrapper
  // -------------------------------------------------------------------------
  if (isReact) {
    const reactFile =
      Object.values(files).find(
        (f) => f.language === 'jsx' || f.language === 'tsx' || f.name.endsWith('.jsx') || f.name.endsWith('.tsx')
      ) || Object.values(files)[0]

    let cssBundle = ''
    for (const file of Object.values(files)) {
      if (file.language === 'css' || file.name.endsWith('.css')) {
        cssBundle += `\n/* ${file.name} */\n${file.content}\n`
      }
    }

    const html = buildReactShell(project.title, reactFile.content, cssBundle)
    return { html, entryPoint: reactFile.path, warnings, isReact: true, isPython: false }
  }

  // -------------------------------------------------------------------------
  // Case B: Python project
  // -------------------------------------------------------------------------
  if (isPython) {
    const pyFile =
      Object.values(files).find(
        (f) => f.language === 'python' || f.name.endsWith('.py')
      ) || Object.values(files)[0]

    const html = buildPythonShell(project.title, pyFile.content)
    return { html, entryPoint: pyFile.path, warnings, isReact: false, isPython: true }
  }

  // -------------------------------------------------------------------------
  // Case P: Presentation Slide Deck (deck_manifest.json)
  // -------------------------------------------------------------------------
  const manifestFile =
    files['deck_manifest.json'] ||
    files['presentation.json'] ||
    Object.values(files).find(
      (f) =>
        f.language === 'json' &&
        f.content.includes('"slides"') &&
        (f.content.includes('"title"') || f.content.includes('"layout"'))
    )

  if (manifestFile && (!entryFile || entryPath === 'deck_manifest.json')) {
    const html = buildPresentationShell(project.title, manifestFile.content)
    return { html, entryPoint: manifestFile.path, warnings, isReact: false, isPython: false }
  }

  // -------------------------------------------------------------------------
  // Case C: Standard Web Project (HTML + CSS + JS)
  // -------------------------------------------------------------------------
  let rawHtml = entryFile ? entryFile.content : buildDefaultHtml(project.title)

  // Ensure minimum HTML boilerplate
  if (!rawHtml.includes('<html') && !rawHtml.includes('<!DOCTYPE')) {
    rawHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(project.title)}</title>
</head>
<body>
  ${rawHtml}
</body>
</html>`
  }

  // 1. Resolve and inline CSS <link rel="stylesheet" href="...">
  rawHtml = rawHtml.replace(
    /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>|<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi,
    (match, href1, href2) => {
      const href = (href1 || href2 || '').trim()
      const cleanHref = href.replace(/^\.?\//, '') // remove ./ or /

      // Look up file in VFS
      const matchedFile =
        files[cleanHref] ||
        files[href] ||
        Object.values(files).find((f) => f.name === cleanHref.split('/').pop())

      if (matchedFile) {
        return `<style data-file="${escapeHtml(matchedFile.path)}">\n/* inlined from ${escapeHtml(matchedFile.path)} */\n${matchedFile.content}\n</style>`
      }

      // If it's an external CDN link, preserve it
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
        return match
      }

      warnings.push(`Stylesheet "${href}" referenced in index.html not found in virtual project.`)
      return `<!-- Missing stylesheet: ${escapeHtml(href)} -->`
    }
  )

  // 2. Also inject any orphan CSS files that weren't explicitly referenced in <link>
  const inlinedCssPaths = new Set(
    Array.from(rawHtml.matchAll(/<style data-file="([^"]+)">/g)).map((m) => m[1])
  )
  let extraCss = ''
  for (const [path, file] of Object.entries(files)) {
    if (file.language === 'css' || file.name.endsWith('.css')) {
      if (!inlinedCssPaths.has(path) && !inlinedCssPaths.has(file.name)) {
        // Skip if content already substantially present as inline style in HTML
        if (hasSignificantCssOverlap(file.content, rawHtml)) {
          warnings.push(`Skipped orphan injection of "${path}" — CSS content already inlined in HTML.`)
          continue
        }
        extraCss += `<style data-file="${escapeHtml(path)}">\n/* Auto-injected: ${escapeHtml(path)} */\n${file.content}\n</style>\n`
      }
    }
  }

  // 3. Resolve and inline JS <script src="..."></script>
  rawHtml = rawHtml.replace(
    /<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (match, src) => {
      const cleanSrc = (src || '').trim().replace(/^\.?\//, '')

      // Look up file in VFS
      const matchedFile =
        files[cleanSrc] ||
        files[src] ||
        Object.values(files).find((f) => f.name === cleanSrc.split('/').pop())

      if (matchedFile) {
        return `<script data-file="${escapeHtml(matchedFile.path)}">\ntry {\n// inlined from ${escapeHtml(matchedFile.path)}\n${matchedFile.content}\n} catch(e) { console.error('[Sandbox] ${escapeHtml(matchedFile.path)} error:', e); }\n</script>`
      }

      // External CDN script
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
        return match
      }

      warnings.push(`Script "${src}" referenced in index.html not found in virtual project.`)
      return `<!-- Missing script: ${escapeHtml(src)} -->`
    }
  )

  // 4. Also inject any orphan JS files that weren't explicitly referenced in <script>
  const inlinedJsPaths = new Set(
    Array.from(rawHtml.matchAll(/<script data-file="([^"]+)">/g)).map((m) => m[1])
  )
  let extraJs = ''
  for (const [path, file] of Object.entries(files)) {
    if (file.language === 'javascript' || file.name.endsWith('.js')) {
      if (!inlinedJsPaths.has(path) && !inlinedJsPaths.has(file.name) && path !== entryPath) {
        // Skip if content already substantially present as inline script in HTML
        if (hasSignificantOverlap(file.content, rawHtml)) {
          warnings.push(`Skipped orphan injection of "${path}" — content already inlined in HTML.`)
          continue
        }
        extraJs += `<script data-file="${escapeHtml(path)}">\n// Auto-injected: ${escapeHtml(path)}\ntry {\n${file.content}\n} catch(e) { console.error('[Sandbox] ${escapeHtml(path)} runtime error:', e); }\n</script>\n`
      }
    }
  }

  // 5. Inject Tailwind CSS if the markup uses Tailwind classes and doesn't already import it
  const needsTailwind =
    !rawHtml.includes('tailwindcss.com') &&
    (rawHtml.includes('class="') || rawHtml.includes("class='")) &&
    (/\b(bg-|text-|flex|grid|p-|m-|rounded|border-|shadow|justify-|items-)\b/.test(rawHtml) || extraCss.includes('@apply'))

  const tailwindCdn = needsTailwind
    ? `<script src="https://cdn.tailwindcss.com"></script>\n`
    : ''

  // 6. Inject Telemetry & Console Bridge
  const telemetryScript = buildTelemetryScript()

  // Assemble document
  let finalHtml = rawHtml
  if (finalHtml.includes('</head>')) {
    finalHtml = finalHtml.replace('</head>', `${tailwindCdn}${extraCss}${telemetryScript}</head>`)
  } else if (finalHtml.includes('<body')) {
    finalHtml = finalHtml.replace('<body', `<head>${tailwindCdn}${extraCss}${telemetryScript}</head><body`)
  } else {
    finalHtml = `<head>${tailwindCdn}${extraCss}${telemetryScript}</head>${finalHtml}`
  }

  if (finalHtml.includes('</body>')) {
    finalHtml = finalHtml.replace('</body>', `${extraJs}</body>`)
  } else {
    finalHtml = `${finalHtml}${extraJs}`
  }

  return {
    html: finalHtml,
    entryPoint: entryPath,
    warnings,
    isReact: false,
    isPython: false,
  }
}

/**
 * Builds the interactive React 18 + Babel sandbox wrapper.
 */
function buildReactShell(title: string, componentCode: string, cssBundle: string): string {
  // Normalize React code: strip import/export statements that fail in browser script tag
  let cleanCode = componentCode
    .replace(/import\s+React(?:\s*,\s*\{[^}]*\})?\s+from\s+['"][^'"]+['"];?/g, '')
    .replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?/g, '')
    .replace(/import\s+.*?\s+from\s+['"][^'"]+['"];?/g, '')
    .replace(/export\s+default\s+/g, 'const App = ')
    .replace(/export\s+\{[^}]*\};?/g, '')
    .replace(/export\s+(?:const|function|class)\s+/g, (m) => m.replace('export ', ''))

  // If there's an App or Component definition without mount:
  const mountLogic = `
    const rootElement = document.getElementById('root');
    const root = ReactDOM.createRoot(rootElement);
    if (typeof App !== 'undefined') {
      root.render(React.createElement(App));
    } else if (typeof TodoApp !== 'undefined') {
      root.render(React.createElement(TodoApp));
    } else {
      console.warn("No top-level App component found to mount.");
    }
  `

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { margin: 0; background: #0b0f19; color: #f8fafc; font-family: ui-sans-serif, system-ui, sans-serif; }
    ${cssBundle}
  </style>
  ${buildTelemetryScript()}
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    try {
      ${cleanCode}
      ${mountLogic}
    } catch(err) {
      console.error("React Sandbox Runtime Error:", err);
      document.getElementById('root').innerHTML = '<div style="padding:20px;color:#f87171;font-family:monospace;background:#1e1b4b;border-radius:8px;margin:20px;"><strong>React Error:</strong> ' + err.message + '</div>';
    }
  </script>
</body>
</html>`
}

/**
 * Builds the interactive Python + Pyodide WebAssembly sandbox wrapper.
 */
function buildPythonShell(title: string, pythonCode: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js"></script>
  ${buildTelemetryScript()}
</head>
<body class="bg-[#090d16] text-slate-100 p-6 min-h-screen font-mono text-sm">
  <div class="max-w-4xl mx-auto space-y-4">
    <div class="flex items-center justify-between border-b border-slate-800 pb-3">
      <h1 class="text-base font-bold text-violet-400">Python WebAssembly Sandbox</h1>
      <span id="status" class="px-2.5 py-1 text-xs rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">Loading Pyodide...</span>
    </div>
    <div id="plotContainer" class="hidden bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-center"></div>
    <div class="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-auto max-h-[500px]">
      <div class="text-slate-500 mb-2 font-semibold">Console Output:</div>
      <pre id="output" class="text-emerald-400 whitespace-pre-wrap"></pre>
    </div>
  </div>

  <script>
    async function runPy() {
      const out = document.getElementById('output');
      const status = document.getElementById('status');
      try {
        const pyodide = await loadPyodide({
          stdout: (text) => {
            out.textContent += text + '\\n';
            console.log(text);
          },
          stderr: (text) => {
            out.textContent += text + '\\n';
            console.error(text);
          }
        });
        status.textContent = 'Pyodide Ready — Executing...';
        status.className = 'px-2.5 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20';

        const code = ${JSON.stringify(pythonCode)};
        await pyodide.loadPackagesFromImports(code);
        await pyodide.runPythonAsync(code);

        status.textContent = 'Execution Finished (Exit 0)';
      } catch (err) {
        status.textContent = 'Execution Error';
        status.className = 'px-2.5 py-1 text-xs rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20';
        out.textContent += '\\n[Error]: ' + err.message;
        console.error(err);
      }
    }
    runPy();
  </script>
</body>
</html>`
}

/**
 * Builds the interactive 16:9 executive presentation carousel sandbox wrapper.
 */
function buildPresentationShell(title: string, manifestJson: string): string {
  let cleanJson = manifestJson.trim()
  cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  cleanJson = cleanJson.replace(/^<!--[\s\S]*?-->\s*/, '')
  cleanJson = cleanJson.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
  cleanJson = cleanJson.replace(/^\/\/.*?\n\s*/, '')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; background: #070A11; color: #F8FAFC; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .slide-card { aspect-ratio: 16 / 9; }
  </style>
  ${buildTelemetryScript()}
</head>
<body class="flex flex-col h-screen select-none overflow-hidden bg-[#070A11]">
  <!-- Top Navigation & Controls Bar -->
  <header class="h-12 border-b border-slate-800/80 bg-slate-950/80 px-4 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-2">
      <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
      <h1 class="text-xs font-bold text-slate-200 truncate max-w-xs sm:max-w-md" id="deckTitle">${escapeHtml(title)}</h1>
      <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">16:9 Presentation</span>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-xs font-mono text-slate-400" id="slideCounter">1 / 1</span>
      <div class="flex items-center gap-1">
        <button id="prevBtn" class="p-1.5 rounded-md hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <button id="nextBtn" class="p-1.5 rounded-md hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>
  </header>

  <!-- Slide Display Viewport -->
  <main class="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-hidden">
    <div id="slideViewport" class="slide-card w-full max-w-5xl rounded-2xl border border-slate-800/80 bg-[#0B0F19] shadow-2xl p-6 sm:p-12 flex flex-col justify-between relative overflow-hidden transition-all duration-300">
      <!-- Rendered dynamically -->
    </div>
  </main>

  <!-- Footer Navigation Help -->
  <footer class="h-8 border-t border-slate-900 bg-slate-950/60 px-4 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
    <div>Use <kbd class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">←</kbd> <kbd class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">→</kbd> keys to navigate slides</div>
    <div>AIRA Sovereign Presentation Engine</div>
  </footer>

  <script>
    let manifest = { title: ${JSON.stringify(title)}, slides: [] };
    try {
      const raw = ${JSON.stringify(cleanJson)};
      const jsonMatch = raw.match(/\\{[\\s\\S]*"slides"[\\s\\S]*\\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      if (parsed && Array.isArray(parsed.slides)) manifest = parsed;
    } catch(err) {
      console.error("[SlideDeck] Parse error:", err);
    }

    if (!manifest.slides || manifest.slides.length === 0) {
      manifest.slides = [
        { title: manifest.title || "Executive Presentation", subtitle: "Strategic Briefing", layout: "title" },
        { title: "Key Performance Indicators", layout: "kpi_metrics", cards: [{ stat: "100%", title: "Readiness", description: "All parameters nominal" }] }
      ];
    }

    let curIdx = 0;
    const total = manifest.slides.length;
    const vp = document.getElementById('slideViewport');
    const counter = document.getElementById('slideCounter');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const deckTitle = document.getElementById('deckTitle');

    if (manifest.title) deckTitle.textContent = manifest.title;

    function renderSlide(idx) {
      curIdx = Math.max(0, Math.min(idx, total - 1));
      const s = manifest.slides[curIdx];
      counter.textContent = (curIdx + 1) + ' / ' + total;
      prevBtn.disabled = curIdx === 0;
      nextBtn.disabled = curIdx === total - 1;

      const layout = s.layout || (curIdx === 0 ? 'title' : 'standard');

      if (layout === 'title' || curIdx === 0) {
        vp.innerHTML = \`
          <div class="h-1.5 w-16 bg-amber-500 rounded-full mb-4"></div>
          <div class="my-auto space-y-4">
            <h1 class="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">\${escapeHtml(s.title || manifest.title)}</h1>
            \${s.subtitle ? \`<p class="text-lg sm:text-xl text-slate-400 font-normal">\${escapeHtml(s.subtitle)}</p>\` : ''}
          </div>
          <div class="flex items-center justify-between border-t border-slate-800/80 pt-4 text-xs text-slate-500">
            <span>\${escapeHtml(manifest.author || 'AIRA Sovereign Intelligence')}</span>
            <span>\${escapeHtml(manifest.date || new Date().toLocaleDateString())}</span>
          </div>
        \`;
      } else if (layout === 'kpi_metrics' && s.cards && s.cards.length > 0) {
        const cardsHtml = s.cards.slice(0, 3).map(c => \`
          <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col justify-between">
            <div class="text-4xl sm:text-5xl font-black text-amber-400 font-mono tracking-tight">\${escapeHtml(c.stat || '—')}</div>
            <div class="mt-4">
              <div class="text-base font-bold text-white mb-1">\${escapeHtml(c.title || '')}</div>
              <div class="text-xs text-slate-400 leading-relaxed">\${escapeHtml(c.description || '')}</div>
            </div>
          </div>
        \`).join('');

        vp.innerHTML = \`
          <div>
            <div class="text-[10px] uppercase font-mono tracking-wider text-amber-400 mb-1">Key Performance Indicators</div>
            <h2 class="text-2xl sm:text-3xl font-black text-white">\${escapeHtml(s.title || '')}</h2>
            \${s.subtitle ? \`<p class="text-xs text-slate-400 mt-1">\${escapeHtml(s.subtitle)}</p>\` : ''}
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 my-auto">\${cardsHtml}</div>
          <div class="text-[11px] text-slate-600 flex justify-between border-t border-slate-900 pt-3">
            <span>MRPL Sovereign Operations Benchmark</span>
            <span>Slide \${curIdx + 1} of \${total}</span>
          </div>
        \`;
      } else if ((layout === 'card_grid' || layout === 'timeline') && s.cards && s.cards.length > 0) {
        const cardsHtml = s.cards.slice(0, 3).map((c, i) => \`
          <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col justify-between \${i === 0 ? 'border-sky-500/40 shadow-lg shadow-sky-950/20' : ''}">
            <div class="text-xs font-mono font-bold text-sky-400 mb-2">\${layout === 'timeline' ? 'PHASE ' + (i + 1) : 'PILLAR ' + (i + 1)}</div>
            <div class="text-base font-bold text-white mb-2">\${escapeHtml(c.title || '')}</div>
            <div class="text-xs text-slate-400 leading-relaxed">\${escapeHtml(c.description || '')}</div>
          </div>
        \`).join('');

        vp.innerHTML = \`
          <div>
            <div class="text-[10px] uppercase font-mono tracking-wider text-sky-400 mb-1">\${layout === 'timeline' ? 'Execution Roadmap' : 'Strategic Architecture'}</div>
            <h2 class="text-2xl sm:text-3xl font-black text-white">\${escapeHtml(s.title || '')}</h2>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 my-auto">\${cardsHtml}</div>
          <div class="text-[11px] text-slate-600 flex justify-between border-t border-slate-900 pt-3">
            <span>Strategic Framework</span>
            <span>Slide \${curIdx + 1} of \${total}</span>
          </div>
        \`;
      } else {
        const bulletsHtml = (s.bullets || []).map(b => \`
          <li class="flex items-start gap-3 text-sm text-slate-200 leading-relaxed">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0"></span>
            <span>\${escapeHtml(b)}</span>
          </li>
        \`).join('');

        const takeawayHtml = s.takeaway ? \`
          <div class="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 flex flex-col justify-center">
            <div class="text-[10px] font-mono uppercase font-bold text-amber-400 tracking-wider mb-2">Executive Takeaway</div>
            <div class="text-sm font-semibold text-amber-100 leading-relaxed">\${escapeHtml(s.takeaway)}</div>
          </div>
        \` : '';

        vp.innerHTML = \`
          <div>
            <div class="text-[10px] uppercase font-mono tracking-wider text-amber-400 mb-1">Executive Summary</div>
            <h2 class="text-2xl sm:text-3xl font-black text-white">\${escapeHtml(s.title || '')}</h2>
          </div>
          <div class="grid grid-cols-1 \${s.takeaway ? 'sm:grid-cols-3' : ''} gap-6 my-auto items-center">
            <ul class="space-y-3 \${s.takeaway ? 'sm:col-span-2' : ''}">\${bulletsHtml}</ul>
            \${takeawayHtml}
          </div>
          <div class="text-[11px] text-slate-600 flex justify-between border-t border-slate-900 pt-3">
            <span>AIRA Industrial Intelligence</span>
            <span>Slide \${curIdx + 1} of \${total}</span>
          </div>
        \`;
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    prevBtn.addEventListener('click', () => renderSlide(curIdx - 1));
    nextBtn.addEventListener('click', () => renderSlide(curIdx + 1));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') renderSlide(curIdx - 1);
      if (e.key === 'ArrowRight' || e.key === ' ') renderSlide(curIdx + 1);
    });

    renderSlide(0);
  </script>
</body>
</html>`
}

/**
 * Builds the bi-directional console and runtime telemetry bridge script.
 */
function buildTelemetryScript(): string {
  return `
  <script>
    (function() {
      const _origLog = console.log;
      const _origWarn = console.warn;
      const _origError = console.error;
      const _origInfo = console.info;

      function sendLog(level, args) {
        try {
          const str = args.map(function(a) {
            if (typeof a === 'object') {
              try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); }
            }
            return String(a);
          }).join(' ');
          window.parent.postMessage({
            type: 'SANDBOX_CONSOLE',
            level: level,
            message: str,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          }, '*');
        } catch (err) {}
      }

      console.log = function() {
        _origLog.apply(console, arguments);
        sendLog('info', Array.from(arguments));
      };
      console.info = function() {
        _origInfo.apply(console, arguments);
        sendLog('info', Array.from(arguments));
      };
      console.warn = function() {
        _origWarn.apply(console, arguments);
        sendLog('warn', Array.from(arguments));
      };
      console.error = function() {
        _origError.apply(console, arguments);
        sendLog('error', Array.from(arguments));
      };

      window.onerror = function(msg, url, line, col, error) {
        const errorMsg = msg + (line ? ' (Line ' + line + (col ? ':' + col : '') + ')' : '');
        sendLog('error', [errorMsg]);
      };

      window.addEventListener('unhandledrejection', function(event) {
        sendLog('error', ['Unhandled Promise Rejection: ' + (event.reason ? event.reason.message || event.reason : 'Unknown')]);
      });
    })();
  </script>
`
}

function buildDefaultHtml(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
</head>
<body style="font-family: sans-serif; padding: 24px; background: #090d16; color: #fff;">
  <h2>${escapeHtml(title)}</h2>
  <p>No index.html found in project.</p>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
