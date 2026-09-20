/**
 * ZINGO — In-Browser Sovereign Python WebAssembly (Pyodide) Execution Engine
 * =========================================================================
 * Executes data science, mathematical calculations, and Matplotlib/Pandas
 * plotting natively in the browser with ZERO backend server load.
 */

declare global {
  interface Window {
    loadPyodide?: any
    __pyodideInstance?: any
    __pyodideLoadingPromise?: Promise<any>
  }
}

export interface PyodideExecutionResult {
  success: boolean
  stdout: string
  stderr: string
  plotSvg?: string
  executionTimeMs: number
  error?: string
}

class PyodideEngine {
  private pyodide: any = null
  private loadingPromise: Promise<any> | null = null

  /**
   * Initializes Pyodide runtime script from CDN if not already loaded.
   */
  private async loadScript(): Promise<void> {
    if (typeof window.loadPyodide === 'function') return

    return new Promise((resolve, reject) => {
      const existing = document.getElementById('pyodide-cdn-script')
      if (existing) {
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', (e) => reject(e))
        return
      }

      const script = document.createElement('script')
      script.id = 'pyodide-cdn-script'
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js'
      script.async = true
      script.onload = () => resolve()
      script.onerror = (err) => reject(new Error(`Failed to load Pyodide WebAssembly script from CDN: ${err}`))
      document.head.appendChild(script)
    })
  }

  /**
   * Initializes or returns the cached Pyodide WebAssembly instance.
   */
  public async getInstance(): Promise<any> {
    if (this.pyodide) return this.pyodide
    if (this.loadingPromise) return this.loadingPromise

    this.loadingPromise = (async () => {
      await this.loadScript()
      const py = await window.loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
      })
      this.pyodide = py
      window.__pyodideInstance = py
      return py
    })()

    return this.loadingPromise
  }

  /**
   * Executes arbitrary Python code with automatic package loading, stdout/stderr capture,
   * MEMFS virtual file mounting, and Matplotlib vector SVG plot extraction.
   */
  public async execute(
    code: string,
    files?: Record<string, string>
  ): Promise<PyodideExecutionResult> {
    const start = performance.now()
    try {
      const py = await this.getInstance()

      // Mount virtual files into Emscripten MEMFS
      if (files) {
        for (const [filename, content] of Object.entries(files)) {
          try {
            py.FS.writeFile('/' + filename.replace(/^\/+/, ''), content)
          } catch (fsErr) {
            console.warn(`[pyodide] Could not write file ${filename} to MEMFS:`, fsErr)
          }
        }
      }

      // Automatically inspect and fetch required scientific packages (numpy, pandas, matplotlib)
      try {
        await py.loadPackagesFromImports(code)
      } catch (pkgErr) {
        console.warn('[pyodide] Package resolution warning:', pkgErr)
      }

      // Intercept stdout, stderr, and matplotlib SVG figures
      const wrappedPython = `
import sys, io
_stdout_buf = io.StringIO()
_stderr_buf = io.StringIO()
sys.stdout = _stdout_buf
sys.stderr = _stderr_buf

_has_plt = False
_plot_svg_data = ""
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    _has_plt = True
except Exception:
    pass

try:
${code
  .split('\n')
  .map((line) => '    ' + line)
  .join('\n')}
finally:
    if _has_plt:
        try:
            if plt.get_fignums():
                _fig_buf = io.StringIO()
                plt.savefig(_fig_buf, format='svg', bbox_inches='tight')
                plt.close('all')
                _plot_svg_data = _fig_buf.getvalue()
        except Exception as _fig_err:
            pass

_final_stdout = _stdout_buf.getvalue()
_final_stderr = _stderr_buf.getvalue()
`

      await py.runPythonAsync(wrappedPython)

      const stdout = py.globals.get('_final_stdout') || ''
      const stderr = py.globals.get('_final_stderr') || ''
      const plotSvg = py.globals.get('_plot_svg_data') || undefined

      const elapsed = Math.round(performance.now() - start)
      return {
        success: true,
        stdout,
        stderr,
        plotSvg: plotSvg && plotSvg.trim() ? plotSvg : undefined,
        executionTimeMs: elapsed,
      }
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - start)
      return {
        success: false,
        stdout: '',
        stderr: err?.message || String(err),
        executionTimeMs: elapsed,
        error: err?.message || String(err),
      }
    }
  }
}

export const pyodideEngine = new PyodideEngine()
