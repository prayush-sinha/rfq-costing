import { ExtractedField } from "./extract";

export function fallbackExtract(text: string): ExtractedField[] {
  const fields: ExtractedField[] = [];

  // 1. Extract Material Grade
  const matMatch = text.match(/\b(EN8[D]?|40Cr4|20MnCr5|SS304|LM24|SAE\s*1045|C45)\b/i);
  if (matMatch) {
    fields.push({
      field: "material",
      value: matMatch[1].toUpperCase(),
      sourceQuote: matMatch[0],
      confidence: 0.92,
    });
  }

  // 2. Extract Annual Volume (e.g. "180,000 pcs", "1.8 lakh", "24,000 nos")
  const lakhMatch = text.match(/(\d+(?:\.\d+)?)\s*lakh\b/i);
  if (lakhMatch) {
    const val = Math.round(parseFloat(lakhMatch[1]) * 100000);
    fields.push({
      field: "annual_volume",
      value: String(val),
      sourceQuote: lakhMatch[0],
      confidence: 0.95,
    });
  } else {
    const volMatch = text.match(/(?:annual\s+volume|quantity|qty|volume)[\s:=]*(\d[\d,]*)\s*(?:pcs|nos|units)?\b/i);
    if (volMatch) {
      const val = parseInt(volMatch[1].replace(/,/g, ""), 10);
      if (!Number.isNaN(val) && val > 0) {
        fields.push({
          field: "annual_volume",
          value: String(val),
          sourceQuote: volMatch[0],
          confidence: 0.9,
        });
      }
    }
  }

  // 3. Extract Gross Weight (e.g. "0.61 kg", "610 g", "4.6 kg")
  const gramMatch = text.match(/(?:weight|wt)[\s:=]*(\d[\d,]*)\s*(?:g|grams?|gms?)\b/i);
  if (gramMatch) {
    const g = parseFloat(gramMatch[1].replace(/,/g, ""));
    fields.push({
      field: "gross_wt_kg",
      value: (g / 1000).toFixed(3),
      sourceQuote: gramMatch[0],
      confidence: 0.93,
    });
  } else {
    const kgMatch = text.match(/(?:weight|wt)[\s:=]*(\d+(?:\.\d+)?)\s*kgs?\b/i);
    if (kgMatch) {
      fields.push({
        field: "gross_wt_kg",
        value: parseFloat(kgMatch[1]).toFixed(3),
        sourceQuote: kgMatch[0],
        confidence: 0.94,
      });
    }
  }

  // 4. Extract Part Name
  const partMatch = text.match(/(?:part\s+name|component|item)[\s:=]*([A-Za-z0-9\s\-]+?)(?=\n|,|\.|;|$)/i);
  if (partMatch && partMatch[1].trim().length > 2) {
    fields.push({
      field: "part_name",
      value: partMatch[1].trim(),
      sourceQuote: partMatch[0],
      confidence: 0.88,
    });
  }

  // 5. Extract Due Date (e.g. "2026-11-20" or "20/11/2026")
  const dateMatch = text.match(/\b(202[5-9]-[01]\d-[0-3]\d)\b/);
  if (dateMatch) {
    fields.push({
      field: "due_date",
      value: dateMatch[1],
      sourceQuote: dateMatch[0],
      confidence: 0.98,
    });
  }

  return fields;
}
