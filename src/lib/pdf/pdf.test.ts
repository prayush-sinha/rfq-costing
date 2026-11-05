import { describe, it, expect } from "vitest";
import React from "react";
import { pdf } from "@react-pdf/renderer";
import { QuotePdfDocument, QuotePdfPayload } from "./QuotePdfDocument";

const SAMPLE_PAYLOAD: QuotePdfPayload = {
  rfqNo: "RFQ-TEST-001",
  customerName: "Bajaj Auto Limited",
  dueDate: "2026-11-20",
  asOfDate: "2026-01-01",
  quoteId: 101,
  snapshotNo: 1,
  parts: [
    {
      name: "Starter Spindle Shaft",
      material: "EN8D",
      grossWtKg: "0.610",
      annualVolume: 180000,
      toolingCost: "45000",
      toolingYears: "2.0",
      tiers: [
        {
          tierNo: 1,
          volume: 90000,
          lotSize: "7500",
          marginPct: "0.12",
          breakdown: {
            material: "39.65",
            scrapCredit: "1.71",
            conversion: "42.50",
            overhead: "12.07",
            tooling: "0.25",
            packing: "1.50",
            freight: "1.22",
            cost: "95.48",
            price: "108.50",
            gst: "19.53",
            priceInclGst: "128.03",
          },
        },
        {
          tierNo: 2,
          volume: 180000,
          lotSize: "15000",
          marginPct: "0.12",
          breakdown: {
            material: "39.65",
            scrapCredit: "1.71",
            conversion: "41.50",
            overhead: "11.92",
            tooling: "0.13",
            packing: "1.50",
            freight: "1.22",
            cost: "94.21",
            price: "107.06",
            gst: "19.27",
            priceInclGst: "126.33",
          },
        },
      ],
    },
  ],
};

describe("Quote PDF Document Generator", () => {
  it("renders a valid commercial PDF document buffer with PDF header", async () => {
    const doc = React.createElement(QuotePdfDocument, { data: SAMPLE_PAYLOAD });
    const instance = pdf(doc as any);
    const blob = await instance.toBlob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    expect(buffer.length).toBeGreaterThan(1000);
    // Standard PDF file signature is %PDF-
    const header = buffer.slice(0, 5).toString("ascii");
    expect(header).toBe("%PDF-");
  });
});
