/** Ref-counted online tracking (a user may have several tabs/sockets). */
const counts = new Map<string, number>();

/** Mark a connection online. Returns true on the 0→1 transition (became online). */
export function goOnline(userId: string): boolean {
  const next = (counts.get(userId) ?? 0) + 1;
  counts.set(userId, next);
  return next === 1;
}

/** Mark a connection offline. Returns true on the 1→0 transition (went offline). */
export function goOffline(userId: string): boolean {
  const next = (counts.get(userId) ?? 1) - 1;
  if (next <= 0) {
    counts.delete(userId);
    return true;
  }
  counts.set(userId, next);
  return false;
}

export function isOnline(userId: string): boolean {
  return (counts.get(userId) ?? 0) > 0;
}
