import { supabase } from './supabase'
import type { Chat, Message, ModelId, TaskType } from '../types'

interface DbChatRow {
  id: string
  user_id: string
  title: string
  model: string | null
  pinned: boolean
  created_at: string
  updated_at: string
}

interface DbMessageRow {
  id: string
  chat_id: string
  user_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model_used: string | null
  task_type: string | null
  sources: any
  files: any
  tokens_used: number | null
  latency_ms: number | null
  created_at: string
}

/**
 * Fetch all chats and messages for a specific authenticated user.
 */
export async function fetchUserChats(userId: string): Promise<Chat[]> {
  try {
    // 1. Fetch chats for this user
    const { data: chatsData, error: chatsError } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (chatsError) {
      console.error('Error fetching user chats from Supabase:', chatsError)
      return []
    }

    if (!chatsData || chatsData.length === 0) {
      return []
    }

    // 2. Fetch all messages belonging to this user
    const { data: messagesData, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (messagesError) {
      console.error('Error fetching user messages from Supabase:', messagesError)
    }

    // Group messages by chat_id
    const messagesByChatId: Record<string, Message[]> = {}
    if (messagesData) {
      for (const row of messagesData as DbMessageRow[]) {
        if (!messagesByChatId[row.chat_id]) {
          messagesByChatId[row.chat_id] = []
        }
        messagesByChatId[row.chat_id].push({
          id: row.id,
          role: row.role,
          content: row.content || '',
          timestamp: row.created_at,
          modelUsed: (row.model_used as ModelId) || undefined,
          taskType: (row.task_type as TaskType) || undefined,
          sources: row.sources || undefined,
          files: row.files || undefined,
          tokensUsed: row.tokens_used ?? undefined,
          latencyMs: row.latency_ms ?? undefined,
        })
      }
    }

    // Map into Chat model
    const chats: Chat[] = (chatsData as DbChatRow[]).map((c) => ({
      id: c.id,
      title: c.title || 'New conversation',
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      model: (c.model as ModelId) || 'qwen3:8b',
      pinned: !!c.pinned,
      messages: messagesByChatId[c.id] || [],
    }))

    return chats
  } catch (err) {
    console.error('fetchUserChats exception:', err)
    return []
  }
}

/**
 * Save or update a chat in Supabase
 */
export async function saveChatToDb(chat: Chat, userId: string): Promise<void> {
  try {
    const { error } = await supabase.from('chats').upsert({
      id: chat.id,
      user_id: userId,
      title: chat.title,
      model: chat.model || 'qwen3:8b',
      pinned: !!chat.pinned,
      created_at: typeof chat.createdAt === 'string' ? chat.createdAt : new Date(chat.createdAt).toISOString(),
      updated_at: typeof chat.updatedAt === 'string' ? chat.updatedAt : new Date(chat.updatedAt).toISOString(),
    })

    if (error) {
      console.error('Failed to save chat to Supabase:', error)
    }
  } catch (err) {
    console.error('saveChatToDb error:', err)
  }
}

/**
 * Save or update a message in Supabase
 */
export async function saveMessageToDb(
  chatId: string,
  message: Message,
  userId: string
): Promise<void> {
  try {
    const { error } = await supabase.from('messages').upsert({
      id: message.id,
      chat_id: chatId,
      user_id: userId,
      role: message.role,
      content: message.content || '',
      model_used: message.modelUsed || null,
      task_type: message.taskType || null,
      sources: message.sources ? JSON.parse(JSON.stringify(message.sources)) : null,
      files: message.files ? JSON.parse(JSON.stringify(message.files)) : null,
      tokens_used: message.tokensUsed ?? null,
      latency_ms: message.latencyMs ?? null,
      created_at:
        typeof message.timestamp === 'string'
          ? message.timestamp
          : new Date(message.timestamp).toISOString(),
    })

    if (error) {
      console.error('Failed to save message to Supabase:', error)
    }
  } catch (err) {
    console.error('saveMessageToDb error:', err)
  }
}

/**
 * Delete a chat from Supabase (messages cascade delete)
 */
export async function deleteChatFromDb(chatId: string, userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('chats')
      .delete()
      .eq('id', chatId)
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to delete chat from Supabase:', error)
    }
  } catch (err) {
    console.error('deleteChatFromDb error:', err)
  }
}

/**
 * Delete a single message from Supabase
 */
export async function deleteMessageFromDb(messageId: string, userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('user_id', userId)

    if (error) {
      console.error('Failed to delete message from Supabase:', error)
    }
  } catch (err) {
    console.error('deleteMessageFromDb error:', err)
  }
}
