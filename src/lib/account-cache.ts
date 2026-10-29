/** Small account-scoped snapshots for features outside the row sync store. */
export function readAccountCache<T>(namespace: string, userId: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`zen-cache:${namespace}:${userId}`);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export function writeAccountCache<T>(namespace: string, userId: string, value: T): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(`zen-cache:${namespace}:${userId}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
