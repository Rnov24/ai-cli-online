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
