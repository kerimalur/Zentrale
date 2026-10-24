// Aufrufe an den eigenen Server.

export async function senden<T = unknown>(pfad: string, daten?: unknown, method: 'POST' | 'DELETE' = 'POST'): Promise<T> {
  const res = await fetch(pfad, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Zentrale': '1' },
    body: daten === undefined ? undefined : JSON.stringify(daten),
    credentials: 'same-origin',
  });
  if (res.status === 401 && !pfad.endsWith('/login')) {
    window.location.href = '/login/';
    throw new Error('Nicht angemeldet');
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { fehler?: string }).fehler || `Fehler ${res.status}`);
  return j as T;
}

// GET mit Anmeldung; wirft bei Fehler die Meldung des Servers.
export async function holen<T = unknown>(pfad: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(pfad, { credentials: 'same-origin', cache: 'no-store', signal });
  if (res.status === 401) {
    window.location.href = '/login/';
    throw new Error('Nicht angemeldet');
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { fehler?: string }).fehler || `Fehler ${res.status}`);
  return j as T;
}

export async function kopieren(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
