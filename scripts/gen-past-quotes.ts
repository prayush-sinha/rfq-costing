import fs from "node:fs";
import path from "node:path";

// Deterministic Pseudo-Random Number Generator (Mulberry32)
function createRng(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(20261104);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 2): number {
  const val = rng() * (max - min) + min;
  return Number(val.toFixed(decimals));
}

const customers = [
  "Tata Motors",
  "Bajaj Auto",
  "Mahindra & Mahindra",
  "Bharat Forge",
  "Force Motors",
  "Endurance Technologies",
  "Dana India",
];

const partTemplates = [
  { name: "Drive Spindle Shaft", material: "EN8", wtMin: 0.5, wtMax: 1.2, cycleMin: 2.5, cycleMax: 4.5, priceMin: 85, priceMax: 140 },
  { name: "Steering Knuckle", material: "40Cr4", wtMin: 3.2, wtMax: 6.5, cycleMin: 9.0, cycleMax: 15.0, priceMin: 650, priceMax: 950 },
  { name: "Transmission Pinion", material: "20MnCr5", wtMin: 1.2, wtMax: 2.4, cycleMin: 4.0, cycleMax: 7.0, priceMin: 220, priceMax: 380 },
  { name: "Flange Hub", material: "EN8D", wtMin: 1.8, wtMax: 3.5, cycleMin: 5.0, cycleMax: 8.5, priceMin: 280, priceMax: 450 },
  { name: "Suspension Lift Arm", material: "40Cr4", wtMin: 4.0, wtMax: 5.5, cycleMin: 10.0, cycleMax: 14.0, priceMin: 720, priceMax: 880 },
  { name: "Bushing Sleeve", material: "SS304", wtMin: 0.3, wtMax: 0.8, cycleMin: 1.5, cycleMax: 3.0, priceMin: 95, priceMax: 160 },
  { name: "Gear Blank 5-Speed", material: "20MnCr5", wtMin: 1.1, wtMax: 1.9, cycleMin: 3.5, cycleMax: 5.5, priceMin: 180, priceMax: 290 },
  { name: "Brake Caliper Bracket", material: "LM24", wtMin: 0.8, wtMax: 1.6, cycleMin: 3.0, cycleMax: 5.0, priceMin: 160, priceMax: 260 },
  { name: "Differential Cross Pin", material: "20MnCr5", wtMin: 0.6, wtMax: 1.1, cycleMin: 2.2, cycleMax: 3.8, priceMin: 110, priceMax: 175 },
  { name: "Cam Follower Arm", material: "EN8", wtMin: 0.4, wtMax: 0.9, cycleMin: 2.0, cycleMax: 3.5, priceMin: 75, priceMax: 130 },
];

const outcomes = ["won", "won", "lost", "lost", "lost", "open", "open"] as const;

export function generatePastQuotes(count = 1400): string {
  const lines: string[] = [];
  lines.push("quote_no,quote_date,customer,part_name,material,gross_wt_kg,annual_volume,cycle_time_min,unit_price,outcome");

  let badRowsCreated = 0;
  const targetBadRows = Math.floor(count * 0.03); // ~3% bad rows

  for (let i = 1; i <= count; i++) {
    const template = pick(partTemplates);
    const customer = pick(customers);
    const year = randInt(2023, 2026);
    const month = String(randInt(1, 12)).padStart(2, "0");
    const day = String(randInt(1, 28)).padStart(2, "0");
    const quoteDate = `${year}-${month}-${day}`;
    const quoteNo = `PQ-${year}-${String(i).padStart(5, "0")}`;

    let material = template.material;
    let grossWt = randFloat(template.wtMin, template.wtMax, 3);
    let volume = randInt(5, 200) * 1000;
    const cycleTime = randFloat(template.cycleMin, template.cycleMax, 2);
    const unitPrice = randFloat(template.priceMin, template.priceMax, 2);
    const outcome = pick(outcomes as any);

    // Intentionally generate ~3% bad rows (with missing material or invalid weight/volume)
    if (badRowsCreated < targetBadRows && i % 33 === 0) {
      badRowsCreated++;
      const faultType = badRowsCreated % 3;
      if (faultType === 0) {
        material = ""; // missing material
      } else if (faultType === 1) {
        grossWt = -1.5; // negative weight
      } else {
        volume = 0; // zero volume
      }
    }

    lines.push(
      [
        quoteNo,
        quoteDate,
        customer,
        `"${template.name} Rev-${randInt(1, 4)}"`,
        material,
        grossWt,
        volume,
        cycleTime,
        unitPrice,
        outcome,
      ].join(",")
    );
  }

  return lines.join("\n");
}

function main() {
  const dataDir = path.resolve(__dirname, "../data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const csvContent = generatePastQuotes(1400);
  const outputPath = path.join(dataDir, "past-quotes.csv");
  fs.writeFileSync(outputPath, csvContent, "utf-8");
  console.log(`✓ Generated 1,400 past quotes into ${outputPath}`);
}

if (require.main === module) {
  main();
}
