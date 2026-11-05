import fs from "fs";
import path from "path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";

async function main() {
  const mdPath = path.resolve(process.cwd(), "TDD.md");
  const content = fs.readFileSync(mdPath, "utf-8");
  const lines = content.split("\n");

  const docChildren: any[] = [];

  // Cover Header
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
      children: [
        new TextRun({
          text: "TECHNICAL DESIGN DOCUMENT",
          bold: true,
          size: 36, // 18pt
          color: "18181B",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: "Automotive Precision Component RFQ Costing, Rate Versioning & Quotation Platform",
          size: 24, // 12pt
          color: "4F46E5",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({
          text: "Company A Precision Engineering Pvt. Ltd. — MIDC Chakan, Pune, Maharashtra\n",
          italics: true,
          size: 20,
          color: "52525B",
        }),
        new TextRun({
          text: "GitHub Repository: https://github.com/prayush-sinha/rfq-costing\n",
          bold: true,
          size: 20,
          color: "4F46E5",
        }),
        new TextRun({
          text: "Author: Cost Engineering & Technical Architecture Team • Version 1.0.0 • November 2026",
          size: 18,
          color: "71717A",
        }),
      ],
    })
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      continue; // Skip main title as we have a cover header
    } else if (line.startsWith("## ")) {
      docChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 120 },
          children: [
            new TextRun({
              text: line.replace("## ", "").trim(),
              bold: true,
              size: 28, // 14pt
              color: "09090B",
            }),
          ],
        })
      );
    } else if (line.startsWith("### ")) {
      docChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 80 },
          children: [
            new TextRun({
              text: line.replace("### ", "").trim(),
              bold: true,
              size: 24, // 12pt
              color: "18181B",
            }),
          ],
        })
      );
    } else if (line.startsWith("#### ")) {
      docChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 180, after: 60 },
          children: [
            new TextRun({
              text: line.replace("#### ", "").trim(),
              bold: true,
              size: 21, // 10.5pt
              color: "27272A",
            }),
          ],
        })
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      docChildren.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: line.replace(/^[-*]\s+/, "").trim(),
              size: 20, // 10pt
              color: "27272A",
            }),
          ],
        })
      );
    } else if (line.startsWith("```")) {
      // Collect code block
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      docChildren.push(
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [
            new TextRun({
              text: codeLines.join("\n"),
              font: "Courier New",
              size: 16, // 8pt
              color: "18181B",
            }),
          ],
        })
      );
    } else if (line.trim().length > 0) {
      docChildren.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: line.trim(),
              size: 20, // 10pt
              color: "27272A",
            }),
          ],
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docChildren,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.resolve(process.cwd(), "TDD.docx");
  fs.writeFileSync(outPath, buffer);
  console.log(`TDD.docx successfully generated at ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

main().catch(console.error);
