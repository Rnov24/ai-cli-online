export interface PluginItem {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  source: string;
  importedAt?: string;
  components: string[];
  enabled: boolean;
  path: string;
  hasSkills: boolean;
  hasCommands: boolean;
  skillsCount: number;
}

export interface PluginsResponse {
  plugins: PluginItem[];
  count: number;
}

export async function fetchPlugins(token: string): Promise<PluginsResponse> {
  const res = await fetch('/api/plugins', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch plugins: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchPluginDetails(token: string, name: string): Promise<PluginItem> {
  const res = await fetch(`/api/plugins/${encodeURIComponent(name)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch plugin details: ${res.statusText}`);
  }
  return res.json();
}

export async function installPlugin(token: string, target: string): Promise<{ ok: boolean; message?: string; output?: string }> {
  const res = await fetch('/api/plugins/install', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ target }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || data.message || `Failed to install plugin: ${res.statusText}`);
  }
  return data;
}

export async function uninstallPlugin(token: string, name: string): Promise<{ ok: boolean; message?: string; output?: string }> {
  const res = await fetch('/api/plugins/uninstall', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || data.message || `Failed to uninstall plugin: ${res.statusText}`);
  }
  return data;
}

export async function togglePlugin(token: string, name: string, enable: boolean): Promise<{ ok: boolean; message?: string; output?: string }> {
  const res = await fetch('/api/plugins/toggle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, enable }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || data.message || `Failed to toggle plugin: ${res.statusText}`);
  }
  return data;
}
