// This is a local cache selector, never an authorization decision. Supabase
// still checks the signed-in session and RLS for every replayed operation.
let currentUserId: string | null = null;
export function setSyncUser(userId: string | null): void { currentUserId = userId; }
export function getSyncUser(): string | null { return currentUserId; }
