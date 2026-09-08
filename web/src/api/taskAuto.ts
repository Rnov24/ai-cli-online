export interface AutoSignalInfo {
  step: string;
  result: string;
  next: string;
  checkpoint?: string;
  iteration: number;
  timestamp: string;
}

export interface TaskAutoStatus {
  running: boolean;
  sessionName?: string;
  taskDir?: string;
  maxIterations?: number;
  timeoutMinutes?: number;
  iterationCount?: number;
  elapsedSeconds?: number;
  lastSignalAt?: string;
  signal?: AutoSignalInfo | null;
}

export interface StartAutoParams {
  taskDir: string;
  maxIterations?: number;
  timeoutMinutes?: number;
}

export async function startTaskAuto(token: string, sessionId: string, params: StartAutoParams): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/task-auto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errData.error || `Failed to start auto mode (${res.status})`);
  }

  return res.json();
}

export async function stopTaskAuto(token: string, sessionId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/task-auto`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errData.error || `Failed to stop auto mode (${res.status})`);
  }

  return res.json();
}

export async function getTaskAutoStatus(token: string, sessionId: string): Promise<TaskAutoStatus> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/task-auto`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    return { running: false };
  }

  return res.json();
}

export async function lookupTaskAuto(token: string, taskDir: string): Promise<{ sessionName: string; status: string } | null> {
  const res = await fetch(`/api/task-auto/lookup?taskDir=${encodeURIComponent(taskDir)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    return null;
  }

  return res.json();
}
