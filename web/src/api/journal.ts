import { API_BASE, authHeaders } from './client';
import { parseResponse } from './apiClient';

export interface TurnJournalItem {
  id: string;
  sessionName: string;
  conversationId: string;
  prompt: string;
  status: 'submitted' | 'running' | 'completed' | 'interrupted' | 'error';
  fullResponse: string;
  toolCalls: string;
  errorMessage: string;
  durationSeconds: number;
  totalTokens: number;
  createdAt: number;
  updatedAt: number;
}

export async function fetchSessionJournal(token: string, sessionId: string): Promise<{ ok: boolean; turns: TurnJournalItem[] }> {
  const res = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/journal`, {
    headers: authHeaders(token),
  });
  return parseResponse(res);
}

export async function recoverSessionJournal(token: string, sessionId: string): Promise<{ ok: boolean; recovered: number }> {
  const res = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/journal/recover`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  return parseResponse(res);
}
