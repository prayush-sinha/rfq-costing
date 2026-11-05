"use client";

import { useState } from "react";
import Link from "next/link";
import { approveQuote, rejectQuote, QuoteReviewItem } from "./actions";

interface ApprovalsClientProps {
  quotes: QuoteReviewItem[];
  userRole: "estimator" | "sales_head";
}

export function ApprovalsClient({ quotes: initialQuotes, userRole }: ApprovalsClientProps) {
  const [quotes, setQuotes] = useState<QuoteReviewItem[]>(initialQuotes);
  const [filter, setFilter] = useState<"all" | "pending_approval" | "approved" | "rejected" | "sent">("pending_approval");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSalesHead = userRole === "sales_head";

  const filtered = quotes.filter((q) => {
    if (filter === "all") return true;
    return q.status === filter;
  });

  const pendingCount = quotes.filter((q) => q.status === "pending_approval").length;

  const handleApprove = async (quoteId: number) => {
    if (!isSalesHead) {
      alert("Only the Sales Head can approve commercial quotations.");
      return;
    }
    if (!confirm("Are you sure you want to approve this commercial quotation? This will create an immutable snapshot.")) {
      return;
    }

    setProcessing(true);
    setErrorMessage(null);
    try {
      const res = await approveQuote(quoteId);
      if (res.success) {
        setQuotes((prev) =>
          prev.map((q) => (q.id === quoteId ? { ...q, status: "approved" } : q))
        );
        window.location.reload();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to approve quote");
    } finally {
      setProcessing(false);
    }
  };

  const handleOpenReject = (quoteId: number) => {
    if (!isSalesHead) {
      alert("Only the Sales Head can reject commercial quotations.");
      return;
    }
    setSelectedQuoteId(quoteId);
    setRejectionReason("");
    setErrorMessage(null);
    setShowRejectModal(true);
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuoteId) return;
    if (!rejectionReason.trim()) {
      setErrorMessage("Rejection reason is required.");
      return;
    }

    setProcessing(true);
    setErrorMessage(null);
    try {
      const res = await rejectQuote(selectedQuoteId, rejectionReason);
      if (res.success) {
        setShowRejectModal(false);
        setQuotes((prev) =>
          prev.map((q) =>
            q.id === selectedQuoteId
              ? { ...q, status: "rejected", rejectionReason: rejectionReason.trim() }
              : q
          )
        );
        window.location.reload();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to reject quote");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
            <span>Commercial Offer Approvals</span>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                {pendingCount} Pending Sales Head Review
              </span>
            )}
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Managerial approval queue for quotes with annual value exceeding ₹25,00,000.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex rounded-lg border border-zinc-200 bg-white p-1 text-xs dark:border-zinc-800 dark:bg-zinc-900 shadow-xs">
          {(["pending_approval", "all", "approved", "rejected"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                filter === tab
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {tab === "pending_approval"
                ? `Pending (${pendingCount})`
                : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200 dark:bg-red-950/40 dark:border-red-900 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {/* Quotes Queue List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-12 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          No commercial quotes found matching the &quot;{filter}&quot; filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((q) => (
            <div
              key={q.id}
              className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800/80">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {q.rfqNo}
                  </span>
                  <StatusBadge status={q.status} />
                  <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    v{q.version}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/rfqs/${q.rfqId}`}
                    className="rounded border border-zinc-300 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    View RFQ & Parts
                  </Link>
                  {q.status === "approved" && (
                    <a
                      href={`/api/quotes/${q.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                    >
                      📄 Download PDF
                    </a>
                  )}
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                <div>
                  <span className="text-zinc-500 uppercase text-[10px]">Customer</span>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
                    {q.customerName}
                  </div>
                </div>
                <div>
                  <span className="text-zinc-500 uppercase text-[10px]">Due Date</span>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {q.dueDate}
                  </div>
                </div>
                <div>
                  <span className="text-zinc-500 uppercase text-[10px]">Pinned As-Of Date</span>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {q.asOfDate}
                  </div>
                </div>
                <div>
                  <span className="text-zinc-500 uppercase text-[10px]">Scope</span>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {q.partsCount} part{q.partsCount === 1 ? "" : "s"}
                  </div>
                </div>
              </div>

              {/* Threshold Banner & Value */}
              <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-zinc-500 uppercase text-[10px]">
                      Commercial Value Threshold:
                    </span>
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      &gt; ₹25,00,000 Gate
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                    Requires formal sign-off by Sales Head prior to commercial release.
                  </div>
                </div>

                {/* Sales Head Action Buttons */}
                {q.status === "pending_approval" && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={processing || !isSalesHead}
                      onClick={() => handleApprove(q.id)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs"
                      title={!isSalesHead ? "Sales Head role required to approve" : undefined}
                    >
                      ✓ Approve Quote
                    </button>
                    <button
                      type="button"
                      disabled={processing || !isSalesHead}
                      onClick={() => handleOpenReject(q.id)}
                      className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300 disabled:opacity-50 transition-colors"
                      title={!isSalesHead ? "Sales Head role required to reject" : undefined}
                    >
                      ✕ Reject Quote
                    </button>
                  </div>
                )}
              </div>

              {/* Rejection Reason Notice */}
              {q.status === "rejected" && q.rejectionReason && (
                <div className="rounded-lg bg-red-50/70 p-3 text-xs border border-red-200 dark:bg-red-950/20 dark:border-red-900 space-y-1">
                  <span className="font-semibold text-red-800 dark:text-red-300 uppercase tracking-wider font-mono text-[10px]">
                    Sales Head Rejection Reason
                  </span>
                  <p className="text-red-900 dark:text-red-200 font-sans">{q.rejectionReason}</p>
                </div>
              )}

              {q.status === "approved" && q.approvedBy && (
                <div className="text-[11px] font-mono text-zinc-500">
                  Approved by {q.approvedBy} • Immutable commercial snapshot sealed.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleConfirmReject}
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Reject Commercial Offer
              </h3>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Per Company A commercial governance, a detailed rejection rationale is mandatory before returning this quote to the engineering estimator.
            </p>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Rejection Reason (Mandatory)
              </label>
              <textarea
                required
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Margins below hurdle rate, cycle time on VMC exceeds target, customer requested 60-day terms..."
                className="mt-1 block w-full rounded-md border border-zinc-300 p-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-zinc-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={processing || !rejectionReason.trim()}
                className="rounded-md bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors shadow-xs"
              >
                {processing ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "draft" | "pending_approval" | "approved" | "rejected" | "sent" }) {
  switch (status) {
    case "pending_approval":
      return (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400">
          Pending Approval
        </span>
      );
    case "approved":
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400">
          Approved
        </span>
      );
    case "sent":
      return (
        <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-400">
          Sent
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400">
          Rejected
        </span>
      );
    case "draft":
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300">
          Draft
        </span>
      );
  }
}
