import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { fallbackExtract } from "./fallback";

export interface ExtractedField {
  field: string;
  value: string;
  sourceQuote: string;
  confidence: number;
  partRef?: string;
}

export interface ExtractorResult {
  fields: ExtractedField[];
  source: "ai" | "fallback";
  rawCount?: number;
}

export interface Extractor {
  extract(emailText: string): Promise<ExtractorResult>;
}

const extractedItemSchema = z.object({
  field: z.enum(["part_name", "material", "gross_wt_kg", "annual_volume", "due_date"]),
  value: z.string().trim().min(1),
  source_quote: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  part_ref: z.string().optional(),
});

const extractedResponseSchema = z.array(extractedItemSchema);

const EXTRACTION_SYSTEM_PROMPT = `You are an expert manufacturing RFQ (Request For Quotation) parsing assistant for an automotive precision component supplier in Pune, India.
Your job is to extract commercial and technical parameters from customer RFQ email text.

Target fields to extract:
1. "part_name": The name or description of the component (e.g., "Spindle Shaft", "Pinion Gear").
2. "material": The raw material specification / grade (e.g., "EN8", "EN8D", "40Cr4", "20MnCr5", "SS304", "LM24").
3. "gross_wt_kg": Raw forging/casting blank weight in kilograms as a decimal string (e.g., "0.610"). If given in grams, convert to kg.
4. "annual_volume": Estimated annual production quantity in units as an integer string (e.g., "180000"). If given in Lakhs (e.g. 1.8 Lakh), multiply by 100,000.
5. "due_date": Commercial quotation submission deadline in YYYY-MM-DD format.

CRITICAL INSTRUCTIONS:
- For EVERY extracted field, you MUST provide "source_quote": the exact, verbatim substring from the input email text where this information is stated.
- Do NOT fabricate or extrapolate quotes. The source quote must appear word-for-word in the input.
- Assign a confidence score between 0.0 and 1.0.
- If a field is not mentioned in the email, DO NOT include it in the output.
- Output ONLY a valid JSON array of objects conforming to:
  [
    {
      "field": "part_name" | "material" | "gross_wt_kg" | "annual_volume" | "due_date",
      "value": string,
      "source_quote": string,
      "confidence": number,
      "part_ref": string (optional)
    }
  ]
`;

export class ClaudeExtractor implements Extractor {
  private client: Anthropic | null = null;
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    if (this.apiKey) {
      this.client = new Anthropic({ apiKey: this.apiKey, timeout: 15000, maxRetries: 1 });
    }
  }

  async extract(emailText: string): Promise<ExtractorResult> {
    // 1. Enforce max input length (20,000 characters)
    const cappedInput = (emailText || "").slice(0, 20000).trim();
    if (!cappedInput) {
      return { fields: [], source: "fallback" };
    }

    // 2. Fall back if no API key is configured
    if (!this.client || !this.apiKey) {
      return {
        fields: fallbackExtract(cappedInput),
        source: "fallback",
      };
    }

    // 3. Call Claude 3.5 Sonnet
    try {
      const response = await this.client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Extract all RFQ parameters from this email text:\n\n"""\n${cappedInput}\n"""`,
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || !textBlock.text) {
        return { fields: fallbackExtract(cappedInput), source: "fallback" };
      }

      // 4. Parse and validate JSON
      let rawJson = textBlock.text.trim();
      // Strip markdown code fences if model enclosed JSON
      if (rawJson.startsWith("```")) {
        rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      }

      const parsed = JSON.parse(rawJson);
      const validated = extractedResponseSchema.safeParse(parsed);

      if (!validated.success) {
        console.warn("Claude output failed zod validation:", validated.error);
        return { fields: fallbackExtract(cappedInput), source: "fallback" };
      }

      const fields: ExtractedField[] = validated.data.map((item) => ({
        field: item.field,
        value: item.value,
        sourceQuote: item.source_quote,
        confidence: item.confidence,
        partRef: item.part_ref,
      }));

      return {
        fields,
        source: "ai",
        rawCount: fields.length,
      };
    } catch (error) {
      console.warn("AI extraction call failed, falling back to heuristic regex:", error);
      return {
        fields: fallbackExtract(cappedInput),
        source: "fallback",
      };
    }
  }
}
