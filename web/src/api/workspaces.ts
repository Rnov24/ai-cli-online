import { API_BASE, authHeaders } from './client';
import { parseResponse, sessionApi } from './apiClient';

export interface Workspace {
  id: string;
  name: string;
  path: string;
  isHome: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspacesPayload {
  home: string;
  activeWorkspaceId: string;
  activePath: string;
  isHome: boolean;
  mode: 'agentic-assistant' | 'coding-agent';
  workspaces: Workspace[];
}

export interface WorkspaceModePayload {
  cwd: string;
  isHome: boolean;
  mode: 'agentic-assistant' | 'coding-agent';
  workspaceName: string;
}

export async function fetchWorkspaces(token: string): Promise<WorkspacesPayload> {
  const res = await fetch(`${API_BASE}/api/workspaces`, {
    headers: authHeaders(token),
  });
  return parseResponse<WorkspacesPayload>(res);
}

export async function createWorkspace(
  token: string,
  path: string,
  name?: string,
): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/api/workspaces`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, name }),
  });
  return parseResponse<Workspace>(res);
}

export async function deleteWorkspace(
  token: string,
  id: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  return parseResponse<{ ok: boolean }>(res);
}

export async function switchSessionWorkspace(
  token: string,
  sessionId: string,
  workspaceId: string,
  path?: string,
): Promise<WorkspaceModePayload> {
  return sessionApi.post<WorkspaceModePayload>(token, sessionId, 'switch-workspace', { workspaceId, path });
}

export async function fetchWorkspaceMode(
  token: string,
  sessionId: string,
): Promise<WorkspaceModePayload> {
  return sessionApi.get<WorkspaceModePayload>(token, sessionId, 'workspace-mode');
}
