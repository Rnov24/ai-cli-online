import { API_BASE, authHeaders } from './client';
import { parseResponse } from './apiClient';
import type { SystemStatus } from 'ai-cli-online-shared';

export async function fetchSystemStatus(token: string): Promise<SystemStatus> {
  const res = await fetch(`${API_BASE}/api/system/status`, {
    headers: authHeaders(token),
  });
  return parseResponse<SystemStatus>(res);
}
