import type { VirtualFile, VirtualProject } from '../types/project'

export interface ParsedVirtualFile {
  name: string
  path: string
  content: string
  language: string
}

export interface ParsedProjectResult {
  title: string
  entryPoint: string
  files: Record<string, ParsedVirtualFile>
  isMultiFile: boolean
  isInteractiveApp: boolean
}

/**
 * Normalizes programming languages to standard identifiers.
 */
export function normalizeLanguage(lang: string): string {
  const l = (lang || '').toLowerCase().trim()
  if (['html', 'htm'].includes(l)) return 'html'
  if (['css', 'scss', 'postcss', 'style'].includes(l)) return 'css'
  if (['js', 'javascript', 'mjs', 'cjs'].includes(l)) return 'javascript'
  if (['ts', 'typescript'].includes(l)) return 'typescript'
  if (['jsx', 'react'].includes(l)) return 'jsx'
  if (['tsx'].includes(l)) return 'tsx'
  if (['json'].includes(l)) return 'json'
  if (['py', 'python'].includes(l)) return 'python'
  if (['svg'].includes(l)) return 'svg'
  return l || 'text'
}

/**
 * Infers default file extension from language.
 */
function defaultExtensionForLang(lang: string): string {
  switch (normalizeLanguage(lang)) {
    case 'html': return 'html'
    case 'css': return 'css'
    case 'javascript': return 'js'
    case 'typescript': return 'ts'
    case 'jsx': return 'jsx'
    case 'tsx': return 'tsx'
    case 'json': return 'json'
    case 'python': return 'py'
    case 'svg': return 'svg'
    default: return 'txt'
  }
}

/**
 * Extracts all project files from a markdown message.
 * Handles:
 * 1. Explicit filenames in code fence: ```html index.html or ```css:style.css
 * 2. Filename comments in first 2 lines: <!-- index.html --> or /* style.css * / or // script.js
 * 3. Markdown headings immediately preceding block: ### index.html
 * 4. XML file tags: <file path="index.html">...</file>
 * 5. Heuristic auto-pairing: when an HTML, CSS, and JS block appear together without filenames
 */

export function extractProjectFromMessage(
  content: string,
  suggestedTitle?: string
): ParsedProjectResult | null {
  if (!content || typeof content !== 'string' || content.trim().length < 40) {
    return null
  }

  const filesMap: Record<string, ParsedVirtualFile> = {}

  // ----------------------------------------------------------------------------------
  // STRATEGY 1: XML <file path="...">...</file> or <file name="...">
  // ----------------------------------------------------------------------------------
  const xmlFileRegex = /<file\s+(?:path|name)="([^"]+)"(?:\s+language="([^"]+)")?[^>]*>([\s\S]*?)<\/file>/gi
  let xmlMatch: RegExpExecArray | null
  while ((xmlMatch = xmlFileRegex.exec(content)) !== null) {
    const rawPath = xmlMatch[1].trim()
    const rawLang = xmlMatch[2] || rawPath.split('.').pop() || 'html'
    const code = xmlMatch[3].trim()
    if (code) {
      const cleanPath = rawPath.replace(/^\/+/, '')
      const fileName = cleanPath.split('/').pop() || cleanPath
      filesMap[cleanPath] = {
        name: fileName,
        path: cleanPath,
        content: code,
        language: normalizeLanguage(rawLang),
      }
    }
  }

  // ----------------------------------------------------------------------------------
  // STRATEGY 2: Fenced Code Blocks with Filenames
  // Matches:
  // ```html index.html
  // ```css style.css
  // ```js filename="app.js"
  // ```typescript:src/main.ts
  // ----------------------------------------------------------------------------------
  const fencedBlockRegex = /(?:^|\n)(?:#{1,4}\s*(?:File:\s*)?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\s*\n+)?```([a-zA-Z0-9_-]+)(?:[:\s]+(?:file(?:name)?=)?["']?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)["']?)?[^\n]*\n([\s\S]*?)\n```/gi

  let fenceMatch: RegExpExecArray | null
  const fallbackBlocks: { lang: string; code: string; index: number }[] = []

  while ((fenceMatch = fencedBlockRegex.exec(content)) !== null) {
    const headerFilename = fenceMatch[1]?.trim()
    const rawLang = fenceMatch[2]?.trim() || ''
    const fenceFilename = fenceMatch[3]?.trim()
    const blockCode = fenceMatch[4] ? fenceMatch[4].trim() : ''

    if (!blockCode) continue

    let detectedName = headerFilename || fenceFilename

    // If no explicit filename in fence or header, check first 2 lines for comment
    if (!detectedName) {
      const lines = blockCode.split('\n').slice(0, 3)
      for (const line of lines) {
        const commentMatch =
          line.match(/<!--\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\s*-->/) ||
          line.match(/\/\*\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\s*\*\//) ||
          line.match(/\/\/\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/) ||
          line.match(/#\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/)

        if (commentMatch && commentMatch[1]) {
          detectedName = commentMatch[1].trim()
          break
        }
      }
    }

    if (detectedName) {
      const cleanPath = detectedName.replace(/^\/+/, '')
      const fileName = cleanPath.split('/').pop() || cleanPath
      const ext = fileName.includes('.') ? fileName.split('.').pop()! : defaultExtensionForLang(rawLang)
      filesMap[cleanPath] = {
        name: fileName,
        path: cleanPath,
        content: blockCode,
        language: normalizeLanguage(rawLang || ext),
      }
    } else {
      // Keep for heuristic fallback
      fallbackBlocks.push({
        lang: normalizeLanguage(rawLang),
        code: blockCode,
        index: fenceMatch.index,
      })
    }
  }

  // ----------------------------------------------------------------------------------
  // STRATEGY 3: Heuristic Grouping
  // If we found unlabeled code blocks, intelligently map them:
  // e.g. User prompted for a Todo App, model emitted an HTML block, a CSS block, and a JS block
  // ----------------------------------------------------------------------------------
  if (fallbackBlocks.length > 0) {
    const hasHtml = fallbackBlocks.some((b) => b.lang === 'html' || b.code.includes('<!DOCTYPE') || b.code.includes('<html'))
    const hasCss = fallbackBlocks.some((b) => b.lang === 'css' || (b.code.includes('{') && b.code.includes(':') && !b.code.includes('function') && !b.code.includes('<')))
    const hasJs = fallbackBlocks.some((b) => ['javascript', 'typescript', 'js', 'ts'].includes(b.lang) || b.code.includes('document.get') || b.code.includes('addEventListener'))

    if (hasHtml || (hasCss && hasJs)) {
      let htmlAssigned = Boolean(filesMap['index.html'])
      let cssAssigned = Boolean(filesMap['style.css'])
      let jsAssigned = Boolean(filesMap['script.js'])

      for (const block of fallbackBlocks) {
        if (!htmlAssigned && (block.lang === 'html' || block.code.includes('<!DOCTYPE') || block.code.includes('<html') || (block.code.includes('<div') && block.code.includes('</div>')))) {
          filesMap['index.html'] = {
            name: 'index.html',
            path: 'index.html',
            content: block.code,
            language: 'html',
          }
          htmlAssigned = true
        } else if (!cssAssigned && (block.lang === 'css' || (!block.code.includes('<') && block.code.includes('{') && block.code.includes('margin')))) {
          filesMap['style.css'] = {
            name: 'style.css',
            path: 'style.css',
            content: block.code,
            language: 'css',
          }
          cssAssigned = true
        } else if (!jsAssigned && (['javascript', 'js'].includes(block.lang) || (!block.code.includes('<') && (block.code.includes('function') || block.code.includes('const ') || block.code.includes('let '))))) {
          filesMap['script.js'] = {
            name: 'script.js',
            path: 'script.js',
            content: block.code,
            language: 'javascript',
          }
          jsAssigned = true
        }
      }
    }
  }

  const fileKeys = Object.keys(filesMap)
  if (fileKeys.length === 0) {
    return null
  }

  // Determine entry point
  let entryPoint = 'index.html'
  if (!filesMap['index.html']) {
    const htmlFile = fileKeys.find((k) => k.endsWith('.html'))
    if (htmlFile) {
      entryPoint = htmlFile
    } else {
      const pyFile = fileKeys.find((k) => k.endsWith('.py'))
      if (pyFile) {
        entryPoint = pyFile
      } else {
        entryPoint = fileKeys[0]
      }
    }
  }

  // Infer title
  let inferredTitle = suggestedTitle || 'Interactive Application'
  if (filesMap['index.html']) {
    const titleMatch = filesMap['index.html'].content.match(/<title>([^<]+)<\/title>/i)
    if (titleMatch && titleMatch[1].trim()) {
      inferredTitle = titleMatch[1].trim()
    }
  }

  const isMultiFile = fileKeys.length >= 2
  const isInteractiveApp =
    Boolean(filesMap['index.html']) ||
    fileKeys.some((k) => k.endsWith('.html') || k.endsWith('.jsx') || k.endsWith('.tsx'))

  return {
    title: inferredTitle,
    entryPoint,
    files: filesMap,
    isMultiFile,
    isInteractiveApp,
  }
}

/**
 * Converts ParsedProjectResult into a persistent VirtualProject object.
 */
export function createVirtualProjectFromParsed(
  parsed: ParsedProjectResult,
  options?: { chatId?: string; messageId?: string; projectId?: string }
): VirtualProject {
  const now = new Date().toISOString()
  const id = options?.projectId || 'vproj-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6)

  const virtualFiles: Record<string, VirtualFile> = {}
  for (const [path, file] of Object.entries(parsed.files)) {
    virtualFiles[path] = {
      id: 'vfile-' + Math.random().toString(36).substring(2, 8),
      name: file.name,
      path: file.path,
      content: file.content,
      language: file.language,
      size: new Blob([file.content]).size,
      updatedAt: now,
    }
  }

  return {
    id,
    title: parsed.title,
    entryPoint: parsed.entryPoint,
    files: virtualFiles,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    chatId: options?.chatId,
    messageId: options?.messageId,
    version: 1,
  }
}
