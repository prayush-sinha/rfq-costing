"use client";

import { useState, useTransition } from "react";
import { runAiIntake, decideSuggestion, DiscardedField } from "@/app/rfqs/[id]/intake-actions";

export interface SuggestionItem {
  id: number;
  rfqId: number;
  partRef: string;
  field: string;
  value: string;
  sourceText: string;
  confidence: string;
  status: "pending" | "accepted" | "rejected";
  decidedAt?: Date | null;
  decidedBy?: string | null;
}

interface IntakePanelProps {
  rfqId: number;
  initialSuggestions: SuggestionItem[];
  userRole: "estimator" | "sales_head";
}

const SAMPLE_RFQ_EMAIL = `From: sourcing@bajaj.com
To: sales@companya.in
Date: 04 Nov 2026
Subject: Urgent RFQ: Starter Motor Spindle Shaft & Pinion Requirement

Dear Team at Company A,

We are looking to source high-precision forged and machined components for our upcoming starter motor assembly line in Chakan.

Please find the technical and commercial parameters below:
- Item Description: Starter Spindle Shaft (Part Ref: SP-9921)
- Raw Material Specification: EN8D forging quality (machining grade)
- Estimated Component Gross Weight: 0.610 kg per piece (forging blank)
- Annual Volume Requirement: 1.8 lakh pcs per annum (180,000 units/year)
- Commercial Submission Deadline: 2026-11-20

Kindly evaluate your manufacturing feasibility and provide your formal commercial quote schedule (1-piece, 6-month, and annual volume tiers) by the stated due date.

Best regards,
Head of Sourcing & Supply Chain
Bajaj Auto Limited, Chakan, Pune`;

export function IntakePanel({ rfqId, initialSuggestions, userRole: _userRole }: IntakePanelProps) {
  const [emailText, setEmailText] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>(initialSuggestions);
  const [discarded, setDiscarded] = useState<DiscardedField[]>([]);
  const [activePath, setActivePath] = useState<"ai" | "fallback" | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const [decidingId, setDecidingId] = useState<number | null>(null);

  const handleLoadSample = () => {
    setEmailText(SAMPLE_RFQ_EMAIL);
    setErrorMessage(null);
  };

  const handleExtract = async () => {
    if (!emailText.trim()) {
      setErrorMessage("Please paste RFQ email text or click 'Load Sample RFQ Email'.");
      return;
    }
    setErrorMessage(null);
    setInfoMessage(null);

    startTransition(async () => {
      try {
        const res = await runAiIntake(rfqId, emailText);
        if (res.success) {
          setActivePath(res.path);
          setDiscarded(res.discarded);
          if (res.message) setInfoMessage(res.message);
          window.location.reload();
        }
      } catch (err: any) {
        setErrorMessage(err?.message || "Failed to extract RFQ fields.");
      }
    });
  };

  const handleDecision = async (id: number, decision: "accepted" | "rejected") => {
    setDecidingId(id);
    setErrorMessage(null);
    try {
      await decideSuggestion(id, decision);
      setSuggestions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: decision } : s))
      );
      window.location.reload();
    } catch (err: any) {
      setErrorMessage(err?.message || `Failed to ${decision} suggestion`);
    } finally {
      setDecidingId(null);
    }
  };

  const pendingCount = suggestions.filter((s) => s.status === "pending").length;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              AI Email Intake & Parameter Verification
            </h3>
            {activePath && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
                  activePath === "ai"
                    ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300"
                    : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300"
                }`}
              >
                {activePath === "ai" ? "✦ Claude 3.5 Sonnet" : "⚡ Basic Heuristic Parser"}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Automated parameter extraction with deterministic source quote verification and human-in-the-loop review.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadSample}
          className="self-start sm:self-auto inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 dark:focus-visible:ring-zinc-100 transition-colors shadow-xs"
        >
          📄 Load Sample RFQ Email
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Email Input Box */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300">
            <label htmlFor="rfq-email-input" className="font-semibold">
              Customer RFQ Email Prose
            </label>
            <span className="text-zinc-400 font-mono text-[11px]">
              {emailText.length} / 20,000 chars
            </span>
          </div>
          <textarea
            id="rfq-email-input"
            rows={5}
            value={emailText}
            maxLength={20000}
            onChange={(e) => setEmailText(e.target.value)}
            placeholder="Paste raw customer RFQ inquiry or email text here..."
            className="w-full rounded-lg border border-zinc-300 bg-zinc-50/50 p-3 text-xs font-mono text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus-visible:ring-zinc-100 transition-colors"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-zinc-500">
              * Inputs are verified word-for-word against prose. AI is strictly prohibited in cost maths.
            </span>
            <button
              type="button"
              onClick={handleExtract}
              disabled={isPending || !emailText.trim()}
              className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus-visible:ring-zinc-100 transition-colors shadow-sm"
            >
              {isPending ? "Analyzing & Verifying Quotes..." : "✦ Analyze & Extract Parameters"}
            </button>
          </div>
        </div>

        {/* Notifications */}
        {errorMessage && (
          <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200 dark:bg-red-950/40 dark:border-red-900 dark:text-red-400">
            {errorMessage}
          </div>
        )}
        {infoMessage && (
          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-400">
            {infoMessage}
          </div>
        )}

        {/* Discarded fields banner */}
        {discarded.length > 0 && (
          <div className="rounded-lg bg-amber-50/60 p-4 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
              <span>⚠️ Discarded Untrusted Extraction(s):</span>
              <span className="font-normal">
                {discarded.length} candidate(s) failed deterministic source verification.
              </span>
            </div>
            <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside">
              {discarded.map((d, i) => (
                <li key={i}>
                  <strong className="font-mono">{d.field}</strong> ({d.value}): {d.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggestions Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 font-mono">
              Extracted Parameters & Suggestions ({suggestions.length})
            </h4>
            {pendingCount > 0 && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {pendingCount} awaiting estimator decision
              </span>
            )}
          </div>

          {suggestions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 p-8 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              No extracted suggestions yet. Paste customer RFQ email above and click &quot;Analyze &amp; Extract Parameters&quot; or &quot;Load Sample RFQ Email&quot;.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs divide-y divide-zinc-200 dark:divide-zinc-800">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 font-mono text-[11px] text-zinc-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Field</th>
                    <th className="px-4 py-2.5">Extracted Value</th>
                    <th className="px-4 py-2.5">Verbatim Source Quote</th>
                    <th className="px-4 py-2.5">Confidence</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Review Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                  {suggestions.map((sug) => {
                    const conf = parseFloat(sug.confidence);
                    const isLowConf = conf < 0.7;

                    return (
                      <tr key={sug.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 font-mono">
                          {formatFieldName(sug.field)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                          {sug.value}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 max-w-xs truncate" title={sug.sourceText}>
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                            &quot;{sug.sourceText}&quot;
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                              isLowConf
                                ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                            }`}
                          >
                            {(conf * 100).toFixed(0)}% {isLowConf ? "⚠️ Low" : "✓ High"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={sug.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {sug.status === "pending" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={decidingId === sug.id}
                                onClick={() => handleDecision(sug.id, "accepted")}
                                aria-label={`Accept extraction for ${formatFieldName(sug.field)}: ${sug.value}`}
                                className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 transition-colors shadow-2xs"
                              >
                                {decidingId === sug.id ? "Saving..." : "Accept"}
                              </button>
                              <button
                                type="button"
                                disabled={decidingId === sug.id}
                                onClick={() => handleDecision(sug.id, "rejected")}
                                aria-label={`Reject extraction for ${formatFieldName(sug.field)}`}
                                className="rounded border border-zinc-300 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 dark:focus-visible:ring-zinc-100 transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-zinc-400">
                              {sug.status === "accepted" ? "Applied to Scope" : "Discarded"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatFieldName(name: string): string {
  switch (name) {
    case "part_name":
      return "Component / Part Name";
    case "material":
      return "Material Grade";
    case "gross_wt_kg":
      return "Gross Weight (kg)";
    case "annual_volume":
      return "Annual Volume (pcs)";
    case "due_date":
      return "Quotation Due Date";
    default:
      return name;
  }
}

function StatusBadge({ status }: { status: "pending" | "accepted" | "rejected" }) {
  if (status === "accepted") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400">
        Accepted
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400">
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400">
      Pending Review
    </span>
  );
}
