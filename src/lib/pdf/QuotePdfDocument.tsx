import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

export interface PdfPartData {
  name: string;
  material: string;
  grossWtKg: string;
  annualVolume: number;
  toolingCost: string;
  toolingYears: string;
  tiers: {
    tierNo: number;
    volume: number;
    lotSize: string;
    marginPct: string;
    breakdown: {
      material: string;
      scrapCredit: string;
      conversion: string;
      overhead: string;
      tooling: string;
      packing: string;
      freight: string;
      cost: string;
      price: string;
      gst: string;
      priceInclGst: string;
    };
  }[];
}

export interface QuotePdfPayload {
  rfqNo: string;
  customerName: string;
  dueDate: string;
  asOfDate: string;
  quoteId: number;
  snapshotNo: number;
  parts: PdfPartData[];
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#27272a",
    lineHeight: 1.3,
  },
  header: {
    borderBottomWidth: 1.5,
    borderBottomColor: "#18181b",
    paddingBottom: 10,
    marginBottom: 12,
  },
  companyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#09090b",
    letterSpacing: 0.5,
  },
  subHeader: {
    fontSize: 8,
    color: "#52525b",
    marginTop: 2,
  },
  titleBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f4f4f5",
    padding: 8,
    borderRadius: 4,
    marginBottom: 12,
  },
  docTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#18181b",
  },
  metaGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  metaCol: {
    width: "48%",
  },
  metaLabel: {
    fontSize: 8,
    color: "#71717a",
    textTransform: "uppercase",
  },
  metaValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#18181b",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#09090b",
    marginTop: 10,
    marginBottom: 6,
    borderBottomWidth: 0.8,
    borderBottomColor: "#e4e4e7",
    paddingBottom: 2,
  },
  table: {
    width: "100%",
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f4f4f5",
    borderBottomWidth: 1,
    borderBottomColor: "#d4d4d8",
    padding: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e4e4e7",
    padding: 4,
    fontSize: 8,
  },
  colDesc: { width: "35%" },
  colMat: { width: "15%" },
  colTier1: { width: "16%", textAlign: "right" },
  colTier2: { width: "17%", textAlign: "right" },
  colTier3: { width: "17%", textAlign: "right" },
  breakdownTable: {
    marginTop: 6,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: "#e4e4e7",
    borderRadius: 3,
  },
  breakdownHeader: {
    flexDirection: "row",
    backgroundColor: "#fafafa",
    padding: 4,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e4e4e7",
  },
  breakdownRow: {
    flexDirection: "row",
    padding: 3,
    fontSize: 7.5,
  },
  bColLabel: { width: "40%" },
  bColVal: { width: "20%", textAlign: "right" },
  termsBlock: {
    marginTop: 14,
    padding: 8,
    backgroundColor: "#fafafa",
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: "#e4e4e7",
  },
  termsTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    color: "#27272a",
  },
  termsItem: {
    fontSize: 7.5,
    color: "#52525b",
    marginBottom: 2,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: "#e4e4e7",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: "#a1a1aa",
  },
  signBlock: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signBox: {
    width: "45%",
    borderTopWidth: 1,
    borderTopColor: "#71717a",
    paddingTop: 4,
  },
  signTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#18181b",
  },
  signSub: {
    fontSize: 7.5,
    color: "#71717a",
  },
});

export function QuotePdfDocument({ data }: { data: QuotePdfPayload }) {
  return (
    <Document title={`Quote_${data.rfqNo}`}>
      <Page size="A4" style={styles.page}>
        {/* Company Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>COMPANY A PRECISION ENGINEERING PVT. LTD.</Text>
          <Text style={styles.subHeader}>
            Plot No. B-42, Phase II, MIDC Industrial Area, Chakan, Pune, Maharashtra 410501, India
          </Text>
          <Text style={styles.subHeader}>
            IATF 16949:2016 & ISO 9001:2015 Certified • GSTIN: 27AABCC1234F1Z8 • sales@companya.in
          </Text>
        </View>

        {/* Title Bar */}
        <View style={styles.titleBar}>
          <Text style={styles.docTitle}>FORMAL COMMERCIAL QUOTATION</Text>
          <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#4f46e5" }}>
            Ref: CA/QTN/{data.rfqNo} (Snapshot #{data.snapshotNo})
          </Text>
        </View>

        {/* Commercial Metadata */}
        <View style={styles.metaGrid}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Customer / Buyer:</Text>
            <Text style={styles.metaValue}>{data.customerName}</Text>
            <Text style={styles.metaLabel}>Commercial Due Date:</Text>
            <Text style={styles.metaValue}>{data.dueDate}</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>Quotation Date (As-Of):</Text>
            <Text style={styles.metaValue}>{data.asOfDate}</Text>
            <Text style={styles.metaLabel}>Validity / Payment Terms:</Text>
            <Text style={styles.metaValue}>30 Days Validity • Net 45 Days Ex-Works</Text>
          </View>
        </View>

        {/* Price Schedule Table */}
        <Text style={styles.sectionTitle}>1. Summary Commercial Offer Schedule (3-Tier Volume Pricing)</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Component In Scope</Text>
            <Text style={styles.colMat}>Grade / Wt</Text>
            <Text style={styles.colTier1}>Tier 1 (50% Vol)</Text>
            <Text style={styles.colTier2}>Tier 2 (Annual Vol)</Text>
            <Text style={styles.colTier3}>Tier 3 (200% Vol)</Text>
          </View>

          {data.parts.map((p, idx) => {
            const t1 = p.tiers.find((t) => t.tierNo === 1) || p.tiers[0];
            const t2 = p.tiers.find((t) => t.tierNo === 2) || p.tiers[1];
            const t3 = p.tiers.find((t) => t.tierNo === 3) || p.tiers[2];

            return (
              <View key={idx} style={styles.tableRow}>
                <Text style={styles.colDesc}>{p.name}</Text>
                <Text style={styles.colMat}>
                  {p.material} ({parseFloat(p.grossWtKg).toFixed(2)} kg)
                </Text>
                <Text style={styles.colTier1}>
                  Rs. {t1 ? t1.breakdown.price : "—"}
                  {"\n"}
                  <Text style={{ fontSize: 7, color: "#71717a" }}>({t1?.volume.toLocaleString("en-IN")} pcs)</Text>
                </Text>
                <Text style={styles.colTier2}>
                  Rs. {t2 ? t2.breakdown.price : "—"}
                  {"\n"}
                  <Text style={{ fontSize: 7, color: "#71717a" }}>({t2?.volume.toLocaleString("en-IN")} pcs)</Text>
                </Text>
                <Text style={styles.colTier3}>
                  Rs. {t3 ? t3.breakdown.price : "—"}
                  {"\n"}
                  <Text style={{ fontSize: 7, color: "#71717a" }}>({t3?.volume.toLocaleString("en-IN")} pcs)</Text>
                </Text>
              </View>
            );
          })}
        </View>

        {/* Detailed Cost Breakdown (First Part) */}
        {data.parts.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>
              2. Cost Architecture & Ledger Breakdown ({data.parts[0].name})
            </Text>
            <View style={styles.breakdownTable}>
              <View style={styles.breakdownHeader}>
                <Text style={styles.bColLabel}>Cost Component (Per Unit)</Text>
                <Text style={styles.bColVal}>Tier 1</Text>
                <Text style={styles.bColVal}>Tier 2 (Standard)</Text>
                <Text style={styles.bColVal}>Tier 3</Text>
              </View>

              {[
                { label: "Direct Raw Material", key: "material" },
                { label: "Less: Scrap Recovery Credit", key: "scrapCredit" },
                { label: "Machining & Setup Conversion", key: "conversion" },
                { label: "Plant Overhead Allocation", key: "overhead" },
                { label: "Tooling Amortisation", key: "tooling" },
                { label: "Packaging & Preservation", key: "packing" },
                { label: "Freight & Logistics", key: "freight" },
                { label: "Total Manufacturing Cost (Ex-Margin)", key: "cost" },
                { label: "Commercial Unit Price (Ex-GST)", key: "price" },
                { label: "GST (18% Statutory Rate)", key: "gst" },
                { label: "Landed Unit Price (Incl. GST)", key: "priceInclGst" },
              ].map((row, rIdx) => {
                const isHighlight = row.key === "price" || row.key === "priceInclGst";
                return (
                  <View
                    key={rIdx}
                    style={[
                      styles.breakdownRow,
                      isHighlight ? { backgroundColor: "#f4f4f5", fontFamily: "Helvetica-Bold" } : {},
                    ]}
                  >
                    <Text style={styles.bColLabel}>{row.label}</Text>
                    {data.parts[0].tiers.map((t, tIdx) => (
                      <Text key={tIdx} style={styles.bColVal}>
                        Rs. {(t.breakdown as any)[row.key] || "0.00"}
                      </Text>
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Terms & Conditions */}
        <View style={styles.termsBlock}>
          <Text style={styles.termsTitle}>Standard Commercial Terms & Technical Conditions:</Text>
          <Text style={styles.termsItem}>
            1. Validity: Offer valid for 30 calendar days from quotation date. Subject to review thereafter.
          </Text>
          <Text style={styles.termsItem}>
            2. Payment Terms: Net 45 days from date of commercial invoice. No cash discount applicable.
          </Text>
          <Text style={styles.termsItem}>
            3. Taxes & Duties: GST at 18% (9% CGST + 9% SGST) charged extra at actuals at time of dispatch.
          </Text>
          <Text style={styles.termsItem}>
            4. Delivery Terms: Ex-Works Chakan, Pune plant. Freight and transit insurance to customer account.
          </Text>
          <Text style={styles.termsItem}>
            5. Raw Material Escalation: Linked to published steel indexation quarterly with ±5% threshold trigger.
          </Text>
        </View>

        {/* Signatures */}
        <View style={styles.signBlock}>
          <View style={styles.signBox}>
            <Text style={styles.signTitle}>Prepared By: Cost Engineering</Text>
            <Text style={styles.signSub}>Company A Precision Engineering Pvt. Ltd.</Text>
          </View>
          <View style={styles.signBox}>
            <Text style={styles.signTitle}>Authorized Commercial Signatory</Text>
            <Text style={styles.signSub}>Head of Sales & Business Development</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Company A • RFQ Ref: {data.rfqNo} • Official Commercial Quotation</Text>
          <Text>Page 1 of 1</Text>
        </View>
      </Page>
    </Document>
  );
}
