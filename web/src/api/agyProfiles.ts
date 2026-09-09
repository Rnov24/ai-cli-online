export interface AgyProfile {
  name: string;
  isActive: boolean;
  updatedAt: number;
  hasToken: boolean;
}

export interface AgyProfilesResponse {
  current: string;
  profiles: AgyProfile[];
}

export interface StartAuthResponse {
  flowId?: string;
  profileName: string;
  authUrl?: string;
  manualTerminalCommand: string;
  message?: string;
}

function getAuthHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchAgyProfiles(token?: string): Promise<AgyProfilesResponse> {
  const res = await fetch('/api/agy/profiles', {
    headers: getAuthHeaders(token),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to fetch profiles: ${res.statusText}`);
  }
  return res.json();
}

export async function switchAgyProfile(
  name: string,
  token?: string
): Promise<{ ok: boolean; current: string }> {
  const res = await fetch('/api/agy/profiles/switch', {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to switch profile: ${res.statusText}`);
  }
  return res.json();
}

export async function saveCurrentAgyProfile(
  name: string,
  token?: string
): Promise<{ ok: boolean; current: string }> {
  const res = await fetch('/api/agy/profiles/save', {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to save profile: ${res.statusText}`);
  }
  return res.json();
}

export async function importAgyProfile(
  name: string,
  tokenContent: string,
  token?: string
): Promise<{ ok: boolean; current: string }> {
  const res = await fetch('/api/agy/profiles/import', {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ name, token: tokenContent }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to import profile: ${res.statusText}`);
  }
  return res.json();
}

export async function renameAgyProfile(
  oldName: string,
  newName: string,
  token?: string
): Promise<{ ok: boolean }> {
  const res = await fetch('/api/agy/profiles/rename', {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ oldName, newName }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to rename profile: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteAgyProfile(
  name: string,
  token?: string
): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/agy/profiles/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(token),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to delete profile: ${res.statusText}`);
  }
  return res.json();
}

export async function startAgyAuth(
  profileName: string,
  token?: string
): Promise<StartAuthResponse> {
  const res = await fetch('/api/agy/profiles/auth/start', {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ profileName }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to start auth flow: ${res.statusText}`);
  }
  return res.json();
}

export async function submitAgyAuthCode(
  flowId: string,
  profileName: string,
  code: string,
  token?: string
): Promise<{ ok: boolean; current: string }> {
  const res = await fetch('/api/agy/profiles/auth/submit', {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ flowId, profileName, code }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to submit auth code: ${res.statusText}`);
  }
  return res.json();
}

export async function cancelAgyAuth(
  flowId: string,
  token?: string
): Promise<{ ok: boolean }> {
  const res = await fetch('/api/agy/profiles/auth/cancel', {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ flowId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to cancel auth: ${res.statusText}`);
  }
  return res.json();
}
