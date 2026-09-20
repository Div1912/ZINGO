import type { VirtualProject } from '../types/project'

export interface BundleResult {
  html: string
  entryPoint: string
  warnings: string[]
  isReact: boolean
  isPython: boolean
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
        return `<script data-file="${escapeHtml(matchedFile.path)}">\n// inlined from ${escapeHtml(matchedFile.path)}\n${matchedFile.content}\n</script>`
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
        extraJs += `<script data-file="${escapeHtml(path)}">\n// Auto-injected: ${escapeHtml(path)}\n${file.content}\n</script>\n`
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
