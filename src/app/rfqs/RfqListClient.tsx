"use client";

import { useState } from "react";
import Link from "next/link";
import { createRfq } from "./actions";
import { dueUrgency } from "@/lib/rfqs/urgency";

export interface RfqListItem {
  id: number;
  rfqNo: string;
  customerName: string;
  dueDate: string;
  status: "estimating" | "sent" | "won" | "lost";
  lostReason?: string | null;
  ownerEmail: string;
  partsCount: number;
  totalAnnualVolume: number;
}

interface CustomerOption {
  id: number;
  name: string;
}

interface RfqListClientProps {
  rfqs: RfqListItem[];
  customers: CustomerOption[];
  today: string;
  userRole: "estimator" | "sales_head";
}

export function RfqListClient({
  rfqs,
  customers,
  today,
  userRole: _userRole,
}: RfqListClientProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create form state
  const [newRfqNo, setNewRfqNo] = useState("");
  const [newCustomerId, setNewCustomerId] = useState<number>(customers[0]?.id || 1);
  const [newDueDate, setNewDueDate] = useState(today);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filteredRfqs = rfqs.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNo = r.rfqNo.toLowerCase().includes(q);
      const matchCust = r.customerName.toLowerCase().includes(q);
      if (!matchNo && !matchCust) return false;
    }
    return true;
  });

  const handleCreateRfq = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const res = await createRfq({
        rfqNo: newRfqNo,
        customerId: Number(newCustomerId),
        dueDate: newDueDate,
      });

      if ("error" in res) {
        setFormError(res.message || "Failed to create RFQ");
      } else if (res.success) {
        setShowCreateModal(false);
        setNewRfqNo("");
        window.location.reload();
      }
    } catch (err: any) {
      setFormError(err?.message || "Failed to create RFQ");
    } finally {
      setSubmitting(false);
    }
  };

  const statusCounts = {
    all: rfqs.length,
    estimating: rfqs.filter((r) => r.status === "estimating").length,
    sent: rfqs.filter((r) => r.status === "sent").length,
    won: rfqs.filter((r) => r.status === "won").length,
    lost: rfqs.filter((r) => r.status === "lost").length,
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0" role="group" aria-label="Filter RFQs by status">
          {(["all", "estimating", "sent", "won", "lost"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              aria-pressed={statusFilter === st}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 dark:focus-visible:ring-zinc-100 ${
                statusFilter === st
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm font-semibold"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {st} ({statusCounts[st]})
            </button>
          ))}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search RFQ # or Customer..."
            value={searchQuery}
            aria-label="Search RFQ number or Customer name"
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100"
          />

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus-visible:ring-zinc-100 transition-colors shadow-sm whitespace-nowrap"
          >
            <span>+ New RFQ</span>
          </button>
        </div>
      </div>

      {/* RFQ Register Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-left text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-mono uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">RFQ #</th>
              <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
              <th scope="col" className="px-4 py-3 font-semibold">Due Date & Urgency</th>
              <th scope="col" className="px-4 py-3 font-semibold text-center">Parts</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Annual Volume</th>
              <th scope="col" className="px-4 py-3 font-semibold">Owner</th>
              <th scope="col" className="px-4 py-3 font-semibold text-center">Status</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredRfqs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-zinc-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <span className="text-zinc-400 text-sm">No RFQs found matching current criteria</span>
                    {(statusFilter !== "all" || searchQuery.trim()) && (
                      <button
                        onClick={() => {
                          setStatusFilter("all");
                          setSearchQuery("");
                        }}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600"
                      >
                        Reset search & filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredRfqs.map((rfq) => {
                const urgency = dueUrgency(rfq.dueDate, today);
                return (
                  <tr
                    key={rfq.id}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      <Link
                        href={`/rfqs/${rfq.id}`}
                        className="hover:underline text-blue-600 dark:text-blue-400"
                      >
                        {rfq.rfqNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-800 dark:text-zinc-200">
                      {rfq.customerName}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-mono">
                        <span>{rfq.dueDate}</span>
                        <UrgencyBadge urgency={urgency} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-mono">
                      {rfq.partsCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {rfq.totalAnnualVolume.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 font-mono text-[11px] truncate max-w-[140px]">
                      {rfq.ownerEmail}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={rfq.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/rfqs/${rfq.id}`}
                        className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create RFQ Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-rfq-title"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900 dark:border dark:border-zinc-800 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
              <h3 id="modal-rfq-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Register New RFQ
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close register modal"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 rounded p-1"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="rounded-md bg-red-50 p-2.5 text-xs text-red-700 border border-red-200 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateRfq} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  RFQ Number (e.g. RFQ-2611-042)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RFQ-2611-030"
                  value={newRfqNo}
                  onChange={(e) => setNewRfqNo(e.target.value.toUpperCase())}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  OEM / Tier-1 Customer
                </label>
                <select
                  value={newCustomerId}
                  onChange={(e) => setNewCustomerId(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Commercial Due Date
                </label>
                <input
                  type="date"
                  required
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {submitting ? "Registering..." : "Create RFQ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function UrgencyBadge({ urgency }: { urgency: "overdue" | "due_soon" | "ok" }) {
  if (urgency === "overdue") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800">
        Overdue
      </span>
    );
  }
  if (urgency === "due_soon") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800">
        Due Soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
      On Track
    </span>
  );
}

function StatusBadge({ status }: { status: "estimating" | "sent" | "won" | "lost" }) {
  switch (status) {
    case "estimating":
      return (
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
          Estimating
        </span>
      );
    case "sent":
      return (
        <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800">
          Sent
        </span>
      );
    case "won":
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
          Won
        </span>
      );
    case "lost":
      return (
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
          Lost
        </span>
      );
  }
}
