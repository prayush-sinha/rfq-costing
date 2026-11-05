import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { loginAttempts } from "@/db/schema";

export const cleanEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Checks whether the given email and IP pair is locked out due to
 * 5 or more failed login attempts within the last 15 minutes.
 */
export async function isLockedOut(
  email: string,
  ip: string,
  now: Date = new Date()
): Promise<boolean> {
  const cleaned = cleanEmail(email);
  const windowStart = new Date(now.getTime() - 15 * 60 * 1000);

  const res = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, cleaned),
        eq(loginAttempts.ip, ip),
        gt(loginAttempts.at, windowStart)
      )
    );

  const count = res[0]?.count ?? 0;
  return count >= 5;
}

/**
 * Records a failed login attempt for the given email and IP address.
 */
export async function recordFailure(
  email: string,
  ip: string,
  now: Date = new Date()
): Promise<void> {
  const cleaned = cleanEmail(email);
  await db.insert(loginAttempts).values({
    email: cleaned,
    ip,
    at: now,
  });
}
