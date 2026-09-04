import { API_BASE, authHeaders } from './client';
import type { SystemStatus } from 'ai-cli-online-shared';

export async function fetchSystemStatus(token: string): Promise<SystemStatus> {
  const res = await fetch(`${API_BASE}/api/system/status`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch system status: ${res.statusText}`);
  }
  return res.json();
}
