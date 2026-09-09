export interface SkillItem {
  name: string;
  description: string;
  scope: 'workspace' | 'global' | 'builtin';
  path: string;
  skillFile: string;
  hasScripts: boolean;
  hasResources: boolean;
  tags?: string[];
}

export interface SkillsPayload {
  workspacePath: string;
  isHome: boolean;
  skills: SkillItem[];
  count: number;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

export interface SkillContentPayload {
  name: string;
  description: string;
  content: string;
  path: string;
  scope?: string;
}

export interface ScaffoldSkillPayload {
  name: string;
  description: string;
  scope: 'workspace' | 'global';
  cwd?: string;
}


export interface RemoteSkillItem {
  id: string;
  skillId: string;
  name: string;
  source: string;
  installs: number;
}

export interface SkillsSearchResponse {
  query: string;
  skills: RemoteSkillItem[];
  count: number;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

export interface FetchSkillsOptions {
  cwd?: string;
  page?: number;
  limit?: number;
  scope?: 'all' | 'workspace' | 'global' | 'builtin';
  q?: string;
}

export interface InstallSkillPayload {
  source: string;
  skillName?: string;
  scope: 'workspace' | 'global';
  cwd?: string;
}

export interface SyncSkillsResponse {
  synced: number;
  restored: string[];
  errors?: string[];
}

export async function fetchSkills(
  token: string,
  cwdOrOptions?: string | FetchSkillsOptions
): Promise<SkillsPayload> {
  let url = '/api/skills';
  const params = new URLSearchParams();

  if (typeof cwdOrOptions === 'string') {
    if (cwdOrOptions.trim()) params.set('cwd', cwdOrOptions.trim());
  } else if (cwdOrOptions) {
    if (cwdOrOptions.cwd?.trim()) params.set('cwd', cwdOrOptions.cwd.trim());
    if (cwdOrOptions.page && cwdOrOptions.page > 0) params.set('page', String(cwdOrOptions.page));
    if (cwdOrOptions.limit && cwdOrOptions.limit > 0) params.set('limit', String(cwdOrOptions.limit));
    if (cwdOrOptions.scope && cwdOrOptions.scope !== 'all') params.set('scope', cwdOrOptions.scope);
    if (cwdOrOptions.q?.trim()) params.set('q', cwdOrOptions.q.trim());
  }

  const qs = params.toString();
  if (qs) {
    url += `?${qs}`;
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch skills: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchSkillContent(token: string, skillPath: string): Promise<SkillContentPayload> {
  const res = await fetch(`/api/skills/content?path=${encodeURIComponent(skillPath)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch skill content: ${res.statusText}`);
  }
  return res.json();
}

export async function scaffoldSkill(token: string, data: ScaffoldSkillPayload): Promise<SkillItem> {
  const res = await fetch('/api/skills/scaffold', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to scaffold skill: ${res.statusText}`);
  }
  return res.json();
}


export async function searchSkills(
  token: string,
  query: string,
  limit: number = 20,
  page: number = 1
): Promise<SkillsSearchResponse> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  params.set('limit', String(limit));
  if (page > 1) params.set('page', String(page));

  const res = await fetch(`/api/skills/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to search skills: ${res.statusText}`);
  }
  return res.json();
}

export async function installSkill(token: string, payload: InstallSkillPayload): Promise<SkillItem> {
  const res = await fetch('/api/skills/install', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to install skill: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteSkill(token: string, name: string, scope: string, cwd?: string): Promise<{ ok: boolean; name: string }> {
  let url = `/api/skills?name=${encodeURIComponent(name)}&scope=${encodeURIComponent(scope)}`;
  if (cwd) {
    url += `&cwd=${encodeURIComponent(cwd)}`;
  }
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to delete skill: ${res.statusText}`);
  }
  return res.json();
}

export async function syncSkills(token: string, cwd?: string): Promise<SyncSkillsResponse> {
  const url = cwd ? `/api/skills/sync?cwd=${encodeURIComponent(cwd)}` : '/api/skills/sync';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to sync skills: ${res.statusText}`);
  }
  return res.json();
}

export interface ConvertHermesPayload {
  source: string;
  customName?: string;
  scope: 'workspace' | 'global';
  cwd?: string;
}

export async function convertHermesPlugin(token: string, payload: ConvertHermesPayload): Promise<SkillItem> {
  const res = await fetch('/api/skills/convert-hermes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to convert Hermes plugin: ${res.statusText}`);
  }
  return res.json();
}
