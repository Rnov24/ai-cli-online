export interface PersonaDefinition {
  id: string;
  name: string;
  role: string;
  icon: string;
  color: string;
  description: string;
  directive: string;
  isPreset: boolean;
  tags?: string[];
}

export interface PersonasResponse {
  personas: PersonaDefinition[];
  count: number;
  activePersonaId?: string;
}

export async function fetchPersonas(token: string, sessionId?: string): Promise<PersonasResponse> {
  const url = sessionId ? `/api/personas?sessionId=${encodeURIComponent(sessionId)}` : '/api/personas';
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch personas: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchPersonaDetails(token: string, id: string): Promise<PersonaDefinition> {
  const res = await fetch(`/api/personas/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch persona: ${res.statusText}`);
  }
  return res.json();
}

export async function createCustomPersona(
  token: string,
  data: {
    id: string;
    name: string;
    role: string;
    icon?: string;
    color?: string;
    description?: string;
    directive: string;
    tags?: string[];
  }
): Promise<PersonaDefinition> {
  const res = await fetch('/api/personas', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Failed to create custom persona: ${res.statusText}`);
  }
  return json;
}

export async function setSessionPersona(
  token: string,
  sessionId: string,
  personaId: string
): Promise<{ ok: boolean; sessionName: string; personaId: string }> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/persona`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ personaId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `Failed to set session persona: ${res.statusText}`);
  }
  return json;
}
