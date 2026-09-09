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

export async function fetchSkills(token: string, cwd?: string): Promise<SkillsPayload> {
  const url = cwd ? `/api/skills?cwd=${encodeURIComponent(cwd)}` : '/api/skills';
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


export async function searchSkills(token: string, query: string, limit: number = 20): Promise<SkillsSearchResponse> {
  const url = `/api/skills/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit.toString())}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Failed to search skills: ${res.statusText}`);
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
