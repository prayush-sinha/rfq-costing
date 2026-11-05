"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { importPastQuoteRows, queryPastQuotes, ImportResult } from "./import-actions";

export interface PastQuoteItem {
  id: number;
  quoteNo: string;
  quoteDate: string;
  customer: string;
  partName: string;
  material: string;
  grossWtKg: string;
  annualVolume: number;
  cycleTimeMin?: string | null;
  unitPrice?: string | null;
  outcome: "won" | "lost" | "open";
}

interface QuotesClientProps {
  initialData: {
    rows: PastQuoteItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  knownMaterials: string[];
  userRole: "estimator" | "sales_head";
}

export function QuotesClient({ initialData, knownMaterials, userRole }: QuotesClientProps) {
  const [data, setData] = useState(initialData);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOutcome, setSelectedOutcome] = useState<string>("all");
  const [selectedMaterial, setSelectedMaterial] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [isSearching, startSearchTransition] = useTransition();

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [fileToImport, setFileToImport] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[] | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, startImportTransition] = useTransition();

  const handleSearch = (newPage = 1) => {
    startSearchTransition(async () => {
      try {
        const res = await queryPastQuotes({
          query: searchQuery,
          outcome: selectedOutcome as any,
          material: selectedMaterial,
          page: newPage,
          pageSize: 25,
        });
        setData(res as any);
        setPage(newPage);
      } catch (err: any) {
        alert(err?.message || "Search failed");
      }
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setImportError("File exceeds 2 MB upload limit.");
      return;
    }

    setFileToImport(file);
    setImportError(null);
    setImportResult(null);
    setParsing(true);

    try {
      const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
      let rows: Record<string, string>[] = [];

      if (isExcel) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.worksheets[0];

        const headers: string[] = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            row.eachCell((cell) => {
              headers.push(String(cell.value || "").trim().toLowerCase());
            });
          } else {
            const rowObj: Record<string, string> = {};
            row.eachCell((cell, colNumber) => {
              const header = headers[colNumber - 1];
              if (header) {
                rowObj[header] = String(cell.value ?? "").trim();
              }
            });
            if (Object.keys(rowObj).length > 0) {
              rows.push(rowObj);
            }
          }
        });
      } else {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        rows = parsed.data;
      }

      setParsedRows(rows);
    } catch (err: any) {
      setImportError(err?.message || "Failed to parse file.");
    } finally {
      setParsing(false);
    }
  };

  const handleRunImport = () => {
    if (!parsedRows || parsedRows.length === 0) return;

    startImportTransition(async () => {
      try {
        const res = await importPastQuoteRows(parsedRows);
        setImportResult(res);
        if (res.imported > 0) {
          handleSearch(1);
        }
      } catch (err: any) {
        setImportError(err?.message || "Import execution failed");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header and Import Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
            <span>Historical Quote Register &amp; Analytics</span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {data.total.toLocaleString("en-IN")} Quotes Recorded
            </span>
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Search ~1,400 past commercial quotations to benchmark cycle times, pricing and win/loss patterns.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowImportModal(true);
            setImportResult(null);
            setImportError(null);
            setParsedRows(null);
            setFileToImport(null);
          }}
          className="self-start sm:self-auto inline-flex items-center rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 transition-colors shadow-xs"
        >
          📥 Import Excel / CSV
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-5">
            <label className="block text-[11px] font-mono text-zinc-500 uppercase">
              Part Name, Quote No, or Customer
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch(1)}
              placeholder="e.g. Pinion, Shaft, Tata Motors, PQ-2025..."
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[11px] font-mono text-zinc-500 uppercase">
              Material Grade
            </label>
            <select
              value={selectedMaterial}
              onChange={(e) => {
                setSelectedMaterial(e.target.value);
              }}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="all">All Material Grades</option>
              {knownMaterials.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-mono text-zinc-500 uppercase">
              Outcome
            </label>
            <select
              value={selectedOutcome}
              onChange={(e) => setSelectedOutcome(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="all">All Outcomes</option>
              <option value="won">Won Only</option>
              <option value="lost">Lost Only</option>
              <option value="open">Open / In Progress</option>
            </select>
          </div>

          <div className="sm:col-span-2 flex items-end">
            <button
              type="button"
              disabled={isSearching}
              onClick={() => handleSearch(1)}
              className="w-full rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 transition-colors shadow-xs"
            >
              {isSearching ? "Searching..." : "Apply Filter"}
            </button>
          </div>
        </div>
      </div>

      {/* Table Listing */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
        <table className="w-full text-left text-xs divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 font-mono text-[11px] text-zinc-500 uppercase">
            <tr>
              <th className="px-4 py-3">Quote No</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Component / Part</th>
              <th className="px-4 py-3">Material</th>
              <th className="px-4 py-3 text-right">Gross Wt (kg)</th>
              <th className="px-4 py-3 text-right">Annual Vol (pcs)</th>
              <th className="px-4 py-3 text-right">Cycle (min)</th>
              <th className="px-4 py-3 text-right">Unit Price (₹)</th>
              <th className="px-4 py-3 text-center">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900 font-sans">
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-zinc-500 text-xs">
                  No historical quotes match the selected criteria.
                </td>
              </tr>
            ) : (
              data.rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <td className="px-4 py-2.5 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                    {row.quoteNo}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-zinc-500 whitespace-nowrap">
                    {row.quoteDate}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[140px]">
                    {row.customer}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                    {row.partName}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-zinc-700 dark:text-zinc-300">
                    {row.material}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                    {parseFloat(row.grossWtKg).toFixed(3)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-zinc-900 dark:text-zinc-100">
                    {row.annualVolume.toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                    {row.cycleTimeMin ? `${parseFloat(row.cycleTimeMin).toFixed(2)}m` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                    {row.unitPrice ? `₹${parseFloat(row.unitPrice).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <OutcomeBadge outcome={row.outcome} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Footer */}
        {data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 dark:border-zinc-800 text-xs text-zinc-500 font-mono">
            <div>
              Showing page <strong>{data.page}</strong> of <strong>{data.totalPages}</strong> (
              {data.total} quotes)
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={data.page <= 1 || isSearching}
                onClick={() => handleSearch(data.page - 1)}
                className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40 hover:bg-zinc-50 dark:border-zinc-700"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={data.page >= data.totalPages || isSearching}
                onClick={() => handleSearch(data.page + 1)}
                className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40 hover:bg-zinc-50 dark:border-zinc-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Import Past Quotes (CSV or Excel)
              </h3>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-500">
              Upload past quote files (up to 2 MB / 5,000 rows). Columns supported:{" "}
              <code className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-[10px]">
                quote_no, quote_date, customer, part_name, material, gross_wt_kg, annual_volume, cycle_time_min, unit_price, outcome
              </code>
            </p>

            <div className="rounded-lg border-2 border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
              <input
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={handleFileChange}
                className="block w-full text-xs text-zinc-500 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-zinc-800 dark:file:bg-zinc-100 dark:file:text-zinc-900 cursor-pointer"
              />
              {parsing && (
                <div className="mt-2 text-xs text-zinc-500">Parsing and checking file structure...</div>
              )}
            </div>

            {parsedRows && (
              <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800 text-xs font-mono space-y-1">
                <div className="text-zinc-900 dark:text-zinc-100 font-semibold">
                  ✓ {parsedRows.length} rows parsed from file.
                </div>
                <div className="text-zinc-500 text-[11px]">
                  Ready to validate schema and upsert into database.
                </div>
              </div>
            )}

            {importError && (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
                {importError}
              </div>
            )}

            {importResult && (
              <div className="space-y-2">
                <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  ✓ Successfully imported {importResult.imported} of {importResult.total} quotes into historical register.
                </div>
                {importResult.errorCount > 0 && (
                  <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800 space-y-1">
                    <div className="font-semibold">{importResult.errorCount} row(s) had validation errors:</div>
                    <ul className="list-disc list-inside text-[11px] space-y-0.5 max-h-24 overflow-y-auto">
                      {importResult.errors.map((e, i) => (
                        <li key={i}>
                          Row {e.row}: {e.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="rounded-md border border-zinc-300 px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Close
              </button>
              {parsedRows && !importResult && (
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={handleRunImport}
                  className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 transition-colors shadow-xs"
                >
                  {isImporting ? "Validating & Importing..." : "Confirm & Import Rows"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: "won" | "lost" | "open" }) {
  switch (outcome) {
    case "won":
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400">
          Won
        </span>
      );
    case "lost":
      return (
        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400">
          Lost
        </span>
      );
    case "open":
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400">
          Open
        </span>
      );
  }
}
