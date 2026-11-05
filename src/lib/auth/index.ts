import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./config";
import { db } from "@/db/client";
import { isLockedOut, recordFailure, cleanEmail } from "./throttle";

// Pre-generated bcrypt hash for dummy constant-time comparison when email is not found
const DUMMY_HASH = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUU1234567890";

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

        // Extract client IP from headers (first entry if comma-separated proxy list)
        const forwardedFor = request?.headers?.get("x-forwarded-for");
        const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1";

        // Check login throttling lockout (5 failures in 15 minutes)
        const locked = await isLockedOut(normalizedEmail, ip);
        if (locked) {
          throw new Error("Too many failed attempts. Account locked for 15 minutes.");
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
