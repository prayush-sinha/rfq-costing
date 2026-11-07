import type { NextAuthConfig } from "next-auth";

/**
 * Edge-compatible NextAuth configuration (no Node-postgres or bcrypt imports).
 * Safe for use in middleware / proxy and client environments.
 */
export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role as string;
      }
      return session;
    },
  },
  providers: [], // Injected in server index.ts with Credentials
};
