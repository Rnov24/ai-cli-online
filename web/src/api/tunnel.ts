export interface TunnelStatus {
  installed: boolean;
  running: boolean;
  mode: 'quick' | 'token' | 'none';
  url?: string;
  pid?: number;
  binPath?: string;
  version?: string;
  error?: string;
  logs: string[];
  startedAt?: number;
  port?: number;
}

export interface StartTunnelOptions {
  mode?: 'quick' | 'token';
  token?: string;
  port?: number;
}

export async function fetchTunnelStatus(authToken?: string): Promise<TunnelStatus> {
  const headers: HeadersInit = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch('/api/tunnel/status', { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch tunnel status: ${res.statusText}`);
  }
  return res.json();
}

export async function startTunnel(
  authToken: string,
  options: StartTunnelOptions = {}
): Promise<TunnelStatus> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };

  const res = await fetch('/api/tunnel/start', {
    method: 'POST',
    headers,
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to start tunnel: ${res.statusText}`);
  }
  return res.json();
}

export async function stopTunnel(authToken: string): Promise<TunnelStatus> {
  const headers: HeadersInit = {
    Authorization: `Bearer ${authToken}`,
  };

  const res = await fetch('/api/tunnel/stop', {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to stop tunnel: ${res.statusText}`);
  }
  return res.json();
}

export async function installTunnel(authToken: string): Promise<TunnelStatus> {
  const headers: HeadersInit = {
    Authorization: `Bearer ${authToken}`,
  };

  const res = await fetch('/api/tunnel/install', {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to install cloudflared: ${res.statusText}`);
  }
  return res.json();
}
