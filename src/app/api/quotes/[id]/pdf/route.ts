import { NextRequest, NextResponse } from "next/server";
import { requireRole, ForbiddenError, UnauthenticatedError } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { quotes, rfqs, customers, quoteSnapshots, auditLog } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { pdf } from "@react-pdf/renderer";
import React from "react";
import { QuotePdfDocument, QuotePdfPayload } from "@/lib/pdf/QuotePdfDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteProps) {
  try {
    // Only sales head can generate and export formal customer PDF quotations (Task 12 & Rule 4)
    const user = await requireRole("sales_head");
    const { id } = await params;
    const quoteId = parseInt(id, 10);
    if (Number.isNaN(quoteId)) {
      return NextResponse.json({ error: "Invalid quote ID" }, { status: 400 });
    }

    // 1. Fetch quote & RFQ metadata
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

    // 2. Sealed Snapshot Enforcement (Rule 4: PDFs render from snapshot ONLY, never live rates)
    const snapRows = await db
      .select()
      .from(quoteSnapshots)
      .where(eq(quoteSnapshots.quoteId, quoteId))
      .orderBy(desc(quoteSnapshots.snapshotNo))
      .limit(1);

    if (snapRows.length === 0) {
      return NextResponse.json(
        {
          error:
            "Cannot generate PDF: quote has no frozen snapshot. Only approved quotations with immutable snapshots can be exported (Rule 4).",
        },
        { status: 400 }
      );
    }

    // Render strictly from immutable snapshot payload
    const snap = snapRows[0];
    const payload: any = snap.payload;
    const pdfData: QuotePdfPayload = {
      rfqNo: qMeta.rfqNo,
      customerName: qMeta.customerName,
      dueDate: qMeta.dueDate,
      asOfDate: snap.asOfDate,
      quoteId,
      snapshotNo: snap.snapshotNo,
      parts: payload.parts || [],
    };

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
        isSnapshot: true,
      },
    });

    // 5. Return PDF response with strict no-store caching
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Quotation_${pdfData.rfqNo}.pdf"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err: any) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json(
        { error: "Forbidden: sales head role required to download PDF quotation" },
        { status: 403 }
      );
    }
    if (err instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated: sign in required" }, { status: 401 });
    }
    console.error("PDF generation failed:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate quotation PDF" },
      { status: 500 }
    );
  }
}
