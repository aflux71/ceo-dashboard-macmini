const KEY = 'neob_portal_session';
const ACTIVE_KEY = 'neob_portal_active_store';

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
  // Reset any prior active store on new session
  localStorage.removeItem(ACTIVE_KEY);
}

export function clearPortalSession() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(ACTIVE_KEY);
}

export function getActiveStore() {
  return localStorage.getItem(ACTIVE_KEY) || null;
}

export function setActiveStore(storeName) {
  if (storeName) localStorage.setItem(ACTIVE_KEY, storeName);
  else localStorage.removeItem(ACTIVE_KEY);
}