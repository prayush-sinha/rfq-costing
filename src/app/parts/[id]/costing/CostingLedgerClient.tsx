"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { saveCosting, repriceWithLatestRates } from "@/lib/quotes/actions";
import { D, costTier, Breakdown } from "@/lib/costing/engine";
import { buildRateBook, MissingRateError, RateRows } from "@/lib/costing/rates";
import { getRoutingSuggestions, logRoutingSuggestionApplied } from "@/lib/ai/routing-actions";
import { Suggestion } from "@/lib/ai/suggest-routing";
import { submitQuoteForApproval } from "@/app/approvals/actions";

export interface PartCostingData {
  id: number;
  rfqId: number;
  rfqNo: string;
  customerName: string;
  name: string;
  drawingRef?: string | null;
  material: string;
  grossWtKg: string;
  scrapPct: string;
  annualVolume: number;
  toolingCost: string;
  toolingYears: string;
}

export interface QuoteCostingData {
  id: number;
  version: number;
  asOfDate: string;
  status: string;
}

export interface InitialOp {
  seq: number;
  opName: string;
  machineCode: string;
  cycleMin: string;
  setupMin: string;
}

export interface InitialTier {
  tierNo: number;
  volume: number;
  lotSize: string;
  marginPct: string;
}

interface CostingLedgerClientProps {
  part: PartCostingData;
  quote: QuoteCostingData;
  existingOps: InitialOp[];
  existingTiers: InitialTier[];
  rateRows: RateRows;
  availableMachines: { machineCode: string; hourRate: string }[];
  hasNewerRates: boolean;
  userRole: "estimator" | "sales_head";
}

export function CostingLedgerClient({
  part,
  quote,
  existingOps,
  existingTiers,
  rateRows,
  availableMachines,
  hasNewerRates,
  userRole,
}: CostingLedgerClientProps) {
  const [currentVersion, setCurrentVersion] = useState(quote.version);
  const [asOfDate, setAsOfDate] = useState(quote.asOfDate);
  const [newerRatesBanner, setNewerRatesBanner] = useState(hasNewerRates);

  // Form states
  const [grossWtKg, setGrossWtKg] = useState(part.grossWtKg);
  const [scrapPct, setScrapPct] = useState(part.scrapPct);
  const [toolingCost, setToolingCost] = useState(part.toolingCost);
  const [toolingYears, setToolingYears] = useState(part.toolingYears);

  // Operations state
  const [ops, setOps] = useState<InitialOp[]>(
    existingOps.length > 0
      ? existingOps
      : [
          {
            seq: 1,
            opName: "Machining & Turning",
            machineCode: availableMachines[0]?.machineCode || "M-850",
            cycleMin: "3.200",
            setupMin: "45.00",
          },
        ]
  );

  // Default tiers: 0.5x, 1x, 2x of annualVolume
  const defaultTiers: InitialTier[] = [
    {
      tierNo: 1,
      volume: Math.round(part.annualVolume * 0.5),
      lotSize: String(Math.round((part.annualVolume * 0.5) / 12)),
      marginPct: "0.1200",
    },
    {
      tierNo: 2,
      volume: part.annualVolume,
      lotSize: String(Math.round(part.annualVolume / 12)),
      marginPct: "0.1200",
    },
    {
      tierNo: 3,
      volume: Math.round(part.annualVolume * 2),
      lotSize: String(Math.round((part.annualVolume * 2) / 12)),
      marginPct: "0.1200",
    },
  ];

  const [tiers, setTiers] = useState<InitialTier[]>(
    existingTiers.length === 3 ? existingTiers : defaultTiers
  );

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [submittingApproval, setSubmittingApproval] = useState(false);

  const handleSubmitForApproval = async () => {
    if (!confirm("Submit this quote for managerial approval / commercial release?")) return;
    setSubmittingApproval(true);
    try {
      const res = await submitQuoteForApproval(quote.id);
      alert(res.message);
      window.location.reload();
    } catch (err: any) {
      alert(err?.message || "Failed to submit quote");
    } finally {
      setSubmittingApproval(false);
    }
  };

  // Routing Suggestions state
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const handleOpenSuggestions = async () => {
    setShowSuggestionsModal(true);
    setLoadingSuggestions(true);
    setSuggestionsError(null);
    try {
      const res = await getRoutingSuggestions(part.id);
      setSuggestions(res.suggestions);
    } catch (err: any) {
      setSuggestionsError(err?.message || "Failed to load routing suggestions");
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleApplySuggestion = async (sug: Suggestion) => {
    const newOps: InitialOp[] = sug.source.ops.map((op, i) => ({
      seq: i + 1,
      opName: op.opName,
      machineCode: op.machineCode || availableMachines[0]?.machineCode || "CNC-LATHE-01",
      cycleMin: op.cycleMin.toFixed(3),
      setupMin: op.setupMin.toFixed(2),
    }));

    setOps(newOps);
    setShowSuggestionsModal(false);

    try {
      await logRoutingSuggestionApplied(part.id, sug.source.quoteNo);
    } catch (e) {
      console.warn("Audit logging for suggestion failed:", e);
    }
  };

  // Build rate book as of the pinned quote date
  const rateBook = useMemo(() => {
    return buildRateBook(rateRows, asOfDate);
  }, [rateRows, asOfDate]);

  // Evaluate costing live across all 3 tiers using pure deterministic engine
  const { breakdowns, missingRateError } = useMemo(() => {
    try {
      const matRate = rateBook.materialPerKg(part.material);
      const scrapRate = rateBook.scrapPerKg(part.material);
      const overheadRate = rateBook.param("overhead_pct");
      const packingRate = rateBook.param("packing_per_unit");
      const freightRate = rateBook.param("freight_per_kg");
      const gstRate = rateBook.param("gst_pct");

      const engineRates = {
        materialPerKg: new D(matRate.value),
        scrapPerKg: new D(scrapRate.value),
        overheadPct: new D(overheadRate.value),
        packingPerUnit: new D(packingRate.value),
        freightPerKg: new D(freightRate.value),
        gstPct: new D(gstRate.value),
      };

      const engineOps = ops.map((o) => ({
        cycleMin: new D(o.cycleMin || "0.001"),
        setupMin: new D(o.setupMin || "0"),
        hourRate: new D(rateBook.machineHourRate(o.machineCode).value),
      }));

      const partInput = {
        grossWtKg: new D(grossWtKg || "0.001"),
        scrapPct: new D(scrapPct || "0"),
        toolingCost: new D(toolingCost || "0"),
        toolingYears: new D(toolingYears || "1"),
        ops: engineOps,
      };

      const bks: (Breakdown | null)[] = tiers.map((t) => {
        try {
          return costTier(partInput, engineRates, {
            volume: new D(t.volume || 1),
            lotSize: new D(t.lotSize || 1),
            marginPct: new D(t.marginPct || "0.12"),
          });
        } catch {
          return null;
        }
      });

      return { breakdowns: bks, missingRateError: null };
    } catch (err: any) {
      if (err instanceof MissingRateError) {
        return { breakdowns: [null, null, null], missingRateError: err.message };
      }
      return { breakdowns: [null, null, null], missingRateError: err?.message || "Costing calculation error" };
    }
  }, [rateBook, part.material, grossWtKg, scrapPct, toolingCost, toolingYears, ops, tiers]);

  const handleAddOp = () => {
    setOps((prev) => [
      ...prev,
      {
        seq: prev.length + 1,
        opName: `Operation ${prev.length + 1}`,
        machineCode: availableMachines[0]?.machineCode || "M-850",
        cycleMin: "1.000",
        setupMin: "30.00",
      },
    ]);
  };

  const handleRemoveOp = (idx: number) => {
    setOps((prev) => prev.filter((_, i) => i !== idx).map((op, i) => ({ ...op, seq: i + 1 })));
  };

  const handleOpChange = (idx: number, field: keyof InitialOp, val: string) => {
    setOps((prev) =>
      prev.map((op, i) => (i === idx ? { ...op, [field]: val } : op))
    );
  };

  const handleTierChange = (idx: number, field: keyof InitialTier, val: any) => {
    setTiers((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [field]: val } : t))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setConflictError(null);
    setSaveSuccess(false);

    try {
      const res = await saveCosting({
        quoteId: quote.id,
        expectedVersion: currentVersion,
        parts: {
          partId: part.id,
          ops,
          tiers,
          toolingCost,
          toolingYears,
        },
      });

      setCurrentVersion(res.version);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      if (err?.name === "ConflictError" || err?.message?.includes("ConflictError") || err?.message?.includes("modified")) {
        setConflictError(
          "Quote was modified by another session or user. Please reload the latest version to avoid overwriting changes."
        );
      } else {
        setConflictError(err?.message || "Failed to save costing");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReprice = async () => {
    if (!confirm("Re-price this quote with current active rate masters? This will update the pinned as-of date.")) return;
    try {
      const res = await repriceWithLatestRates(quote.id);
      if (res?.success) {
        setAsOfDate(res.newAsOfDate);
        setNewerRatesBanner(false);
        window.location.reload();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to re-price");
    }
  };

  const isEstimator = userRole === "estimator";

  return (
    <div className="space-y-6">
      {/* Newer Rates Available Banner */}
      {newerRatesBanner && (
        <div className="flex items-center justify-between rounded-xl bg-blue-50 border border-blue-200 p-4 dark:bg-blue-950/40 dark:border-blue-900">
          <div className="flex items-center gap-3">
            <span className="text-blue-700 dark:text-blue-400 font-bold text-sm">ℹ</span>
            <div className="text-xs text-blue-900 dark:text-blue-300">
              <span className="font-semibold">Newer rate masters are available:</span> This quote is pinned to rates effective as of <span className="font-mono font-semibold">{asOfDate}</span>. Updated rates have since been published.
            </div>
          </div>
          {isEstimator && (
            <button
              onClick={handleReprice}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
            >
              Re-price with Latest Rates
            </button>
          )}
        </div>
      )}

      {/* Missing Rate Error Banner */}
      {missingRateError && (
        <div className="rounded-xl bg-red-50 border border-red-300 p-4 dark:bg-red-950/40 dark:border-red-900 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-800 dark:text-red-300">
            <span>⚠ Missing Rate Master:</span>
            <span>{missingRateError}</span>
          </div>
          <p className="text-[11px] text-red-600 dark:text-red-400">
            Per Company A policy, costing cannot default missing rates to zero. Please add the required rate in <Link href="/rates" className="underline font-semibold">Rate Masters</Link> first.
          </p>
        </div>
      )}

      {/* Conflict Error Banner */}
      {conflictError && (
        <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-300 p-4 dark:bg-amber-950/40 dark:border-amber-900">
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <span className="font-semibold">Concurrent Edit Detected:</span> {conflictError}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-amber-800 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-900 transition-colors"
          >
            Reload Page
          </button>
        </div>
      )}

      {/* Header Info */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                {part.name}
              </h1>
              <span className="font-mono text-xs text-zinc-500">
                Drawing: {part.drawingRef || "Standard Spec"}
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
              RFQ: <Link href={`/rfqs/${part.rfqId}`} className="font-mono font-semibold text-blue-600 dark:text-blue-400 hover:underline">{part.rfqNo}</Link> • Customer: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{part.customerName}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-xs font-mono">
              <span className="text-zinc-500">Quote Version: </span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">v{currentVersion}</span>
              <span className="text-zinc-400 ml-2">({asOfDate})</span>
            </div>

            {isEstimator ? (
              <button
                onClick={handleSave}
                disabled={saving || Boolean(missingRateError)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-sm transition-colors"
              >
                {saving ? "Saving..." : saveSuccess ? "✓ Saved" : "Save Costing"}
              </button>
            ) : (
              <span className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                View-Only (Sales Head)
              </span>
            )}
          </div>
        </div>

        {/* Part Parameters Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-xs">
          <div>
            <label className="block text-zinc-500 font-mono text-[11px] uppercase">
              Material Grade
            </label>
            <div className="font-mono font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
              {part.material}
            </div>
          </div>
          <div>
            <label className="block text-zinc-500 font-mono text-[11px] uppercase">
              Gross Weight (kg)
            </label>
            <input
              type="number"
              step="0.001"
              value={grossWtKg}
              disabled={!isEstimator}
              onChange={(e) => setGrossWtKg(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-300 px-2 py-1 text-xs font-mono tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-zinc-500 font-mono text-[11px] uppercase">
              Scrap Recovery %
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="0.5"
              value={scrapPct}
              disabled={!isEstimator}
              onChange={(e) => setScrapPct(e.target.value)}
              className="mt-0.5 block w-full rounded border border-zinc-300 px-2 py-1 text-xs font-mono tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="block text-zinc-500 font-mono text-[11px] uppercase">
              Tooling Cost (₹) & Yrs
            </label>
            <div className="flex gap-1.5 mt-0.5">
              <input
                type="number"
                step="1000"
                value={toolingCost}
                disabled={!isEstimator}
                onChange={(e) => setToolingCost(e.target.value)}
                placeholder="₹ Cost"
                className="block w-2/3 rounded border border-zinc-300 px-2 py-1 text-xs font-mono tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <input
                type="number"
                step="0.5"
                value={toolingYears}
                disabled={!isEstimator}
                onChange={(e) => setToolingYears(e.target.value)}
                placeholder="Yrs"
                className="block w-1/3 rounded border border-zinc-300 px-2 py-1 text-xs font-mono tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Costing Grid: Left Operations, Right 3-Tier Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Routing Operations Table (5 cols on lg) */}
        <div className="lg:col-span-5 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Routing Operations ({ops.length})
              </h2>
              <p className="text-[11px] text-zinc-500">
                Machining process cycle and setup times.
              </p>
            </div>
            {isEstimator && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenSuggestions}
                  className="rounded bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 text-xs font-semibold hover:bg-purple-100 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-300 transition-colors shadow-xs"
                >
                  ✦ Suggest Routings
                </button>
                <button
                  type="button"
                  onClick={handleAddOp}
                  className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  + Add Op
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {ops.map((op, idx) => {
              let machineRate = "—";
              try {
                machineRate = `₹${rateBook.machineHourRate(op.machineCode).value}/hr`;
              } catch {}

              return (
                <div
                  key={idx}
                  className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 space-y-2 bg-zinc-50/50 dark:bg-zinc-950/40"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">
                      #{op.seq}
                    </span>
                    <input
                      type="text"
                      value={op.opName}
                      disabled={!isEstimator}
                      onChange={(e) => handleOpChange(idx, "opName", e.target.value)}
                      placeholder="Operation Name"
                      className="w-2/3 rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    {isEstimator && ops.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOp(idx)}
                        aria-label={`Remove operation ${op.seq}: ${op.opName}`}
                        className="text-red-500 hover:text-red-700 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 rounded p-0.5"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] text-zinc-500 font-mono">
                        Machine
                      </label>
                      <select
                        value={op.machineCode}
                        disabled={!isEstimator}
                        onChange={(e) => handleOpChange(idx, "machineCode", e.target.value)}
                        className="mt-0.5 block w-full rounded border border-zinc-300 px-1.5 py-1 text-xs font-mono text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      >
                        {availableMachines.map((m) => (
                          <option key={m.machineCode} value={m.machineCode}>
                            {m.machineCode}
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-zinc-400 font-mono">{machineRate}</span>
                    </div>

                    <div>
                      <label className="block text-[10px] text-zinc-500 font-mono">
                        Cycle (min)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.01"
                        value={op.cycleMin}
                        disabled={!isEstimator}
                        onChange={(e) => handleOpChange(idx, "cycleMin", e.target.value)}
                        className="mt-0.5 block w-full rounded border border-zinc-300 px-1.5 py-1 text-xs font-mono tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-zinc-500 font-mono">
                        Setup (min)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={op.setupMin}
                        disabled={!isEstimator}
                        onChange={(e) => handleOpChange(idx, "setupMin", e.target.value)}
                        className="mt-0.5 block w-full rounded border border-zinc-300 px-1.5 py-1 text-xs font-mono tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: 3-Tier Calm Costing Ledger (7 cols on lg) */}
        <div className="lg:col-span-7 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm space-y-4">
          <div className="border-b border-zinc-200 pb-3 dark:border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              3-Volume Commercial Cost Ledger
            </h2>
            <p className="text-[11px] text-zinc-500">
              Deterministic manufacturing breakdown evaluated live with full 40-digit precision.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs divide-y divide-zinc-200 dark:divide-zinc-800">
              <thead>
                <tr className="font-mono text-zinc-500 uppercase tracking-wider text-[11px]">
                  <th className="py-2 text-left font-semibold">Cost Component</th>
                  {tiers.map((t, idx) => (
                    <th key={t.tierNo} className="py-2 text-right font-semibold">
                      Tier {t.tierNo} ({idx === 0 ? "0.5x" : idx === 1 ? "1.0x" : "2.0x"})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-mono">
                {/* Volume Row */}
                <tr>
                  <td className="py-2 text-zinc-700 dark:text-zinc-300 font-sans font-medium">
                    Annual Volume (units)
                  </td>
                  {tiers.map((t, i) => (
                    <td key={i} className="py-2 text-right tabular-nums font-semibold">
                      <input
                        type="number"
                        value={t.volume}
                        disabled={!isEstimator}
                        onChange={(e) => handleTierChange(i, "volume", Number(e.target.value))}
                        className="w-24 text-right rounded border border-zinc-200 px-1 py-0.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                    </td>
                  ))}
                </tr>

                {/* Batch / Lot Size */}
                <tr>
                  <td className="py-2 text-zinc-700 dark:text-zinc-300 font-sans font-medium">
                    Production Lot Size
                  </td>
                  {tiers.map((t, i) => (
                    <td key={i} className="py-2 text-right tabular-nums">
                      <input
                        type="number"
                        value={t.lotSize}
                        disabled={!isEstimator}
                        onChange={(e) => handleTierChange(i, "lotSize", e.target.value)}
                        className="w-24 text-right rounded border border-zinc-200 px-1 py-0.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                    </td>
                  ))}
                </tr>

                {/* Material Cost */}
                <tr className="text-zinc-800 dark:text-zinc-200">
                  <td className="py-2 text-zinc-700 dark:text-zinc-300 font-sans">
                    Raw Material Cost
                  </td>
                  {breakdowns.map((b, i) => (
                    <td key={i} className="py-2 text-right tabular-nums">
                      {b ? `₹${b.material.toFixed(2)}` : "—"}
                    </td>
                  ))}
                </tr>

                {/* Scrap Credit */}
                <tr className="text-emerald-700 dark:text-emerald-400">
                  <td className="py-2 text-zinc-700 dark:text-zinc-300 font-sans">
                    Less: Scrap Recovery Credit
                  </td>
                  {breakdowns.map((b, i) => (
                    <td key={i} className="py-2 text-right tabular-nums">
                      {b ? `-₹${b.scrapCredit.toFixed(2)}` : "—"}
                    </td>
                  ))}
                </tr>

                {/* Conversion Cost */}
                <tr className="text-zinc-800 dark:text-zinc-200">
                  <td className="py-2 text-zinc-700 dark:text-zinc-300 font-sans">
                    Conversion Cost (Cycle + Setup)
                  </td>
                  {breakdowns.map((b, i) => (
                    <td key={i} className="py-2 text-right tabular-nums">
                      {b ? `₹${b.conversion.toFixed(2)}` : "—"}
                    </td>
                  ))}
                </tr>

                {/* Overheads */}
                <tr className="text-zinc-800 dark:text-zinc-200">
                  <td className="py-2 text-zinc-700 dark:text-zinc-300 font-sans">
                    Plant Overheads (SG&A)
                  </td>
                  {breakdowns.map((b, i) => (
                    <td key={i} className="py-2 text-right tabular-nums">
                      {b ? `₹${b.overhead.toFixed(2)}` : "—"}
                    </td>
                  ))}
                </tr>

                {/* Packing & Freight */}
                <tr className="text-zinc-800 dark:text-zinc-200">
                  <td className="py-2 text-zinc-700 dark:text-zinc-300 font-sans">
                    Packing & Freight
                  </td>
                  {breakdowns.map((b, i) => (
                    <td key={i} className="py-2 text-right tabular-nums">
                      {b ? `₹${b.packing.plus(b.freight).toFixed(2)}` : "—"}
                    </td>
                  ))}
                </tr>

                {/* Tooling Amortisation */}
                <tr className="text-zinc-800 dark:text-zinc-200">
                  <td className="py-2 text-zinc-700 dark:text-zinc-300 font-sans">
                    Tooling Amortisation
                  </td>
                  {breakdowns.map((b, i) => (
                    <td key={i} className="py-2 text-right tabular-nums">
                      {b ? `₹${b.tooling.toFixed(2)}` : "—"}
                    </td>
                  ))}
                </tr>

                {/* Net Cost */}
                <tr className="bg-zinc-50 dark:bg-zinc-950/60 font-semibold text-zinc-900 dark:text-zinc-100">
                  <td className="py-2.5 text-zinc-900 dark:text-zinc-100 font-sans">
                    Net Unit Cost (₹)
                  </td>
                  {breakdowns.map((b, i) => (
                    <td key={i} className="py-2.5 text-right tabular-nums">
                      {b ? `₹${b.cost.toFixed(2)}` : "—"}
                    </td>
                  ))}
                </tr>

                {/* Commercial Margin % */}
                <tr>
                  <td className="py-2 text-zinc-700 dark:text-zinc-300 font-sans font-medium">
                    Commercial Margin %
                  </td>
                  {tiers.map((t, i) => (
                    <td key={i} className="py-2 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="0.99"
                          value={t.marginPct}
                          disabled={!isEstimator}
                          onChange={(e) => handleTierChange(i, "marginPct", e.target.value)}
                          className="w-16 text-right rounded border border-zinc-200 px-1 py-0.5 text-xs font-mono text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                        <span className="text-[11px] text-zinc-500">
                          ({(Number(t.marginPct) * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>

                {/* Piece Price Excl GST */}
                <tr className="font-bold text-sm text-zinc-900 dark:text-zinc-50 bg-blue-50/50 dark:bg-blue-950/30">
                  <td className="py-2.5 text-zinc-900 dark:text-zinc-100 font-sans">
                    Quoted Piece Price (excl. GST)
                  </td>
                  {breakdowns.map((b, i) => (
                    <td key={i} className="py-2.5 text-right tabular-nums text-blue-700 dark:text-blue-400">
                      {b ? `₹${b.price.toFixed(2)}` : "—"}
                    </td>
                  ))}
                </tr>

                {/* GST (18%) */}
                <tr className="text-zinc-600 dark:text-zinc-400">
                  <td className="py-2 text-zinc-600 dark:text-zinc-400 font-sans text-xs">
                    GST (18%)
                  </td>
                  {breakdowns.map((b, i) => (
                    <td key={i} className="py-2 text-right tabular-nums">
                      {b ? `₹${b.gst.toFixed(2)}` : "—"}
                    </td>
                  ))}
                </tr>

                {/* Total Price Incl GST */}
                <tr className="font-bold text-zinc-900 dark:text-zinc-100 border-t-2 border-zinc-300 dark:border-zinc-700">
                  <td className="py-2 text-zinc-900 dark:text-zinc-100 font-sans text-xs">
                    Total Piece Price (incl. GST)
                  </td>
                  {breakdowns.map((b, i) => (
                    <td key={i} className="py-2 text-right tabular-nums">
                      {b ? `₹${b.priceInclGst.toFixed(2)}` : "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Summary Bar */}
      <div className="sticky bottom-0 z-30 rounded-xl border border-zinc-300 bg-white/95 p-4 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="text-xs">
              <span className="font-mono text-zinc-500 uppercase">Part Summary</span>
              <div className="font-bold text-zinc-900 dark:text-zinc-100">{part.name}</div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              {tiers.map((t, idx) => {
                const b = breakdowns[idx];
                return (
                  <div key={t.tierNo} className="border-l border-zinc-200 pl-3 dark:border-zinc-700">
                    <span className="text-zinc-500 text-[10px]">Tier {t.tierNo} Price</span>
                    <div className="font-bold text-blue-700 dark:text-blue-400 text-sm">
                      {b ? `₹${b.price.toFixed(2)}` : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/rfqs/${part.rfqId}`}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
            >
              ← Back to RFQ
            </Link>

            {isEstimator && (
              <button
                onClick={handleSave}
                disabled={saving || Boolean(missingRateError)}
                className="rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors shadow-sm"
              >
                {saving ? "Saving..." : saveSuccess ? "✓ Costing Saved" : "Save Changes"}
              </button>
            )}

            {quote.status === "draft" && (
              <button
                onClick={handleSubmitForApproval}
                disabled={submittingApproval}
                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs"
              >
                {submittingApproval ? "Submitting..." : "Submit Quote"}
              </button>
            )}

            <a
              href={`/api/quotes/${quote.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors shadow-xs"
            >
              📄 PDF Offer
            </a>
          </div>
        </div>
      </div>
      {/* Routing Suggestions Modal */}
      {showSuggestionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="routing-suggestions-title"
            className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
              <div>
                <h3 id="routing-suggestions-title" className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <span>✦ Historical Routing Suggestions</span>
                  <span className="rounded bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                    Similarity Ranked
                  </span>
                </h3>
                <p className="text-xs text-zinc-500">
                  Top 3 matching past parts with identical material ({part.material}) and ±30% gross blank weight.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSuggestionsModal(false)}
                aria-label="Close routing suggestions modal"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 rounded p-1"
              >
                ✕
              </button>
            </div>

            {loadingSuggestions ? (
              <div className="py-12 text-center text-xs text-zinc-500">
                Searching 1,400+ past quotes and costed parts for similar routings...
              </div>
            ) : suggestionsError ? (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
                {suggestionsError}
              </div>
            ) : suggestions.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-500 space-y-1">
                <p>No similar historical parts found matching material <strong>{part.material}</strong> within ±30% blank weight ({part.grossWtKg} kg).</p>
                <p className="text-[11px] text-zinc-400">Add routing operations manually using the &quot;+ Add Op&quot; button.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {suggestions.map((sug, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                            {sug.source.partName}
                          </span>
                          <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-mono font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                            {sug.source.quoteNo}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                          Grade: {sug.source.material} • Gross Wt: {sug.source.grossWtKg.toFixed(3)} kg
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          Score: {sug.score.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Operations Sequence */}
                    <div className="rounded border border-zinc-200/80 bg-white p-2.5 dark:border-zinc-700/60 dark:bg-zinc-900/60 text-xs space-y-1.5">
                      <span className="text-[10px] uppercase font-mono text-zinc-400 font-semibold">
                        Suggested Operations ({sug.source.ops.length}):
                      </span>
                      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {sug.source.ops.map((op, oIdx) => (
                          <li key={oIdx} className="py-1 flex items-center justify-between text-xs">
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">
                              {oIdx + 1}. {op.opName}
                            </span>
                            <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                              Cycle: {op.cycleMin.toFixed(2)}m • Setup: {op.setupMin.toFixed(0)}m
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => handleApplySuggestion(sug)}
                        className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition-colors shadow-xs"
                      >
                        ✓ Apply Routing Operations
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowSuggestionsModal(false)}
                className="rounded-md border border-zinc-300 px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
