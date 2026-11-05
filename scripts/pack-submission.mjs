import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const rootDir = "c:/Users/prayu/Desktop/take home task project";
const sourceDir = path.join(rootDir, "rfq-costing");
const subZip = path.join(rootDir, "rfq-costing-submission.zip");
const cleanZip = path.join(rootDir, "rfq-costing-clean.zip");
const stagingDir = path.join(rootDir, "staging-zip", "rfq-costing");

// Cleanup previous staging and zips
if (fs.existsSync(path.join(rootDir, "staging-zip"))) {
  fs.rmSync(path.join(rootDir, "staging-zip"), { recursive: true, force: true });
}
if (fs.existsSync(subZip)) fs.unlinkSync(subZip);
if (fs.existsSync(cleanZip)) fs.unlinkSync(cleanZip);

fs.mkdirSync(stagingDir, { recursive: true });

function copyRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip node_modules, .next, .git, and .env.local
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === ".git" ||
      entry.name === ".env.local"
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log("Copying files to staging directory (excluding secrets, node_modules, .next, .git)...");
copyRecursive(sourceDir, stagingDir);

console.log("Creating zip archive...");
// Use powershell Compress-Archive on the staging directory
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${path.join(rootDir, "staging-zip", "rfq-costing")}' -DestinationPath '${subZip}' -Force"`
);

fs.copyFileSync(subZip, cleanZip);
fs.rmSync(path.join(rootDir, "staging-zip"), { recursive: true, force: true });

console.log("Archive created successfully:");
const stats = fs.statSync(subZip);
console.log(`- ${subZip} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`- ${cleanZip} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
