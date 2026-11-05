import { auth } from "./index";

export async function currentSession(): Promise<{ userId: number } | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  if (Number.isNaN(userId)) return null;
  return { userId };
}
