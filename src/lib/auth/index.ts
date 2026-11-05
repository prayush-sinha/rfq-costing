import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./config";
import { db } from "@/db/client";
import { isLockedOut, recordFailure, cleanEmail } from "./throttle";

// Custom error for rate-limiting lockout with code accessible in client
export class LockedAccountError extends CredentialsSignin {
  code = "locked";
}

// Pre-computed valid 60-character bcrypt hash for constant-time comparison when email is not found
const DUMMY_HASH = bcrypt.hashSync("timing-defense-constant-salt", 10);

function getClientIp(request?: Request): string {
  if (!request) return "127.0.0.1";
  const realIp =
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip");
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Take the rightmost hop (closest trusted proxy) to prevent client-injected spoofing
    const hops = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length > 0) {
      return hops[hops.length - 1];
    }
  }
  return "127.0.0.1";
}

const credentialsSchema = z.object({
  email: z.string().trim().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials, request) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;
        const normalizedEmail = cleanEmail(email);
        const ip = getClientIp(request as Request | undefined);

        // Check login throttling lockout (5 failures in 15 minutes)
        const locked = await isLockedOut(normalizedEmail, ip);
        if (locked) {
          throw new LockedAccountError();
        }

        // Query user from database
        const user = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.email, normalizedEmail),
        });

        if (!user) {
          // Constant-time compare against dummy hash to prevent email enumeration timing attacks
          await bcrypt.compare(password, DUMMY_HASH);
          await recordFailure(normalizedEmail, ip);
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
          await recordFailure(normalizedEmail, ip);
          return null;
        }

        return {
          id: String(user.id),
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
});
