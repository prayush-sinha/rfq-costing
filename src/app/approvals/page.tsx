import { requireUser } from "@/lib/auth/guards";
import { Navbar } from "@/components/Navbar";
import { ApprovalsClient } from "./ApprovalsClient";
import { getQuotesForReview } from "./actions";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const user = await requireUser();
  const quotes = await getQuotesForReview();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">
      <Navbar user={user} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <ApprovalsClient quotes={quotes} userRole={user.role} />
      </main>
    </div>
  );
}
