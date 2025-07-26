const RATE_LIMIT_SECONDS = 60
const userTimestamps = new Map<number, number>()

export function isRateLimited(userId: number): boolean {
  const now = Date.now()
  const last = userTimestamps.get(userId)
  if (last && now - last < RATE_LIMIT_SECONDS * 1000) return true
  userTimestamps.set(userId, now)
  return false
}
