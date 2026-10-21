/** Time left until the next puzzle, at the player's local midnight, as "HH:MM:SS". */
export function countdownToMidnight(now: Date): string {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const seconds = Math.ceil((midnight.getTime() - now.getTime()) / 1000);
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}
