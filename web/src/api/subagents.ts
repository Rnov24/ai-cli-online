export interface SubagentItem {
  id: string;
  parentId: string;
  role: string;
  typeName: string;
  model: string;
  prompt: string;
  status: 'running' | 'done' | 'error';
  createdAt: number;
  updatedAt: number;
  logUri: string;
  worktreeUri?: string;
  toolCount: number;
  report?: string;
}

export interface SubagentsResponse {
  ok: boolean;
  subagents: SubagentItem[];
  count: number;
}

export interface SubagentDetailResponse {
  ok: boolean;
  subagent: SubagentItem;
  id: string;
  parentId: string;
  role: string;
  typeName: string;
  model: string;
  prompt: string;
  status: 'running' | 'done' | 'error';
  createdAt: number;
  updatedAt: number;
  logUri: string;
  worktreeUri?: string;
  toolCount: number;
  report?: string;
  messages?: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: number;
    thinking?: string;
    toolCalls?: any[];
  }>;
}

export async function fetchSubagents(
  token: string,
  options?: { parentId?: string; status?: string; query?: string }
): Promise<SubagentsResponse> {
  const params = new URLSearchParams();
  if (options?.parentId) params.set('parent', options.parentId);
  if (options?.status && options.status !== 'all') params.set('status', options.status);
  if (options?.query) params.set('q', options.query);

  const qs = params.toString();
  const url = qs ? `/api/agy/subagents?${qs}` : '/api/agy/subagents';
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch subagents: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchSubagent(
  token: string,
  id: string
): Promise<SubagentDetailResponse> {
  const res = await fetch(`/api/agy/subagents/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch subagent: ${res.statusText}`);
  }
  return res.json();
}
