const KEY = 'neob_portal_session';

export function getPortalSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setPortalSession(account) {
  localStorage.setItem(KEY, JSON.stringify({
    ...account,
    started_at: new Date().toISOString()
  }));
}

export function clearPortalSession() {
  localStorage.removeItem(KEY);
}