"use client";

import { useState } from "react";
import Link from "next/link";
import { approveQuote, rejectQuote, markQuoteSent, QuoteReviewItem } from "./actions";

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
    if (filter === "rejected") {
      return q.status === "rejected" || (q.status === "draft" && !!q.rejectionReason);
    }
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
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to approve quote");
    } finally {
      setProcessing(false);
    }
  };

  const handleOpenReject = (quoteId: number) => {
    setSelectedQuoteId(quoteId);
    setRejectionReason("");
    setShowRejectModal(true);
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuoteId || !rejectionReason.trim()) return;

    setProcessing(true);
    setErrorMessage(null);
    try {
      const res = await rejectQuote(selectedQuoteId, rejectionReason);
      if (res.success) {
        setQuotes((prev) =>
          prev.map((q) =>
            q.id === selectedQuoteId
              ? { ...q, status: "draft", rejectionReason: rejectionReason.trim() }
              : q
          )
        );
        setShowRejectModal(false);
        setRejectionReason("");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to reject quote");
    } finally {
      setProcessing(false);
    }
  };

  const handleMarkSent = async (quoteId: number) => {
    if (!isSalesHead) {
      alert("Only Sales Head can mark quotes as sent.");
      return;
    }
    if (!confirm("Confirm marking this commercial quotation as sent to customer?")) {
      return;
    }

    setProcessing(true);
    setErrorMessage(null);
    try {
      const res = await markQuoteSent(quoteId);
      if (res.success) {
        setQuotes((prev) =>
          prev.map((q) => (q.id === quoteId ? { ...q, status: "sent" } : q))
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to mark quote sent");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Commercial Quote Approvals
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Managerial approval queue for quotes with annual value exceeding ₹25,00,000.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex rounded-lg border border-zinc-200 bg-white p-1 text-xs dark:border-zinc-800 dark:bg-zinc-900 shadow-xs">
          {(["pending_approval", "all", "approved", "rejected", "sent"] as const).map((tab) => (
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

      {/* Quote Review List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            No quotations found for this filter
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {filter === "pending_approval"
              ? "All commercial offers above ₹25L have been reviewed."
              : "Check other tabs or RFQ pipeline."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((q) => (
            <div
              key={q.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {q.rfqNo}
                    </span>
                    <span className="text-zinc-400">•</span>
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      {q.customerName}
                    </span>
                    <StatusBadge status={q.status} hasRejection={!!q.rejectionReason} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 font-mono">
                    <span>Due: {q.dueDate}</span>
                    <span>As-Of Date: {q.asOfDate}</span>
                    <span>Version: v{q.version}</span>
                    <span>Parts: {q.partsCount}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    Annual Commercial Value
                  </div>
                  <div className="font-mono text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    ₹{Number(q.annualValue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Status and Action Buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800/60">
                <div className="space-y-0.5">
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
                <div className="flex items-center gap-2">
                  {q.status === "pending_approval" && (
                    <>
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
                    </>
                  )}

                  {q.status === "approved" && (
                    <>
                      <a
                        href={`/api/quotes/${q.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition-colors inline-flex items-center gap-1 shadow-xs"
                      >
                        📄 Download PDF
                      </a>
                      {isSalesHead && (
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() => handleMarkSent(q.id)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs"
                        >
                          ✉ Mark Sent
                        </button>
                      )}
                    </>
                  )}

                  {q.status === "sent" && (
                    <a
                      href={`/api/quotes/${q.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition-colors inline-flex items-center gap-1 shadow-xs"
                    >
                      📄 View PDF
                    </a>
                  )}

                  <Link
                    href={`/rfqs/${q.rfqId}`}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    View RFQ →
                  </Link>
                </div>
              </div>

              {/* Rejection Reason Notice */}
              {q.rejectionReason && (
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

              {q.status === "sent" && (
                <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400">
                  ✓ Formally dispatched and sent to customer.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-reject-title"
            onSubmit={handleConfirmReject}
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
              <h3 id="modal-reject-title" className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Reject Commercial Offer
              </h3>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                aria-label="Close rejection dialog"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 rounded p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Per Company A commercial governance, a detailed rejection rationale is mandatory before returning this quote to draft status for the estimator.
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

function StatusBadge({ status, hasRejection }: { status: "draft" | "pending_approval" | "approved" | "rejected" | "sent"; hasRejection?: boolean }) {
  if (status === "draft" && hasRejection) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-800">
        Draft (Returned)
      </span>
    );
  }

  switch (status) {
    case "pending_approval":
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          Pending Approval
        </span>
      );
    case "approved":
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          Approved
        </span>
      );
    case "sent":
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          Sent
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-800">
          Rejected
        </span>
      );
    case "draft":
    default:
      return (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
          Draft
        </span>
      );
  }
}
