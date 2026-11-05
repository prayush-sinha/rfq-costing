import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const rootDir = "c:/Users/prayu/Desktop/take home task project";
const sourceDir = path.join(rootDir, "rfq-costing");
const subZip = path.join(rootDir, "rfq-costing-submission.zip");
const redundantCleanZip = path.join(rootDir, "rfq-costing-clean.zip");
const stagingParent = path.join(rootDir, "staging-zip");
const stagingDir = path.join(stagingParent, "rfq-costing");

// Cleanup redundant zip and staging if present
if (fs.existsSync(redundantCleanZip)) {
  fs.unlinkSync(redundantCleanZip);
  console.log(`Removed redundant zip: ${redundantCleanZip}`);
}
if (fs.existsSync(subZip)) fs.unlinkSync(subZip);
if (fs.existsSync(stagingParent)) {
  fs.rmSync(stagingParent, { recursive: true, force: true });
}

fs.mkdirSync(stagingDir, { recursive: true });

function copyRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Strictly skip build caches, secrets, and repository internals
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === ".git" ||
      entry.name === ".env.local" ||
      entry.name.endsWith(".tsbuildinfo") ||
      entry.name.endsWith(".log")
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

console.log("Staging clean source files (excluding .env.local, node_modules, .next, .git, tsbuildinfo)...");
copyRecursive(sourceDir, stagingDir);

console.log("Compressing clean submission zip...");
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}' -DestinationPath '${subZip}' -Force"`
);

fs.rmSync(stagingParent, { recursive: true, force: true });

const stats = fs.statSync(subZip);
console.log(`\n✓ Pristine submission archive created:`);
console.log(`  Path: ${subZip}`);
console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB (${stats.size.toLocaleString()} bytes)`);
