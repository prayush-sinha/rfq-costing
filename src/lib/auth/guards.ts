import { db } from "@/db/client";
import { currentSession } from "./session";

export type Role = "estimator" | "sales_head";

export class ForbiddenError extends Error {
  constructor(message = "Forbidden: insufficient permissions") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthenticatedError extends Error {
  constructor(message = "Unauthenticated: sign in required") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export async function requireUser(): Promise<{ id: number; email: string; role: Role }> {
  const session = await currentSession();
  if (!session) {
    throw new UnauthenticatedError("No active session");
  }

  // Re-read role from DB on every privileged call - do not trust JWT role blindly
  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, session.userId),
  });

  if (!user) {
    throw new UnauthenticatedError("User not found in database");
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role as Role,
  };
}

export async function requireRole(...roles: Role[]): Promise<{ id: number; email: string; role: Role }> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new ForbiddenError(`Role '${user.role}' is not authorized for this action`);
  }
  return user;
}
