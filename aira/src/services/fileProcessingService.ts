/**
 * High-performance client-side file and document processing service.
 * Handles instant image base64 extraction for multimodal vision models (Qwen2.5-VL)
 * and browser-native PDF/document text extraction without external server dependencies.
 */

// Helper: Check if an extracted string contains valid human-readable text
export function isReadableText(str: string): boolean {
  if (!str || str.trim().length === 0) return false
  // Reject null characters immediately
  if (str.includes('\0') || str.includes('\u0000')) return false
  let printableCount = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (
      (code >= 32 && code <= 126) ||
      code === 10 ||
      code === 13 ||
      code === 9 ||
      (code >= 160 && code <= 0x10ffff)
    ) {
      printableCount++
    }
  }
  return printableCount / str.length >= 0.85
}

// Helper: Decode PDF string escape sequences (e.g. \n, \r, \t, \(, \), \\, \040)
function decodePdfString(raw: string): string {
  return raw
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
}

// Helper: Decode PDF hex string e.g. <48656c6c6f> -> "Hello"
function decodeHexPdfString(hex: string): string {
  const cleanHex = hex.replace(/[^0-9A-Fa-f]/g, '')
  let str = ''
  for (let i = 0; i < cleanHex.length; i += 2) {
    const byte = parseInt(cleanHex.substring(i, i + 2), 16)
    if (!isNaN(byte) && byte >= 32 && byte <= 126) {
      str += String.fromCharCode(byte)
    } else if (byte === 10 || byte === 13 || byte === 9) {
      str += ' '
    }
  }
  return str
}

// Helper: Parse PDF text operators inside a decompressed content stream
function parsePdfContentStream(content: string): string {
  // Only extract from BT (Begin Text) ... ET (End Text) blocks
  const btEtRegex = /BT\s*(.*?)\s*ET/gs
  const blocks: string[] = []
  let bMatch: RegExpExecArray | null
  while ((bMatch = btEtRegex.exec(content)) !== null) {
    blocks.push(bMatch[1])
  }

  if (blocks.length === 0) return ''

  const lines: string[] = []

  for (const block of blocks) {
    const currentParts: string[] = []

    // Operator 1: Array of strings [(str1) -10 (str2)] TJ
    const tjArrayRegex = /\[(.*?)\]\s*TJ/gs
    let m: RegExpExecArray | null
    while ((m = tjArrayRegex.exec(block)) !== null) {
      const inner = m[1]
      const stringParts: string[] = []

      // Extract parenthesized literals
      const parenRegex = /\((.*?)(?<!\\)\)/gs
      let pm: RegExpExecArray | null
      while ((pm = parenRegex.exec(inner)) !== null) {
        const decoded = decodePdfString(pm[1])
        if (isReadableText(decoded)) stringParts.push(decoded)
      }

      // Extract hex literals <...>
      const hexRegex = /<([0-9A-Fa-f\s]+)>/g
      let hm: RegExpExecArray | null
      while ((hm = hexRegex.exec(inner)) !== null) {
        const dec = decodeHexPdfString(hm[1])
        if (isReadableText(dec)) stringParts.push(dec)
      }

      if (stringParts.length > 0) {
        currentParts.push(stringParts.join(''))
      }
    }

    // Operator 2: Single string literal (str) Tj or ' or "
    const tjRegex = /\((.*?)(?<!\\)\)\s*(?:Tj|'|")/gs
    while ((m = tjRegex.exec(block)) !== null) {
      const decoded = decodePdfString(m[1])
      if (isReadableText(decoded)) currentParts.push(decoded)
    }

    // Operator 3: Single hex string <hex> Tj
    const tjHexRegex = /<([0-9A-Fa-f\s]+)>\s*(?:Tj|'|")/g
    while ((m = tjHexRegex.exec(block)) !== null) {
      const dec = decodeHexPdfString(m[1])
      if (isReadableText(dec)) currentParts.push(dec)
    }

    if (currentParts.length > 0) {
      const lineText = currentParts.join(' ').trim()
      if (lineText && isReadableText(lineText)) {
        lines.push(lineText)
      }
    }
  }

  return lines.join('\n')
}

/**
 * Extracts all readable text from a PDF ArrayBuffer using browser-native DecompressionStream.
 */
export async function extractTextFromPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer)
  const latin1Decoder = new TextDecoder('latin1')
  const fullStr = latin1Decoder.decode(bytes)

  const extractedSections: string[] = []
  let searchPos = 0

  while (true) {
    const streamStart = fullStr.indexOf('stream', searchPos)
    if (streamStart === -1) break

    let contentStart = streamStart + 6
    if (fullStr[contentStart] === '\r') contentStart++
    if (fullStr[contentStart] === '\n') contentStart++

    let streamEnd = fullStr.indexOf('endstream', contentStart)
    if (streamEnd === -1) break
    searchPos = streamEnd + 9

    // Strip trailing newlines/carriage returns before endstream
    while (streamEnd > contentStart && (fullStr[streamEnd - 1] === '\r' || fullStr[streamEnd - 1] === '\n')) {
      streamEnd--
    }

    const streamBytes = bytes.slice(contentStart, streamEnd)

    // Attempt 1: Decompress with browser-native DecompressionStream('deflate')
    let decompressedStr = ''
    try {
      if (typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('deflate')
        const writer = ds.writable.getWriter()
        writer.write(streamBytes)
        writer.close()
        const response = new Response(ds.readable)
        const decomp = await response.arrayBuffer()
        decompressedStr = latin1Decoder.decode(new Uint8Array(decomp))
      }
    } catch {
      // Stream may be raw or uncompressed
    }

    if (!decompressedStr) {
      decompressedStr = latin1Decoder.decode(streamBytes)
    }

    // Only inspect streams that contain PDF text blocks (BT ... ET)
    if (decompressedStr && decompressedStr.includes('BT') && decompressedStr.includes('ET')) {
      const parsed = parsePdfContentStream(decompressedStr)
      if (parsed.trim() && isReadableText(parsed)) {
        extractedSections.push(parsed.trim())
      }
    }
  }

  // Fallback: If stream-based extraction found nothing, check for uncompressed literal text in whole file
  if (extractedSections.length === 0 && fullStr.includes('BT') && fullStr.includes('ET')) {
    const rawParsed = parsePdfContentStream(fullStr)
    if (rawParsed.trim() && isReadableText(rawParsed)) {
      extractedSections.push(rawParsed.trim())
    }
  }

  const combined = extractedSections.join('\n\n').trim()
  return isReadableText(combined) ? combined : ''
}

function readRawBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      if (result.includes(',')) {
        resolve(result.split(',')[1])
      } else {
        resolve(result)
      }
    }
    reader.onerror = (err) => reject(err)
    reader.readAsDataURL(file)
  })
}

/**
 * Extracts raw base64 string (without data:image/... prefix) from an image File/Blob.
 * Automatically downscales oversized retina / 4K images (>1536px) client-side to
 * prevent context overflow (4096 tokens limit) and reduce latency by ~10x,
 * while maintaining crystal-clear text readability for OCR and diagrams.
 */
export async function extractImageBase64(file: File | Blob, maxDimension = 1536): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return readRawBase64(file)
  }

  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file)
      let { width, height } = bitmap

      if (width <= maxDimension && height <= maxDimension && file.size < 1.5 * 1024 * 1024) {
        bitmap.close()
        return readRawBase64(file)
      }

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width)
          width = maxDimension
        } else {
          width = Math.round((width * maxDimension) / height)
          height = maxDimension
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        bitmap.close()
        return readRawBase64(file)
      }

      ctx.drawImage(bitmap, 0, 0, width, height)
      bitmap.close()

      const dataUrl = canvas.toDataURL('image/jpeg', 0.90)
      const base64 = dataUrl.split(',')[1] || ''
      return base64 || readRawBase64(file)
    }

    return readRawBase64(file)
  } catch {
    return readRawBase64(file)
  }
}

/**
 * Reads a text-based file (.txt, .md, .csv, .log, .json, .py, etc.) as plain text.
 */
export async function readTextFile(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string) || '')
    reader.onerror = (err) => reject(err)
    reader.readAsText(file)
  })
}

export interface ProcessedUploadedFile {
  name: string
  isImage: boolean
  isPdf: boolean
  isText: boolean
  base64Image?: string
  extractedText?: string
  sizeBytes: number
}

/**
 * Universally processes any uploaded file:
 * - Images are encoded to Base64 for multimodal vision (Qwen2.5-VL)
 * - PDFs have their full text extracted client-side
 * - Text/code files have their plain text read
 */
export async function processUserUploadedFile(file: File): Promise<ProcessedUploadedFile> {
  const name = file.name || 'uploaded_file'
  const mime = file.type || ''
  const ext = (name.split('.').pop() || '').toLowerCase()

  const isImage = mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg'].includes(ext)
  const isPdf = mime === 'application/pdf' || ext === 'pdf'
  const isText =
    mime.startsWith('text/') ||
    ['txt', 'md', 'csv', 'log', 'json', 'py', 'js', 'ts', 'tsx', 'jsx', 'html', 'css', 'sql', 'sh', 'yaml', 'yml'].includes(ext)

  const result: ProcessedUploadedFile = {
    name,
    isImage,
    isPdf,
    isText,
    sizeBytes: file.size,
  }

  try {
    if (isImage) {
      result.base64Image = await extractImageBase64(file)
    } else if (isPdf) {
      const buffer = await file.arrayBuffer()
      const text = await extractTextFromPdfBuffer(buffer)
      if (text && text.trim().length > 15 && isReadableText(text)) {
        result.extractedText = text.trim()
      } else {
        result.extractedText = undefined
      }
    } else if (isText) {
      const txt = await readTextFile(file)
      if (txt && isReadableText(txt)) {
        result.extractedText = txt
      }
    } else {
      // General fallback: try reading as text
      try {
        result.extractedText = await readTextFile(file)
      } catch {
        result.extractedText = `[Attached File: ${name} (${file.size} bytes)]`
      }
    }
  } catch (err: any) {
    console.warn(`[fileProcessingService] Error processing ${name}:`, err)
    if (isImage) {
      try {
        result.base64Image = await extractImageBase64(file)
      } catch {
        // failed image read
      }
    }
  }

  return result
}
