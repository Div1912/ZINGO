/**
 * ZINGO — Sovereign Client-Side PowerPoint (.pptx) Compiler
 * =========================================================
 * Translates AI-generated slide decks and JSON presentation manifests into
 * native, fully editable Microsoft PowerPoint (.pptx) binary files inside
 * the user's browser with 0% server overhead and 100% data privacy.
 */

import pptxgen from 'pptxgenjs'
import type { VirtualProject } from '../types/project'

export interface SlideCard {
  title?: string
  stat?: string
  description: string
}

export interface SlideDefinition {
  title: string
  subtitle?: string
  layout?: 'title' | 'kpi_metrics' | 'card_grid' | 'timeline' | 'bullets' | 'standard'
  bullets?: string[]
  cards?: SlideCard[]
  takeaway?: string
}

export interface PresentationManifest {
  title: string
  author?: string
  date?: string
  theme?: 'dark' | 'light'
  slides: SlideDefinition[]
}

/**
 * Parses presentation structure from project files.
 * Prefers deck_manifest.json if present; otherwise parses index.html slides heuristically.
 */
export function extractPresentationManifest(project: VirtualProject): PresentationManifest | null {
  if (!project || !project.files) return null

  // 1. Check for explicit deck_manifest.json
  const manifestFile = project.files['deck_manifest.json'] || project.files['presentation.json']
  if (manifestFile) {
    try {
      const parsed = JSON.parse(manifestFile.content)
      if (parsed.slides && Array.isArray(parsed.slides)) {
        return {
          title: parsed.title || project.title || 'Executive Presentation',
          author: parsed.author || 'ZINGO Sovereign Intelligence',
          date: parsed.date || new Date().toLocaleDateString(),
          theme: parsed.theme || 'dark',
          slides: parsed.slides,
        }
      }
    } catch (e) {
      console.warn('[pptxExport] Failed to parse deck_manifest.json:', e)
    }
  }

  // 2. Heuristic fallback: inspect index.html for slide elements
  const htmlFile = project.files['index.html']
  if (htmlFile && (htmlFile.content.includes('class="slide') || htmlFile.content.includes('data-slide'))) {
    const slides: SlideDefinition[] = []
    const slideMatches = htmlFile.content.matchAll(/<(?:section|div)[^>]*class="[^"]*slide[^"]*"[^>]*>([\s\S]*?)<\/(?:section|div)>/gi)

    for (const match of slideMatches) {
      const block = match[1]
      const titleMatch = block.match(/<h[12][^>]*>(.*?)<\/h[12]>/i)
      const subMatch = block.match(/<h[34][^>]*>(.*?)<\/h[34]>/i)
      const bulletMatches = [...block.matchAll(/<li[^>]*>(.*?)<\/li>/gi)].map((m) =>
        m[1].replace(/<[^>]+>/g, '').trim()
      )

      if (titleMatch) {
        slides.push({
          title: titleMatch[1].replace(/<[^>]+>/g, '').trim(),
          subtitle: subMatch ? subMatch[1].replace(/<[^>]+>/g, '').trim() : undefined,
          layout: bulletMatches.length > 0 ? 'bullets' : 'standard',
          bullets: bulletMatches.length > 0 ? bulletMatches : undefined,
        })
      }
    }

    if (slides.length > 0) {
      return {
        title: project.title || 'Executive Presentation',
        author: 'ZINGO Sovereign Intelligence',
        date: new Date().toLocaleDateString(),
        theme: 'dark',
        slides,
      }
    }
  }

  return null
}

/**
 * Checks if a project contains a presentation slide deck.
 */
export function isPresentationProject(project?: VirtualProject | null): boolean {
  if (!project || !project.files) return false
  if (project.files['deck_manifest.json'] || project.files['presentation.json']) return true
  const html = project.files['index.html']?.content || ''
  return html.includes('class="slide') || html.includes('data-slide') || html.includes('class="presentation')
}

/**
 * Compiles and downloads a native Microsoft PowerPoint (.pptx) file from a PresentationManifest.
 */
export async function exportManifestToPptx(manifest: PresentationManifest): Promise<string> {
  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_16x9'
  pptx.title = manifest.title

  const isDark = manifest.theme !== 'light'

  // Corporate Color Palette (Hex without #)
  const colors = isDark
    ? {
        bg: '0B0F19', // Deep Slate
        cardBg: '1E293B', // Slate 800
        cardBorder: '334155', // Slate 700
        textPrimary: 'F8FAFC', // Crisp White
        textSecondary: '94A3B8', // Muted Slate
        accent: '6366F1', // Electric Indigo
        metric: '10B981', // Emerald
      }
    : {
        bg: 'FFFFFF',
        cardBg: 'F8FAFC',
        cardBorder: 'E2E8F0',
        textPrimary: '0F172A',
        textSecondary: '475569',
        accent: '4F46E5',
        metric: '059669',
      }

  // Iterate and compile each slide
  for (let i = 0; i < manifest.slides.length; i++) {
    const sDef = manifest.slides[i]
    const slide = pptx.addSlide()

    // 1. Background
    slide.background = { color: colors.bg }

    // 2. Header / Category tag
    slide.addText(`ZINGO EXECUTIVE BRIEFING  |  SLIDE ${i + 1} OF ${manifest.slides.length}`, {
      x: 0.8,
      y: 0.4,
      w: 8.0,
      h: 0.3,
      fontSize: 9,
      fontFace: 'Arial',
      color: colors.accent,
      bold: true,
    })

    // Layout A: Title / Cover Slide
    if (sDef.layout === 'title' || i === 0) {
      slide.addText(sDef.title, {
        x: 0.8,
        y: 1.8,
        w: 11.5,
        h: 2.0,
        fontSize: 36,
        fontFace: 'Arial',
        color: colors.textPrimary,
        bold: true,
        valign: 'middle',
      })

      if (sDef.subtitle) {
        slide.addText(sDef.subtitle, {
          x: 0.8,
          y: 4.0,
          w: 11.5,
          h: 1.0,
          fontSize: 18,
          fontFace: 'Arial',
          color: colors.textSecondary,
        })
      }

      // Metadata pill
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.8,
        y: 5.5,
        w: 5.0,
        h: 0.6,
        fill: { color: colors.cardBg },
        line: { color: colors.cardBorder, width: 1 },
        rectRadius: 0.1,
      })

      slide.addText(`${manifest.author || 'ZINGO Engine'}  •  ${manifest.date || new Date().toLocaleDateString()}`, {
        x: 1.0,
        y: 5.5,
        w: 4.6,
        h: 0.6,
        fontSize: 11,
        fontFace: 'Arial',
        color: colors.textSecondary,
        valign: 'middle',
      })

      continue
    }

    // Slide Header (Title + Subtitle) for content slides
    slide.addText(sDef.title, {
      x: 0.8,
      y: 0.8,
      w: 11.5,
      h: 0.8,
      fontSize: 24,
      fontFace: 'Arial',
      color: colors.textPrimary,
      bold: true,
    })

    if (sDef.subtitle) {
      slide.addText(sDef.subtitle, {
        x: 0.8,
        y: 1.6,
        w: 11.5,
        h: 0.5,
        fontSize: 13,
        fontFace: 'Arial',
        color: colors.textSecondary,
      })
    }

    const contentStartY = sDef.subtitle ? 2.3 : 1.8

    // Layout B: KPI Metrics (3 or 4 Cards)
    if (sDef.layout === 'kpi_metrics' && sDef.cards && sDef.cards.length > 0) {
      const cardCount = Math.min(sDef.cards.length, 4)
      const gap = 0.4
      const totalWidth = 11.5
      const cardWidth = (totalWidth - gap * (cardCount - 1)) / cardCount
      const cardHeight = 3.8

      sDef.cards.slice(0, cardCount).forEach((card, idx) => {
        const cardX = 0.8 + idx * (cardWidth + gap)

        // Card Container Shape
        slide.addShape(pptx.ShapeType.roundRect, {
          x: cardX,
          y: contentStartY,
          w: cardWidth,
          h: cardHeight,
          fill: { color: colors.cardBg },
          line: { color: colors.cardBorder, width: 1 },
          rectRadius: 0.15,
        })

        // Big Metric Number
        if (card.stat) {
          slide.addText(card.stat, {
            x: cardX + 0.2,
            y: contentStartY + 0.3,
            w: cardWidth - 0.4,
            h: 1.2,
            fontSize: 34,
            fontFace: 'Arial',
            color: colors.metric,
            bold: true,
            align: 'center',
            valign: 'middle',
          })
        }

        // Card Title
        if (card.title) {
          slide.addText(card.title, {
            x: cardX + 0.2,
            y: contentStartY + (card.stat ? 1.6 : 0.4),
            w: cardWidth - 0.4,
            h: 0.6,
            fontSize: 14,
            fontFace: 'Arial',
            color: colors.textPrimary,
            bold: true,
            align: 'center',
          })
        }

        // Card Description
        slide.addText(card.description, {
          x: cardX + 0.2,
          y: contentStartY + (card.stat ? 2.2 : 1.1),
          w: cardWidth - 0.4,
          h: 1.4,
          fontSize: 11,
          fontFace: 'Arial',
          color: colors.textSecondary,
          align: 'center',
          valign: 'top',
        })
      })

      continue
    }

    // Layout C: Structured Card Grid / Timeline
    if ((sDef.layout === 'card_grid' || sDef.layout === 'timeline') && sDef.cards && sDef.cards.length > 0) {
      const cardCount = Math.min(sDef.cards.length, 3)
      const gap = 0.5
      const cardWidth = (11.5 - gap * (cardCount - 1)) / cardCount
      const cardHeight = 4.0

      sDef.cards.slice(0, cardCount).forEach((card, idx) => {
        const cardX = 0.8 + idx * (cardWidth + gap)

        // Step number badge for timeline
        if (sDef.layout === 'timeline') {
          slide.addShape(pptx.ShapeType.ellipse, {
            x: cardX + cardWidth / 2 - 0.3,
            y: contentStartY - 0.1,
            w: 0.6,
            h: 0.6,
            fill: { color: colors.accent },
          })
          slide.addText(String(idx + 1), {
            x: cardX + cardWidth / 2 - 0.3,
            y: contentStartY - 0.1,
            w: 0.6,
            h: 0.6,
            fontSize: 12,
            fontFace: 'Arial',
            color: 'FFFFFF',
            bold: true,
            align: 'center',
            valign: 'middle',
          })
        }

        slide.addShape(pptx.ShapeType.roundRect, {
          x: cardX,
          y: contentStartY + (sDef.layout === 'timeline' ? 0.7 : 0),
          w: cardWidth,
          h: cardHeight - (sDef.layout === 'timeline' ? 0.7 : 0),
          fill: { color: colors.cardBg },
          line: { color: colors.cardBorder, width: 1 },
          rectRadius: 0.15,
        })

        if (card.title) {
          slide.addText(card.title, {
            x: cardX + 0.3,
            y: contentStartY + (sDef.layout === 'timeline' ? 0.9 : 0.3),
            w: cardWidth - 0.6,
            h: 0.6,
            fontSize: 15,
            fontFace: 'Arial',
            color: colors.textPrimary,
            bold: true,
          })
        }

        slide.addText(card.description, {
          x: cardX + 0.3,
          y: contentStartY + (sDef.layout === 'timeline' ? 1.5 : 1.0),
          w: cardWidth - 0.6,
          h: 2.2,
          fontSize: 12,
          fontFace: 'Arial',
          color: colors.textSecondary,
          valign: 'top',
        })
      })

      continue
    }

    // Layout D: Bullets + Executive Takeaway Banner (Standard)
    if (sDef.bullets && sDef.bullets.length > 0) {
      const bulletItems = sDef.bullets.map((b) => ({
        text: b,
        options: { fontSize: 13, color: colors.textPrimary, breakLine: true },
      }))

      slide.addText(bulletItems, {
        x: 0.8,
        y: contentStartY,
        w: sDef.takeaway ? 7.5 : 11.5,
        h: 4.0,
        bullet: { type: 'bullet', code: '25AA' },
        lineSpacing: 28,
        valign: 'top',
      })

      // Right-hand callout card if takeaway is defined
      if (sDef.takeaway) {
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 8.7,
          y: contentStartY,
          w: 3.6,
          h: 3.8,
          fill: { color: colors.cardBg },
          line: { color: colors.accent, width: 1.5 },
          rectRadius: 0.15,
        })

        slide.addText('STRATEGIC TAKEAWAY', {
          x: 9.0,
          y: contentStartY + 0.3,
          w: 3.0,
          h: 0.4,
          fontSize: 10,
          fontFace: 'Arial',
          color: colors.accent,
          bold: true,
        })

        slide.addText(sDef.takeaway, {
          x: 9.0,
          y: contentStartY + 0.8,
          w: 3.0,
          h: 2.6,
          fontSize: 12,
          fontFace: 'Arial',
          color: colors.textPrimary,
          valign: 'middle',
        })
      }
    }
  }

  // Trigger browser download
  const safeFilename = manifest.title.replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase() || 'presentation'
  const fullFileName = `${safeFilename}.pptx`
  await pptx.writeFile({ fileName: fullFileName })
  return fullFileName
}

/**
 * High-level export function accepting a VirtualProject.
 */
export async function exportVirtualProjectToPptx(project: VirtualProject): Promise<string> {
  const manifest = extractPresentationManifest(project)
  if (!manifest) {
    throw new Error('Project does not contain a recognizable slide deck or deck_manifest.json.')
  }
  return await exportManifestToPptx(manifest)
}
