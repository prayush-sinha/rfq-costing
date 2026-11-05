import { requireUser } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { rateMaterials } from "@/db/schema";
import { Navbar } from "@/components/Navbar";
import { QuotesClient } from "./QuotesClient";
import { queryPastQuotes } from "./import-actions";

export const dynamic = "force-dynamic";

export default async function PastQuotesPage() {
  const user = await requireUser();

  const [initialData, materialRows] = await Promise.all([
    queryPastQuotes({ page: 1, pageSize: 25 }),
    db.selectDistinct({ grade: rateMaterials.grade }).from(rateMaterials),
  ]);

  const knownMaterials = materialRows.map((r) => r.grade);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">
      <Navbar user={user} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <QuotesClient
          initialData={initialData as any}
          knownMaterials={knownMaterials}
          userRole={user.role}
        />
      </main>
    </div>
  );
}
