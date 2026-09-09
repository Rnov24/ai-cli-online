import type { ChatMessage } from 'agy-online-shared';

export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  updatedAt: number;
  createdAt: number;
  turnCount: number;
}

export interface ConversationsResponse {
  ok: boolean;
  conversations: ConversationSummary[];
  error?: string;
}

export interface ConversationMessagesResponse {
  ok: boolean;
  conversationId: string;
  messages: ChatMessage[];
  error?: string;
}

export async function fetchConversations(token: string): Promise<ConversationsResponse> {
  const res = await fetch('/api/agy/conversations', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch conversations: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchConversationMessages(token: string, conversationId: string): Promise<ConversationMessagesResponse> {
  const res = await fetch(`/api/agy/conversations/${encodeURIComponent(conversationId)}/messages`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch conversation messages: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteConversation(token: string, conversationId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/agy/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to delete conversation: ${res.statusText}`);
  }
  return res.json();
}
