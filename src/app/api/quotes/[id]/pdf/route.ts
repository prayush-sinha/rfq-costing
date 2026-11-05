import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { quotes, rfqs, customers, parts, routingOps, quotePartTiers, quoteSnapshots, auditLog, rateMaterials, rateMachines, rateParams } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { pdf } from "@react-pdf/renderer";
import React from "react";
import { QuotePdfDocument, QuotePdfPayload } from "@/lib/pdf/QuotePdfDocument";
import { buildRateBook } from "@/lib/costing/rates";
import { costTier, D } from "@/lib/costing/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteProps) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const quoteId = parseInt(id, 10);
    if (Number.isNaN(quoteId)) {
      return NextResponse.json({ error: "Invalid quote ID" }, { status: 400 });
    }

    // 1. Fetch quote & RFQ
    const qRows = await db
      .select({
        id: quotes.id,
        rfqId: quotes.rfqId,
        rfqNo: rfqs.rfqNo,
        customerName: customers.name,
        dueDate: rfqs.dueDate,
        asOfDate: quotes.asOfDate,
        status: quotes.status,
      })
      .from(quotes)
      .innerJoin(rfqs, eq(quotes.rfqId, rfqs.id))
      .innerJoin(customers, eq(rfqs.customerId, customers.id))
      .where(eq(quotes.id, quoteId))
      .limit(1);

    if (!qRows || qRows.length === 0) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    const qMeta = qRows[0];

    // 2. Check for sealed snapshot first (Rule 4: PDFs render from snapshot)
    const snapRows = await db
      .select()
      .from(quoteSnapshots)
      .where(eq(quoteSnapshots.quoteId, quoteId))
      .orderBy(desc(quoteSnapshots.snapshotNo))
      .limit(1);

    let pdfData: QuotePdfPayload;

    if (snapRows.length > 0) {
      // Render directly from immutable snapshot payload
      const snap = snapRows[0];
      const payload: any = snap.payload;
      pdfData = {
        rfqNo: qMeta.rfqNo,
        customerName: qMeta.customerName,
        dueDate: qMeta.dueDate,
        asOfDate: snap.asOfDate,
        quoteId,
        snapshotNo: snap.snapshotNo,
        parts: payload.parts || [],
      };
    } else {
      // If no snapshot yet, generate live preview
      const rateRows = {
        materials: await db.select().from(rateMaterials),
        machines: await db.select().from(rateMachines),
        params: await db.select().from(rateParams),
      };
      const rateBook = buildRateBook(rateRows, qMeta.asOfDate);

      const partRows = await db
        .select()
        .from(parts)
        .where(eq(parts.rfqId, qMeta.rfqId));

      const partsPayload = [];

      for (const p of partRows) {
        const ops = await db
          .select()
          .from(routingOps)
          .where(eq(routingOps.partId, p.id))
          .orderBy(routingOps.seq);

        const tiers = await db
          .select()
          .from(quotePartTiers)
          .where(eq(quotePartTiers.partId, p.id))
          .orderBy(quotePartTiers.tierNo);

        const tierBreakdowns = tiers.map((t) => {
          const b = costTier(
            {
              grossWtKg: new D(p.grossWtKg),
              scrapPct: new D(p.scrapPct),
              toolingCost: new D(p.toolingCost),
              toolingYears: new D(p.toolingYears),
              ops: ops.map((o) => ({
                cycleMin: new D(o.cycleMin),
                setupMin: new D(o.setupMin),
                hourRate: new D(rateBook.machineHourRate(o.machineCode).value),
              })),
            },
            {
              materialPerKg: new D(rateBook.materialPerKg(p.material).value),
              scrapPerKg: new D(rateBook.scrapPerKg(p.material).value),
              overheadPct: new D(rateBook.param("overhead_pct").value),
              packingPerUnit: new D(rateBook.param("packing_per_unit").value),
              freightPerKg: new D(rateBook.param("freight_per_kg").value),
              gstPct: new D(rateBook.param("gst_pct").value),
            },
            {
              volume: new D(t.volume),
              lotSize: new D(t.lotSize),
              marginPct: new D(t.marginPct),
            }
          );

          return {
            tierNo: t.tierNo,
            volume: t.volume,
            lotSize: t.lotSize,
            marginPct: t.marginPct,
            breakdown: {
              material: b.material.toFixed(2),
              scrapCredit: b.scrapCredit.toFixed(2),
              conversion: b.conversion.toFixed(2),
              overhead: b.overhead.toFixed(2),
              tooling: b.tooling.toFixed(2),
              packing: b.packing.toFixed(2),
              freight: b.freight.toFixed(2),
              cost: b.cost.toFixed(2),
              price: b.price.toFixed(2),
              gst: b.gst.toFixed(2),
              priceInclGst: b.priceInclGst.toFixed(2),
            },
          };
        });

        partsPayload.push({
          name: p.name,
          material: p.material,
          grossWtKg: p.grossWtKg,
          annualVolume: p.annualVolume,
          toolingCost: p.toolingCost,
          toolingYears: p.toolingYears,
          tiers: tierBreakdowns,
        });
      }

      pdfData = {
        rfqNo: qMeta.rfqNo,
        customerName: qMeta.customerName,
        dueDate: qMeta.dueDate,
        asOfDate: qMeta.asOfDate,
        quoteId,
        snapshotNo: 0,
        parts: partsPayload,
      };
    }

    // 3. Render PDF to Buffer
    const documentElement = React.createElement(QuotePdfDocument, { data: pdfData });
    const pdfInstance = pdf(documentElement as any);
    const pdfBlob = await pdfInstance.toBlob();
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Record audit log
    await db.insert(auditLog).values({
      actorId: user.id,
      action: "download_pdf",
      entity: "quote",
      entityId: String(quoteId),
      detail: {
        rfqNo: pdfData.rfqNo,
        snapshotNo: pdfData.snapshotNo,
        isSnapshot: pdfData.snapshotNo > 0,
      },
    });

    // 5. Return PDF response
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Quotation_${pdfData.rfqNo}.pdf"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err: any) {
    console.error("PDF generation failed:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate quotation PDF" },
      { status: 500 }
    );
  }
}
