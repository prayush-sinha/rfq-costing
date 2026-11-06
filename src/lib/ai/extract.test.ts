import { describe, it, expect } from "vitest";
import { ClaudeExtractor } from "./extract";
import { fallbackExtract } from "./fallback";

const SAMPLE_EMAIL = `
From: sourcing@bajaj.com
Subject: RFQ for Starter Spindle Shaft

Dear Supplier,
Please quote for the following auto-component requirements:
Item: Spindle Shaft
Material: EN8D forging quality.
Gross weight: 0.61 kg per component.
Annual volume: 1.8 lakh pcs (180,000 units).
Quotation due date: 2026-11-20.

Regards,
Procurement Team
`;

describe("fallbackExtract", () => {
  it("extracts all standard fields from typical RFQ email", () => {
    const fields = fallbackExtract(SAMPLE_EMAIL);

    const mat = fields.find((f) => f.field === "material");
    expect(mat).toBeDefined();
    expect(mat?.value).toBe("EN8D");
    expect(SAMPLE_EMAIL).toContain(mat?.sourceQuote);

    const vol = fields.find((f) => f.field === "annual_volume");
    expect(vol).toBeDefined();
    expect(vol?.value).toBe("180000");

    const wt = fields.find((f) => f.field === "gross_wt_kg");
    expect(wt).toBeDefined();
    expect(wt?.value).toBe("0.610");

    const due = fields.find((f) => f.field === "due_date");
    expect(due).toBeDefined();
    expect(due?.value).toBe("2026-11-20");

    const name = fields.find((f) => f.field === "part_name");
    expect(name).toBeDefined();
    expect(name?.value).toBe("Spindle Shaft");
  });

  it("handles gram weights and comma-separated volumes", () => {
    const text = "Item: Pinion Gear, Weight: 450 g, Annual volume: 24,000 pcs, Material: 40Cr4";
    const fields = fallbackExtract(text);

    const wt = fields.find((f) => f.field === "gross_wt_kg");
    expect(wt?.value).toBe("0.450");

    const vol = fields.find((f) => f.field === "annual_volume");
    expect(vol?.value).toBe("24000");

    const mat = fields.find((f) => f.field === "material");
    expect(mat?.value).toBe("40CR4");
  });
});

describe("ClaudeExtractor", () => {
  it("uses fallback if API key is not present", async () => {
    const extractor = new ClaudeExtractor("");
    const res = await extractor.extract(SAMPLE_EMAIL);
    expect(res.source).toBe("fallback");
    expect(res.fields.length).toBeGreaterThan(0);
  });

  it("caps input to 20,000 characters without crashing", async () => {
    const hugeInput = "a".repeat(25000) + "\nItem: Spindle Shaft\nMaterial: EN8\nWeight: 0.61 kg";
    const extractor = new ClaudeExtractor("");
    const res = await extractor.extract(hugeInput);
    expect(res.source).toBe("fallback");
  });
});
