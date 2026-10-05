/**
 * High-performance client-side file and document processing service.
 * Handles instant image base64 extraction for multimodal vision models (Qwen2.5-VL)
 * and browser-native PDF/document text extraction without external server dependencies.
 */

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
  const lines: string[] = []
  let currentLine: string[] = []

  // Operator 1: Array of strings [(str1) -10 (str2)] TJ
  const tjArrayRegex = /\[(.*?)\]\s*TJ/gs
  let m: RegExpExecArray | null
  while ((m = tjArrayRegex.exec(content)) !== null) {
    const inner = m[1]
    const stringParts: string[] = []
    
    // Extract parenthesized literals
    const parenRegex = /\((.*?)(?<!\\)\)/gs
    let pm: RegExpExecArray | null
    while ((pm = parenRegex.exec(inner)) !== null) {
      stringParts.push(decodePdfString(pm[1]))
    }

    // Extract hex literals <...>
    const hexRegex = /<([0-9A-Fa-f\s]+)>/g
    let hm: RegExpExecArray | null
    while ((hm = hexRegex.exec(inner)) !== null) {
      stringParts.push(decodeHexPdfString(hm[1]))
    }

    if (stringParts.length > 0) {
      currentLine.push(stringParts.join(''))
    }
  }

  // Operator 2: Single string literal (str) Tj or ' or "
  const tjRegex = /\((.*?)(?<!\\)\)\s*(?:Tj|'|")/gs
  while ((m = tjRegex.exec(content)) !== null) {
    currentLine.push(decodePdfString(m[1]))
  }

  // Operator 3: Single hex string <hex> Tj
  const tjHexRegex = /<([0-9A-Fa-f\s]+)>\s*(?:Tj|'|")/g
  while ((m = tjHexRegex.exec(content)) !== null) {
    const dec = decodeHexPdfString(m[1])
    if (dec.trim()) currentLine.push(dec)
  }

  if (currentLine.length > 0) {
    lines.push(currentLine.join(' '))
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

    if (decompressedStr) {
      const parsed = parsePdfContentStream(decompressedStr)
      if (parsed.trim()) {
        extractedSections.push(parsed.trim())
      }
    }
  }

  // Fallback: If stream-based extraction found nothing, check for uncompressed literal text in whole file
  if (extractedSections.length === 0) {
    const rawParsed = parsePdfContentStream(fullStr)
    if (rawParsed.trim()) {
      extractedSections.push(rawParsed.trim())
    }
  }

  return extractedSections.join('\n\n').trim()
}

/**
 * Extracts raw base64 string (without data:image/... prefix) from an image File/Blob.
 */
export async function extractImageBase64(file: File | Blob): Promise<string> {
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
      result.extractedText = text || `[Attached PDF: ${name} (Binary/scanned document, ${file.size} bytes)]`
    } else if (isText) {
      result.extractedText = await readTextFile(file)
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
