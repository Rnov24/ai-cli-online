export interface VerifyResponse {
  authenticated: boolean;
  authRequired: boolean;
  auth_required?: boolean;
}

export interface LoginResponse {
  ok: boolean;
  error?: string;
}

export async function login(token: string): Promise<LoginResponse> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      let errMessage = 'Invalid auth token';
      try {
        const body = await res.json();
        if (body.error) errMessage = body.error;
      } catch {
        // ignore json parse error
      }
      return { ok: false, error: errMessage };
    }

    const data = await res.json();
    return { ok: true, ...data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { ok: false, error: message };
  }
}

export async function verify(token?: string): Promise<VerifyResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch('/api/auth/verify', { headers });
  if (!res.ok && res.status !== 401) {
    throw new Error(`Verification failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  return {
    authenticated: Boolean(data.authenticated),
    authRequired: Boolean(data.authRequired),
    auth_required: Boolean(data.authRequired),
  };
}
