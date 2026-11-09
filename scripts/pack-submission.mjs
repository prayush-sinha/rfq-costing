import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const rootDir = "c:/Users/prayu/Desktop/take home task project";
const sourceDir = path.join(rootDir, "rfq-costing");
const projectZip = path.join(rootDir, "project.zip");
const twoFileZip = path.join(rootDir, "submission.zip");
const redundantCleanZip = path.join(rootDir, "rfq-costing-clean.zip");
const stagingParent = path.join(rootDir, "staging-zip");
const stagingDir = path.join(stagingParent, "rfq-costing");

// Cleanup redundant zip and staging if present
if (fs.existsSync(redundantCleanZip)) fs.unlinkSync(redundantCleanZip);
if (fs.existsSync(projectZip)) fs.unlinkSync(projectZip);
if (fs.existsSync(path.join(sourceDir, "project.zip"))) fs.unlinkSync(path.join(sourceDir, "project.zip"));
if (fs.existsSync(path.join(rootDir, "rfq-costing-submission.zip"))) fs.unlinkSync(path.join(rootDir, "rfq-costing-submission.zip"));
if (fs.existsSync(twoFileZip)) fs.unlinkSync(twoFileZip);
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
      entry.name === ".env" ||
      (entry.name.startsWith(".env") && entry.name !== ".env.example") ||
      entry.name.endsWith(".zip") ||
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

console.log("Staging clean source files (excluding .env, node_modules, .next, .git, tsbuildinfo, zip)...");
copyRecursive(sourceDir, stagingDir);

console.log("Compressing clean submission zip with POSIX forward-slash separators...");
const cleanStaging = stagingDir.replace(/\\/g, "/");
const cleanProjectZipPath = projectZip.replace(/\\/g, "/");

// 1. Create project.zip (root relative as zip -r project.zip . would produce)
const psProjectZipScript = `
[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression') | Out-Null;
[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') | Out-Null;
$zipProj = [System.IO.Compression.ZipFile]::Open('${cleanProjectZipPath}', [System.IO.Compression.ZipArchiveMode]::Create);
Get-ChildItem -Path '${cleanStaging}' -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring('${cleanStaging}'.Length).TrimStart('\\', '/').Replace('\\', '/');
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipProj, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null;
};
$zipProj.Dispose();
`;
execSync(`powershell -NoProfile -Command "${psProjectZipScript.replace(/\r?\n/g, " ")}"`);
fs.copyFileSync(projectZip, path.join(sourceDir, "project.zip"));
const statsProj = fs.statSync(projectZip);
console.log(`\n✓ project.zip created (flat root matching 'zip -r project.zip .'):`);
console.log(`  Path: ${projectZip}`);
console.log(`  Size: ${(statsProj.size / 1024 / 1024).toFixed(2)} MB (${statsProj.size.toLocaleString()} bytes)`);

fs.rmSync(stagingParent, { recursive: true, force: true });

// 2. Create strict 2-file submission.zip as specified in the client brief
console.log("\nCompressing strict brief submission archive (TDD.docx, deployment.md)...");
const cleanTwoFileZipPath = twoFileZip.replace(/\\/g, "/");
const tddPath = path.join(sourceDir, "TDD.docx").replace(/\\/g, "/");
const deployPath = path.join(sourceDir, "deployment.md").replace(/\\/g, "/");

const psTwoFileScript = `
[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression') | Out-Null;
[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') | Out-Null;
$zip2 = [System.IO.Compression.ZipFile]::Open('${cleanTwoFileZipPath}', [System.IO.Compression.ZipArchiveMode]::Create);
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip2, '${tddPath}', 'TDD.docx', [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null;
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip2, '${deployPath}', 'deployment.md', [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null;
$zip2.Dispose();
`;
execSync(`powershell -NoProfile -Command "${psTwoFileScript.replace(/\r?\n/g, " ")}"`);
const stats2 = fs.statSync(twoFileZip);
console.log(`✓ Strict brief submission archive created:`);
console.log(`  Path: ${twoFileZip}`);
console.log(`  Size: ${(stats2.size / 1024).toFixed(1)} KB (${stats2.size.toLocaleString()} bytes)`);
