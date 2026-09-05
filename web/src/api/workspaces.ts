import { API_BASE } from './client';

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
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch workspaces: HTTP ${res.status}`);
  }
  return res.json();
}

export async function createWorkspace(
  token: string,
  path: string,
  name?: string,
): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/api/workspaces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path, name }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(errData.error || 'Failed to create workspace');
  }
  return res.json();
}

export async function deleteWorkspace(
  token: string,
  id: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(errData.error || 'Failed to delete workspace');
  }
  return res.json();
}

export async function switchSessionWorkspace(
  token: string,
  sessionId: string,
  workspaceId: string,
  path?: string,
): Promise<WorkspaceModePayload> {
  const res = await fetch(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/switch-workspace`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ workspaceId, path }),
    },
  );
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(errData.error || 'Failed to switch workspace');
  }
  return res.json();
}

export async function fetchWorkspaceMode(
  token: string,
  sessionId: string,
): Promise<WorkspaceModePayload> {
  const res = await fetch(
    `${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/workspace-mode`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch workspace mode: HTTP ${res.status}`);
  }
  return res.json();
}
