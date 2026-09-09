import { API_BASE, authHeaders } from './client';
import { parseResponse } from './apiClient';
import type { SystemStatus } from 'agy-online-shared';

export async function fetchSystemStatus(token: string): Promise<SystemStatus> {
  const res = await fetch(`${API_BASE}/api/system/status`, {
    headers: authHeaders(token),
  });
  return parseResponse<SystemStatus>(res);
}

export interface ProcessItem {
  sessionName: string;
  mode: string;
  cwd: string;
  connected: boolean;
}

export interface SystemLogEntry {
  timestamp: number;
  level: string;
  message: string;
}

export async function fetchProcessList(token: string): Promise<{ ok: boolean; processes: ProcessItem[] }> {
  const res = await fetch(`${API_BASE}/api/system/processes`, {
    headers: authHeaders(token),
  });
  return parseResponse(res);
}

export async function fetchSystemLogs(token: string): Promise<{ ok: boolean; logs: SystemLogEntry[] }> {
  const res = await fetch(`${API_BASE}/api/system/logs`, {
    headers: authHeaders(token),
  });
  return parseResponse(res);
}

