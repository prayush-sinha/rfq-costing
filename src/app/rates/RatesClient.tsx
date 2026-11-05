"use client";

import { useState } from "react";
import { addRate, AddRateResult } from "./actions";

interface MaterialRow {
  id: number;
  grade: string;
  ratePerKg: string;
  scrapRatePerKg: string;
  effectiveFrom: string;
}

interface MachineRow {
  id: number;
  machineCode: string;
  hourRate: string;
  effectiveFrom: string;
}

interface ParamRow {
  id: number;
  key: string;
  value: string;
  effectiveFrom: string;
}

interface RatesClientProps {
  userRole: "estimator" | "sales_head";
  materials: MaterialRow[];
  machines: MachineRow[];
  params: ParamRow[];
  today: string;
}

export function RatesClient({
  userRole,
  materials,
  machines,
  params,
  today,
}: RatesClientProps) {
  const [activeTab, setActiveTab] = useState<"materials" | "machines" | "params">("materials");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addKind, setAddKind] = useState<"material" | "machine" | "param">("material");

  // Form states
  const [grade, setGrade] = useState("");
  const [ratePerKg, setRatePerKg] = useState("");
  const [scrapRatePerKg, setScrapRatePerKg] = useState("");
  const [machineCode, setMachineCode] = useState("");
  const [hourRate, setHourRate] = useState("");
  const [paramKey, setParamKey] = useState<
    "overhead_pct" | "packing_per_unit" | "freight_per_kg" | "gst_pct" | "default_margin_pct"
  >("overhead_pct");
  const [paramValue, setParamValue] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today);

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleOpenModal = (kind: "material" | "machine" | "param") => {
    setAddKind(kind);
    setFormError(null);
    setFormSuccess(null);
    setEffectiveFrom(today);
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);

    let payload: any;
    if (addKind === "material") {
      payload = { grade, ratePerKg, scrapRatePerKg, effectiveFrom };
    } else if (addKind === "machine") {
      payload = { machineCode, hourRate, effectiveFrom };
    } else {
      payload = { key: paramKey, value: paramValue, effectiveFrom };
    }

    try {
      const res: AddRateResult = await addRate(addKind, payload);
      if ("error" in res) {
        setFormError(res.message);
      } else if (res.success) {
        setFormSuccess("Rate published successfully! Page updated.");
        setTimeout(() => {
          setShowAddModal(false);
          setFormSuccess(null);
          // Reset fields
          setGrade("");
          setRatePerKg("");
          setScrapRatePerKg("");
          setMachineCode("");
          setHourRate("");
          setParamValue("");
        }, 1200);
      }
    } catch (err: any) {
      setFormError(err?.message || "Failed to publish rate. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to mark status: Active (latest <= today), Future (> today), Superseded (older <= today)
  function classifyRates<T extends { effectiveFrom: string }>(
    items: T[],
    keyFn: (item: T) => string
  ) {
    const grouped = new Map<string, T[]>();
    for (const item of items) {
      const key = keyFn(item);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }

    const statusMap = new Map<T, "active" | "future" | "superseded">();

    grouped.forEach((list) => {
      // list sorted by effectiveFrom DESC
      let foundActive = false;
      for (const item of list) {
        if (item.effectiveFrom > today) {
          statusMap.set(item, "future");
        } else if (!foundActive) {
          statusMap.set(item, "active");
          foundActive = true;
        } else {
          statusMap.set(item, "superseded");
        }
      }
    });

    return statusMap;
  }

  const materialStatus = classifyRates(materials, (m) => m.grade);
  const machineStatus = classifyRates(machines, (m) => m.machineCode);
  const paramStatus = classifyRates(params, (p) => p.key);

  const isSalesHead = userRole === "sales_head";

  return (
    <div className="space-y-6">
      {/* Action / Notification Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("materials")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === "materials"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            Raw Materials ({materials.length})
          </button>
          <button
            onClick={() => setActiveTab("machines")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === "machines"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            Machine Hour Rates ({machines.length})
          </button>
          <button
            onClick={() => setActiveTab("params")}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === "params"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            Commercial Parameters ({params.length})
          </button>
        </div>

        <div>
          {isSalesHead ? (
            <button
              onClick={() => handleOpenModal(activeTab === "materials" ? "material" : activeTab === "machines" ? "machine" : "param")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors shadow-sm"
            >
              <span>+ Add New Rate</span>
            </button>
          ) : (
            <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
              View-Only Mode (Estimator)
            </span>
          )}
        </div>
      </div>

      {/* Tables based on active tab */}
      {activeTab === "materials" && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-mono uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Grade</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Rate / kg (₹)</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Scrap Rate / kg (₹)</th>
                <th scope="col" className="px-4 py-3 font-semibold">Effective From</th>
                <th scope="col" className="px-4 py-3 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {materials.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No material rates recorded yet.
                  </td>
                </tr>
              ) : (
                materials.map((m) => {
                  const status = materialStatus.get(m);
                  return (
                    <tr
                      key={m.id}
                      className={status === "active" ? "bg-emerald-50/30 dark:bg-emerald-950/20 font-medium" : "text-zinc-600 dark:text-zinc-400"}
                    >
                      <td className="px-4 py-2.5 font-mono text-zinc-900 dark:text-zinc-100 font-semibold">
                        {m.grade}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                        ₹{Number(m.ratePerKg).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                        ₹{Number(m.scrapRatePerKg).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-zinc-600 dark:text-zinc-400">
                        {m.effectiveFrom}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <StatusBadge status={status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "machines" && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-mono uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Machine Code</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Hour Rate (₹/hr)</th>
                <th scope="col" className="px-4 py-3 font-semibold">Effective From</th>
                <th scope="col" className="px-4 py-3 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {machines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                    No machine hour rates recorded yet.
                  </td>
                </tr>
              ) : (
                machines.map((m) => {
                  const status = machineStatus.get(m);
                  return (
                    <tr
                      key={m.id}
                      className={status === "active" ? "bg-emerald-50/30 dark:bg-emerald-950/20 font-medium" : "text-zinc-600 dark:text-zinc-400"}
                    >
                      <td className="px-4 py-2.5 font-mono text-zinc-900 dark:text-zinc-100 font-semibold">
                        {m.machineCode}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                        ₹{Number(m.hourRate).toFixed(2)}/hr
                      </td>
                      <td className="px-4 py-2.5 font-mono text-zinc-600 dark:text-zinc-400">
                        {m.effectiveFrom}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <StatusBadge status={status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "params" && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-mono uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Parameter Key</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Value</th>
                <th scope="col" className="px-4 py-3 font-semibold">Effective From</th>
                <th scope="col" className="px-4 py-3 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {params.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                    No commercial parameters recorded yet.
                  </td>
                </tr>
              ) : (
                params.map((p) => {
                  const status = paramStatus.get(p);
                  const isPct = p.key.endsWith("_pct");
                  const formattedVal = isPct
                    ? `${(Number(p.value) * 100).toFixed(1)}% (${p.value})`
                    : `₹${Number(p.value).toFixed(2)}`;

                  return (
                    <tr
                      key={p.id}
                      className={status === "active" ? "bg-emerald-50/30 dark:bg-emerald-950/20 font-medium" : "text-zinc-600 dark:text-zinc-400"}
                    >
                      <td className="px-4 py-2.5 font-mono text-zinc-900 dark:text-zinc-100 font-semibold">
                        {p.key}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formattedVal}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-zinc-600 dark:text-zinc-400">
                        {p.effectiveFrom}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <StatusBadge status={status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal for adding rate */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900 dark:border dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Publish New Rate Entry
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="rounded-md bg-red-50 p-2.5 text-xs text-red-700 border border-red-200 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
                {formError}
              </div>
            )}

            {formSuccess && (
              <div className="rounded-md bg-emerald-50 p-2.5 text-xs text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300">
                {formSuccess}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Rate Master Kind
                </label>
                <select
                  value={addKind}
                  onChange={(e) => setAddKind(e.target.value as any)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="material">Raw Material (Grade)</option>
                  <option value="machine">Machine Hour Rate</option>
                  <option value="param">Commercial Parameter</option>
                </select>
              </div>

              {addKind === "material" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Material Grade (e.g. EN8, 20MnCr5, 40Cr4, SS304)
                    </label>
                    <input
                      type="text"
                      required
                      value={grade}
                      onChange={(e) => setGrade(e.target.value.toUpperCase())}
                      placeholder="e.g. EN8"
                      className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Rate / kg (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={ratePerKg}
                        onChange={(e) => setRatePerKg(e.target.value)}
                        placeholder="68.00"
                        className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        Scrap / kg (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={scrapRatePerKg}
                        onChange={(e) => setScrapRatePerKg(e.target.value)}
                        placeholder="24.00"
                        className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                    </div>
                  </div>
                </>
              )}

              {addKind === "machine" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Machine Code (e.g. M-850, VMC-1200, CNC-750)
                    </label>
                    <input
                      type="text"
                      required
                      value={machineCode}
                      onChange={(e) => setMachineCode(e.target.value.toUpperCase())}
                      placeholder="e.g. M-850"
                      className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Machine Hourly Rate (₹/hr)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={hourRate}
                      onChange={(e) => setHourRate(e.target.value)}
                      placeholder="850.00"
                      className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                </>
              )}

              {addKind === "param" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Parameter Key
                    </label>
                    <select
                      value={paramKey}
                      onChange={(e) => setParamKey(e.target.value as any)}
                      className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                      <option value="overhead_pct">overhead_pct (e.g. 0.12 for 12%)</option>
                      <option value="packing_per_unit">packing_per_unit (₹/unit, e.g. 1.20)</option>
                      <option value="freight_per_kg">freight_per_kg (₹/kg, e.g. 2.50)</option>
                      <option value="gst_pct">gst_pct (e.g. 0.18 for 18%)</option>
                      <option value="default_margin_pct">default_margin_pct (e.g. 0.12 for 12%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Numeric Value
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      required
                      value={paramValue}
                      onChange={(e) => setParamValue(e.target.value)}
                      placeholder="0.12"
                      className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Effective From (Cannot be in the past)
                </label>
                <input
                  type="date"
                  required
                  min={today}
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {submitting ? "Publishing..." : "Publish Rate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status?: "active" | "future" | "superseded" }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
        Active
      </span>
    );
  }
  if (status === "future") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
        Future
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
      Superseded
    </span>
  );
}
