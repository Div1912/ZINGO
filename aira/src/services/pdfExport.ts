import type { Chat, AppSettings } from '../types'

/**
 * Strips UI elements (buttons, copy controls, action bars) from HTML content
 */
function sanitizeHtmlForPrint(html: string): string {
  const temp = document.createElement('div')
  temp.innerHTML = html

  // Remove interactive buttons, feedback elements, and copy icons
  const unwanted = temp.querySelectorAll(
    'button, .copy-button, .copy-btn, [role="button"], .model-badge-actions, .interactive-controls'
  )
  unwanted.forEach((el) => el.remove())

  // Hide MathML duplicates to avoid double printing or ? characters
  const mathmls = temp.querySelectorAll('.katex-mathml')
  mathmls.forEach((el) => ((el as HTMLElement).style.display = 'none'))

  return temp.innerHTML
}

/**
 * Collects existing document styles (including Tailwind and KaTeX) to inject into the print document
 */
function collectParentStyles(): string {
  let styles = ''
  try {
    const styleTags = document.head.querySelectorAll('style')
    styleTags.forEach((tag) => {
      styles += tag.outerHTML + '\n'
    })
    const linkTags = document.head.querySelectorAll('link[rel="stylesheet"]')
    linkTags.forEach((link) => {
      styles += link.outerHTML + '\n'
    })
  } catch (err) {
    console.warn('Could not collect all parent stylesheets for print:', err)
  }
  return styles
}

/**
 * Creates the complete, standalone HTML document for printing
 */
function generatePrintHtml(options: {
  title: string
  subtitle?: string
  engineerName?: string
  modelName?: string
  timestamp?: string
  bodyHtml: string
}): string {
  const {
    title,
    subtitle = 'Autonomous Refinery Engineering & Process Intelligence',
    engineerName = 'Process Engineer',
    modelName = 'Qwen 2.5 7B (Sovereign Local)',
    timestamp = new Date().toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    }),
    bodyHtml,
  } = options

  const parentStyles = collectParentStyles()

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  
  <!-- Direct KaTeX CSS to ensure all math font glyphs render flawlessly without '?' -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css" crossorigin="anonymous" />
  
  ${parentStyles}

  <style>
    @page {
      size: A4 portrait;
      margin: 18mm 16mm 20mm 16mm;
    }

    @media print {
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print {
        display: none !important;
      }
      h1, h2, h3, h4 {
        page-break-after: avoid;
      }
      table, pre, blockquote, .report-card, .qa-turn {
        page-break-inside: avoid;
      }
    }

    * {
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Cambria Math", "STIX Two Math", sans-serif;
      color: #0f172a;
      background: #ffffff;
      line-height: 1.6;
      margin: 0;
      padding: 24px;
      font-size: 13px;
    }

    /* Executive Header */
    .report-header {
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 14px;
      margin-bottom: 22px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .report-brand {
      font-size: 20px;
      font-weight: 800;
      color: #1e3a8a;
      letter-spacing: -0.5px;
      text-transform: uppercase;
    }

    .report-sub {
      font-size: 11px;
      color: #475569;
      font-weight: 500;
      margin-top: 3px;
    }

    .report-meta {
      text-align: right;
      font-size: 11px;
      color: #334155;
      line-height: 1.5;
    }

    .report-meta strong {
      color: #0f172a;
    }

    .classification-tag {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      padding: 2px 8px;
      border-radius: 4px;
      margin-bottom: 6px;
    }

    .report-title-banner {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #3b82f6;
      padding: 12px 16px;
      margin-bottom: 24px;
      border-radius: 4px;
    }

    .report-title-banner h1 {
      margin: 0;
      font-size: 17px;
      color: #0f172a;
      font-weight: 700;
    }

    /* Content Typography */
    h1, h2, h3, h4 {
      color: #0f172a;
      margin-top: 1.4em;
      margin-bottom: 0.6em;
      font-weight: 700;
    }

    h1 { font-size: 19px; }
    h2 { font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    h3 { font-size: 13px; }

    p {
      margin: 0.8em 0;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 12px;
    }

    th, td {
      border: 1px solid #cbd5e1;
      padding: 8px 10px;
      text-align: left;
    }

    th {
      background: #f1f5f9;
      font-weight: 600;
      color: #1e293b;
    }

    tr:nth-child(even) td {
      background: #f8fafc;
    }

    /* Code & Preformatted */
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #f1f5f9;
      color: #0f172a;
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 11px;
      border: 1px solid #e2e8f0;
    }

    pre {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 12px 14px;
      overflow-x: auto;
      margin: 14px 0;
    }

    pre code {
      background: none;
      border: none;
      padding: 0;
      color: #0f172a;
      font-size: 11px;
      line-height: 1.5;
    }

    /* KaTeX Mathematical Formulas */
    .katex {
      font-size: 1.08em !important;
      text-rendering: auto;
    }

    .katex-display {
      margin: 1em 0 !important;
      padding: 6px 0 !important;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .katex-mathml {
      display: none !important;
    }

    /* Blockquotes & Callouts */
    blockquote {
      border-left: 3px solid #3b82f6;
      margin: 14px 0;
      padding: 6px 14px;
      background: #f8fafc;
      color: #334155;
      font-style: italic;
    }

    ul, ol {
      padding-left: 20px;
      margin: 10px 0;
    }

    li {
      margin: 4px 0;
    }

    /* Q&A turns in full chat export */
    .qa-turn {
      margin-bottom: 24px;
      padding-bottom: 18px;
      border-bottom: 1px dashed #e2e8f0;
    }

    .qa-turn:last-child {
      border-bottom: none;
    }

    .user-query-card {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 14px;
    }

    .query-meta {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #475569;
      margin-bottom: 4px;
    }

    .query-content {
      font-weight: 600;
      color: #0f172a;
      font-size: 13px;
    }

    .assistant-header {
      font-size: 11px;
      font-weight: 700;
      color: #1e3a8a;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Sources List */
    .sources-box {
      margin-top: 14px;
      padding: 8px 12px;
      background: #fafafa;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      font-size: 11px;
    }

    .sources-title {
      font-weight: 600;
      color: #374151;
      margin-bottom: 4px;
    }

    /* Footer */
    .report-footer {
      margin-top: 40px;
      padding-top: 14px;
      border-top: 1px solid #cbd5e1;
      font-size: 10px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div>
      <div class="classification-tag">Internal Engineering Document</div>
      <div class="report-brand">ZINGO Sovereign AI</div>
      <div class="report-sub">${subtitle}</div>
    </div>
    <div class="report-meta">
      <div><strong>Engineer:</strong> ${engineerName}</div>
      <div><strong>Date:</strong> ${timestamp}</div>
      <div><strong>System:</strong> ${modelName}</div>
    </div>
  </div>

  <div class="report-title-banner">
    <h1>${title}</h1>
  </div>

  <div class="report-body">
    ${bodyHtml}
  </div>

  <div class="report-footer">
    <span>AIRA Industrial Operating System · On-Premise Sovereign Execution</span>
    <span>Confidential — MRPL Internal Engineering Use Only</span>
  </div>
</body>
</html>`
}

/**
 * Triggers printing using a hidden iframe for seamless browser print dialog
 * without opening blank popup tabs or being blocked by popup blockers.
 */
function triggerPrint(htmlContent: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      iframe.style.visibility = 'hidden'

      document.body.appendChild(iframe)

      const doc = iframe.contentWindow?.document
      if (!doc) {
        throw new Error('Could not access iframe document')
      }

      doc.open()
      doc.write(htmlContent)
      doc.close()

      const doPrint = () => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
          resolve(true)
        } catch (err) {
          console.warn('iframe print failed, falling back to popup:', err)
          fallbackPopupPrint(htmlContent).then(resolve)
        } finally {
          setTimeout(() => {
            try {
              document.body.removeChild(iframe)
            } catch {}
          }, 3000)
        }
      }

      // Allow fonts and KaTeX CSS to load before printing
      if (doc.fonts && doc.fonts.ready) {
        doc.fonts.ready
          .then(() => {
            setTimeout(doPrint, 250)
          })
          .catch(() => {
            setTimeout(doPrint, 400)
          })
      } else {
        setTimeout(doPrint, 400)
      }
    } catch (err) {
      console.warn('Iframe printing error, attempting popup:', err)
      fallbackPopupPrint(htmlContent).then(resolve)
    }
  })
}

/**
 * Fallback print handler using a popup window
 */
function fallbackPopupPrint(htmlContent: string): Promise<boolean> {
  return new Promise((resolve) => {
    const printWindow = window.open('', '_blank', 'width=960,height=800')
    if (!printWindow) {
      resolve(false)
      return
    }

    printWindow.document.open()
    printWindow.document.write(htmlContent)
    printWindow.document.close()

    printWindow.focus()
    setTimeout(() => {
      try {
        printWindow.print()
        resolve(true)
      } catch {
        resolve(false)
      }
    }, 500)
  })
}

/**
 * Exports an individual message bubble to PDF / Print
 */
export async function exportMessageToPdf(
  messageEl: HTMLElement | string,
  options: {
    title: string
    modelName?: string
    settings: AppSettings
  }
): Promise<boolean> {
  const rawHtml = typeof messageEl === 'string' ? messageEl : messageEl.innerHTML
  const cleanedHtml = sanitizeHtmlForPrint(rawHtml)

  const printHtml = generatePrintHtml({
    title: options.title,
    engineerName: options.settings.userName || options.settings.preferredName || 'Process Engineer',
    modelName: options.modelName || 'Qwen 2.5 7B (Local Sovereign)',
    bodyHtml: cleanedHtml,
  })

  return triggerPrint(printHtml)
}

/**
 * Exports the entire conversation to an executive, documented engineering PDF report
 */
export async function exportChatToPdf(chat: Chat, settings: AppSettings): Promise<boolean> {
  if (!chat || !chat.messages || chat.messages.length === 0) {
    return false
  }

  let fullChatHtml = ''

  for (let i = 0; i < chat.messages.length; i++) {
    const msg = chat.messages[i]
    const timestamp = new Date(msg.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    if (msg.role === 'user') {
      fullChatHtml += `
        <div class="qa-turn">
          <div class="user-query-card">
            <div class="query-meta">Engineering Inquiry · ${timestamp}</div>
            <div class="query-content">${escapeHtml(msg.content)}</div>
          </div>
      `
    } else {
      // Look for the rendered DOM element of this message if available in the current document
      const renderedBubble = document.querySelector(`[data-message-id="${msg.id}"] .chat-markdown-body`)
      let responseHtml = ''

      if (renderedBubble) {
        responseHtml = sanitizeHtmlForPrint((renderedBubble as HTMLElement).innerHTML)
      } else {
        // Fallback if element not rendered
        responseHtml = `<p>${escapeHtml(msg.content).replace(/\n/g, '<br/>')}</p>`
      }

      let sourcesHtml = ''
      if (msg.sources && msg.sources.length > 0) {
        sourcesHtml = `
          <div class="sources-box">
            <div class="sources-title">Referenced Engineering Documentation:</div>
            <ul>
              ${msg.sources
                .map(
                  (s) =>
                    `<li><strong>${escapeHtml(s.title || s.document)}</strong> ${
                      s.page ? `(Page ${s.page})` : ''
                    } — ${(s.relevanceScore * 100).toFixed(0)}% correlation</li>`
                )
                .join('')}
            </ul>
          </div>
        `
      }

      fullChatHtml += `
          <div class="assistant-response">
            <div class="assistant-header">
              <span>AIRA Process Intelligence</span>
              ${msg.modelUsed ? `<span>· Model: ${msg.modelUsed}</span>` : ''}
              ${msg.latencyMs ? `<span>· Response Time: ${(msg.latencyMs / 1000).toFixed(1)}s</span>` : ''}
            </div>
            <div class="response-body">
              ${responseHtml}
            </div>
            ${sourcesHtml}
          </div>
        </div>
      `
    }
  }

  const printHtml = generatePrintHtml({
    title: chat.title || 'Refinery Process Intelligence Consultation',
    subtitle: 'Full Engineering Session Transcript & Technical Findings',
    engineerName: settings.userName || settings.preferredName || 'Process Operations Engineer',
    modelName: `${chat.model || 'Sovereign Ensemble'}`,
    timestamp: new Date(chat.createdAt).toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    }),
    bodyHtml: fullChatHtml,
  })

  return triggerPrint(printHtml)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
