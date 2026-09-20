/**
 * ZINGO — Canvas Fuzzy Search-and-Replace Diff Engine
 * ===================================================
 * Enables surgical in-place code edits without full-file regeneration.
 * 
 * Protocol:
 * <<<<<<< SEARCH
 * [exact or near-exact code to find]
 * =======
 * [replacement code to splice in]
 * >>>>>>> REPLACE
 */

export interface DiffPatch {
  filePath?: string
  search: string
  replace: string
  rawBlock: string
}

export interface PatchResult {
  success: boolean
  updatedContent: string
  appliedCount: number
  errors: string[]
}

/**
 * Extracts all SEARCH/REPLACE blocks from model output, optionally detecting target filenames.
 */
export function extractPatches(text: string): DiffPatch[] {
  if (!text || typeof text !== 'string') return []

  const patches: DiffPatch[] = []
  // Regex to match: (Optional filename header) <<<<<<< SEARCH\n(searchContent)\n=======\n(replaceContent)\n>>>>>>> REPLACE
  const patchRegex = /(?:(?:###|#|\/\/|<!--|\/\*)\s*(?:File:\s*)?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)[^\n]*\n+)?<{7}\s*SEARCH\s*\n([\s\S]*?)\n={7}\s*\n([\s\S]*?)\n>{7}\s*REPLACE/gi

  let match: RegExpExecArray | null
  while ((match = patchRegex.exec(text)) !== null) {
    const filePath = match[1]?.trim()
    const search = match[2]
    const replace = match[3]
    const rawBlock = match[0]

    patches.push({
      filePath,
      search,
      replace,
      rawBlock,
    })
  }

  return patches
}

/**
 * Checks whether a text contains search/replace diff markers.
 */
export function hasSearchReplaceDiffs(text: string): boolean {
  if (!text) return false
  return text.includes('<<<<<<< SEARCH') && text.includes('=======') && text.includes('>>>>>>> REPLACE')
}

/**
 * Applies a single SEARCH/REPLACE block to target content using a 3-tier matching strategy:
 * Tier 1: Exact match.
 * Tier 2: Line-trimmed normalized match.
 * Tier 3: Indentation-tolerant matching.
 */
export function applySinglePatch(
  content: string,
  search: string,
  replace: string
): { success: boolean; result: string; error?: string } {
  if (!content) {
    return { success: false, result: content, error: 'Target content is empty' }
  }

  // Tier 1: Exact literal match
  if (content.includes(search)) {
    return {
      success: true,
      result: content.replace(search, replace),
    }
  }

  // Tier 2: Normalize line endings (\r\n -> \n) and trailing whitespace
  const normalizedContent = content.replace(/\r\n/g, '\n')
  const normalizedSearch = search.replace(/\r\n/g, '\n')

  const searchLines = normalizedSearch.split('\n').map((l) => l.trimEnd())
  const contentLines = normalizedContent.split('\n')

  // Slide a window over content lines to find a match
  const searchLen = searchLines.length
  let matchedLineIdx = -1

  for (let i = 0; i <= contentLines.length - searchLen; i++) {
    let match = true
    for (let j = 0; j < searchLen; j++) {
      if (contentLines[i + j].trimEnd() !== searchLines[j]) {
        match = false
        break
      }
    }
    if (match) {
      matchedLineIdx = i
      break
    }
  }

  if (matchedLineIdx !== -1) {
    // Determine the base indentation of the matched original block
    const originalLeadingWhitespace = contentLines[matchedLineIdx].match(/^\s*/)?.[0] || ''
    const searchLeadingWhitespace = searchLines[0].match(/^\s*/)?.[0] || ''

    // If replacement indentation needs alignment
    const replaceLines = replace.replace(/\r\n/g, '\n').split('\n')
    const adjustedReplaceLines = replaceLines.map((line) => {
      if (!line.trim()) return line
      if (searchLeadingWhitespace && line.startsWith(searchLeadingWhitespace)) {
        return originalLeadingWhitespace + line.slice(searchLeadingWhitespace.length)
      }
      return line
    })

    const newContentLines = [
      ...contentLines.slice(0, matchedLineIdx),
      ...adjustedReplaceLines,
      ...contentLines.slice(matchedLineIdx + searchLen),
    ]

    return {
      success: true,
      result: newContentLines.join('\n'),
    }
  }

  // Tier 3: Leading & trailing trimmed match
  const searchTrimmed = search.trim()
  for (let i = 0; i <= contentLines.length - searchLen; i++) {
    const chunk = contentLines.slice(i, i + searchLen).join('\n').trim()
    if (chunk === searchTrimmed) {
      const replaceLines = replace.replace(/\r\n/g, '\n').split('\n')
      const newContentLines = [
        ...contentLines.slice(0, i),
        ...replaceLines,
        ...contentLines.slice(i + searchLen),
      ]
      return {
        success: true,
        result: newContentLines.join('\n'),
      }
    }
  }

  return {
    success: false,
    result: content,
    error: `Could not locate SEARCH block in target file (${searchLines[0].slice(0, 40)}...)`,
  }
}

/**
 * Applies all extracted patches in sequence to target file content.
 */
export function applyAllPatches(
  originalContent: string,
  patchTextOrPatches: string | DiffPatch[]
): PatchResult {
  const patches =
    typeof patchTextOrPatches === 'string'
      ? extractPatches(patchTextOrPatches)
      : patchTextOrPatches

  if (patches.length === 0) {
    return {
      success: false,
      updatedContent: originalContent,
      appliedCount: 0,
      errors: ['No valid <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE blocks found.'],
    }
  }

  let currentContent = originalContent
  let appliedCount = 0
  const errors: string[] = []

  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i]
    const res = applySinglePatch(currentContent, patch.search, patch.replace)
    if (res.success) {
      currentContent = res.result
      appliedCount++
    } else {
      errors.push(`Patch #${i + 1} failed: ${res.error || 'Block not found'}`)
    }
  }

  return {
    success: appliedCount > 0,
    updatedContent: currentContent,
    appliedCount,
    errors,
  }
}
