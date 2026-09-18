import type { Chat } from '../types'

/**
 * Downloads a chat transcript as a clean, formatted Markdown file
 */
export function exportChatToMarkdown(chat: Chat): void {
  const dateStr = new Date(chat.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  let md = `# ${chat.title}\n\n`
  md += `**Date:** ${dateStr}  \n`
  md += `**Platform:** MRPL AIRA Sovereign Workbench  \n`
  md += `**Model:** ${chat.model}  \n\n`
  md += `---\n\n`

  chat.messages.forEach((msg, idx) => {
    const roleLabel = msg.role === 'user' ? 'User' : 'AIRA Assistant'
    const timestamp = new Date(msg.timestamp).toLocaleTimeString()
    md += `### ${roleLabel} (${timestamp})\n\n`
    md += `${msg.content}\n\n`

    if (msg.sources && msg.sources.length > 0) {
      md += `**Referenced Sources:**\n`
      msg.sources.forEach((s) => {
        md += `- **${s.title}** (${s.document}, p.${s.page || 1}) — ${(s.relevanceScore * 100).toFixed(0)}% match\n`
      })
      md += `\n`
    }

    if (idx < chat.messages.length - 1) {
      md += `---\n\n`
    }
  })

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${chat.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_aira.md`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Downloads chat data as JSON
 */
export function exportChatToJson(chat: Chat): void {
  const jsonStr = JSON.stringify(chat, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${chat.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_aira.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Copies full dialogue transcript to clipboard
 */
export async function copyChatTranscript(chat: Chat): Promise<boolean> {
  let transcript = `AIRA Conversation Transcript: ${chat.title}\n`
  transcript += `===========================================\n\n`

  chat.messages.forEach((msg) => {
    const sender = msg.role === 'user' ? 'USER' : 'AIRA'
    transcript += `[${sender} - ${new Date(msg.timestamp).toLocaleTimeString()}]:\n`
    transcript += `${msg.content}\n\n`
  })

  try {
    await navigator.clipboard.writeText(transcript)
    return true
  } catch {
    return false
  }
}
