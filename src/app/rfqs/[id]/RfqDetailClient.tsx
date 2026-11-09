"use client";

import { useState } from "react";
import Link from "next/link";
import { addPart, markWonLost } from "../actions";
import { dueUrgency } from "@/lib/rfqs/urgency";

export interface PartItem {
  id: number;
  name: string;
  material: string;
  grossWtKg: string;
  scrapPct: string;
  annualVolume: number;
  toolingCost: string;
  toolingYears: string;
  drawingRef?: string | null;
  opsCount: number;
}

export interface RfqDetailData {
  id: number;
  rfqNo: string;
  customerName: string;
  dueDate: string;
  status: "estimating" | "sent" | "won" | "lost";
  lostReason?: string | null;
  ownerEmail: string;
  quoteId?: number | null;
  quoteStatus?: string | null;
}

interface RfqDetailClientProps {
  rfq: RfqDetailData;
  parts: PartItem[];
  today: string;
  userRole: "estimator" | "sales_head";
}

export function RfqDetailClient({
  rfq,
  parts,
  today,
  userRole,
}: RfqDetailClientProps) {
  const [showAddPart, setShowAddPart] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [lostError, setLostError] = useState<string | null>(null);
  const [markingLost, setMarkingLost] = useState(false);

  // New Part Form
  const [partName, setPartName] = useState("");
  const [material, setMaterial] = useState("EN8");
  const [grossWtKg, setGrossWtKg] = useState("");
  const [scrapPct, setScrapPct] = useState("0.08");
  const [annualVolume, setAnnualVolume] = useState("");
  const [toolingCost, setToolingCost] = useState("0");
  const [toolingYears, setToolingYears] = useState("2");
  const [drawingRef, setDrawingRef] = useState("");
  const [partError, setPartError] = useState<string | null>(null);
  const [savingPart, setSavingPart] = useState(false);

  const urgency = dueUrgency(rfq.dueDate, today);
  const isSalesHead = userRole === "sales_head";

  const handleMarkWon = async () => {
    if (!confirm("Are you sure you want to mark this commercial offer as WON?")) return;
    try {
      const res = await markWonLost(rfq.id, "won");
      if (res?.success) window.location.reload();
    } catch (err: any) {
      alert(err?.message || "Failed to mark won");
    }
  };

  const handleMarkLost = async (e: React.FormEvent) => {
    e.preventDefault();
    setLostError(null);
    setMarkingLost(true);
    try {
      const res = await markWonLost(rfq.id, "lost", lostReason);
      if ("error" in res) {
        setLostError(res.message || "Failed to mark lost");
      } else if (res?.success) {
        setShowLostModal(false);
        window.location.reload();
      }
    } catch (err: any) {
      setLostError(err?.message || "Failed to mark lost");
    } finally {
      setMarkingLost(false);
    }
  };

  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    setPartError(null);
    setSavingPart(true);

    try {
      const res = await addPart({
        rfqId: rfq.id,
        name: partName,
        material,
        grossWtKg,
        scrapPct,
        annualVolume: Number(annualVolume),
        toolingCost: toolingCost || "0",
        toolingYears: toolingYears || "2",
        drawingRef: drawingRef || undefined,
      });

      if ("error" in res) {
        setPartError(res.message || "Failed to add part");
      } else if (res.success) {
        setShowAddPart(false);
        window.location.reload();
      }
    } catch (err: any) {
      setPartError(err?.message || "Failed to add part");
    } finally {
      setSavingPart(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* RFQ Meta Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {rfq.rfqNo}
              </span>
              <StatusBadge status={rfq.status} />
              <UrgencyBadge urgency={urgency} />
            </div>
            <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Customer: <span className="text-zinc-900 dark:text-zinc-100 font-semibold">{rfq.customerName}</span>
            </p>
          </div>

          {/* Sales Head Commercial Controls */}
          {isSalesHead && (rfq.status === "estimating" || rfq.status === "sent") && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleMarkWon}
                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
              >
                ✓ Mark Won
              </button>
              <button
                onClick={() => setShowLostModal(true)}
                className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300 transition-colors"
              >
                ✕ Mark Lost
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <span className="text-zinc-500 uppercase">Commercial Due Date</span>
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
              {rfq.dueDate}
            </div>
          </div>
          <div>
            <span className="text-zinc-500 uppercase">Estimator / Owner</span>
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
              {rfq.ownerEmail}
            </div>
          </div>
          <div>
            <span className="text-zinc-500 uppercase">Quote Status</span>
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 capitalize">
              {rfq.quoteStatus || "Not Generated"}
            </div>
          </div>
          <div>
            <span className="text-zinc-500 uppercase">Parts In Scope</span>
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
              {parts.length} part{parts.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {rfq.status === "lost" && rfq.lostReason && (
          <div className="rounded-lg bg-zinc-100 p-3 text-xs border border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700 space-y-1">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-mono text-[10px]">
              Lost Reason (Recorded by Sales Head)
            </span>
            <p className="text-zinc-900 dark:text-zinc-100 font-sans">{rfq.lostReason}</p>
          </div>
        )}
      </div>

      {/* Parts Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Components & Manufacturing Parts ({parts.length})
          </h2>
          <p className="text-xs text-zinc-500">
            Inspect BOM specifications, machining processes, and open the 3-volume costing ledger.
          </p>
        </div>

        <button
          onClick={() => setShowAddPart(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors shadow-sm"
        >
          <span>+ Add Part</span>
        </button>
      </div>

      {/* Parts Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-left text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-mono uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Part Name</th>
              <th scope="col" className="px-4 py-3 font-semibold">Drawing Ref</th>
              <th scope="col" className="px-4 py-3 font-semibold">Material Grade</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Gross Wt (kg)</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Scrap %</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Annual Vol</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Tooling (₹)</th>
              <th scope="col" className="px-4 py-3 font-semibold text-center">Operations</th>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {parts.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">
                  No parts registered for this RFQ yet. Add one above.
                </td>
              </tr>
            ) : (
              parts.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                  <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                    {p.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-600 dark:text-zinc-400">
                    {p.drawingRef || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                    {p.material}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {Number(p.grossWtKg).toFixed(3)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {(Number(p.scrapPct) * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                    {p.annualVolume.toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {Number(p.toolingCost) > 0 ? `₹${Number(p.toolingCost).toLocaleString("en-IN")}` : "0"}
                  </td>
                  <td className="px-4 py-3 text-center font-mono">
                    {p.opsCount} op{p.opsCount === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/parts/${p.id}/costing`}
                      className="inline-flex items-center gap-1 rounded bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                    >
                      Cost Part →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mark Lost Modal */}
      {showLostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-lost-title"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900 dark:border dark:border-zinc-800 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 pb-2 dark:border-zinc-800">
              <h3 id="modal-lost-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Record Commercial Loss Reason
              </h3>
              <button
                type="button"
                onClick={() => setShowLostModal(false)}
                aria-label="Close loss record dialog"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 rounded p-1"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Per Company A sales governance, every lost quote must record an explicit reason for post-bid review and market intelligence.
            </p>

            {lostError && (
              <div className="rounded-md bg-red-50 p-2 text-xs text-red-700 border border-red-200 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
                {lostError}
              </div>
            )}

            <form onSubmit={handleMarkLost} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Lost Reason / Commercial Feedback *
                </label>
                <textarea
                  required
                  rows={3}
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  placeholder="e.g. Competitor quoted 6% lower with local forgings; or OEM postponed model launch."
                  className="mt-1 block w-full rounded-md border border-zinc-300 p-2.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowLostModal(false)}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={markingLost}
                  className="rounded-md bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {markingLost ? "Saving..." : "Confirm Loss"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Part Modal */}
      {showAddPart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-add-part-title"
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900 dark:border dark:border-zinc-800 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
              <h3 id="modal-add-part-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Add Part to {rfq.rfqNo}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddPart(false)}
                aria-label="Close add part modal"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 rounded p-1"
              >
                ✕
              </button>
            </div>

            {partError && (
              <div className="rounded-md bg-red-50 p-2 text-xs text-red-700 border border-red-200 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
                {partError}
              </div>
            )}

            <form onSubmit={handleAddPart} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Part Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Drive Spindle Shaft"
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Material Grade *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EN8, 40Cr4, 20MnCr5"
                    value={material}
                    onChange={(e) => setMaterial(e.target.value.toUpperCase())}
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Drawing Ref / Rev
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. DWG-2026-A1"
                    value={drawingRef}
                    onChange={(e) => setDrawingRef(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Gross Weight (kg) *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    placeholder="0.610"
                    value={grossWtKg}
                    onChange={(e) => setGrossWtKg(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Scrap Factor (0-0.5) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="0.5"
                    required
                    placeholder="0.08"
                    value={scrapPct}
                    onChange={(e) => setScrapPct(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Annual Volume *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="180000"
                    value={annualVolume}
                    onChange={(e) => setAnnualVolume(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Tooling Cost (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="0"
                    value={toolingCost}
                    onChange={(e) => setToolingCost(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Tooling Amortisation (Yrs)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    placeholder="2.0"
                    value={toolingYears}
                    onChange={(e) => setToolingYears(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddPart(false)}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPart}
                  className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {savingPart ? "Adding..." : "Add Part"}
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
      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400">
        Overdue
      </span>
    );
  }
  if (urgency === "due_soon") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400">
        Due Soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400">
      On Track
    </span>
  );
}

function StatusBadge({ status }: { status: "estimating" | "sent" | "won" | "lost" }) {
  switch (status) {
    case "estimating":
      return (
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400">
          Estimating
        </span>
      );
    case "sent":
      return (
        <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-400">
          Sent
        </span>
      );
    case "won":
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400">
          Won
        </span>
      );
    case "lost":
      return (
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300">
          Lost
        </span>
      );
  }
}
