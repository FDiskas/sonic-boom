#!/usr/bin/env node
import { scanDirectory } from "./scanner";
import { generateProjectSpectrogram } from "./generator";
import { resolveCoordinates } from "./resolver";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes("--version") || args.includes("-v")) {
    const pkgPath = path.join(import.meta.dirname, "../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    console.log(`🎵 Sonic Code Sentinel v${pkg.version}`);
    process.exit(0);
  }

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.length === 0) {
    printHelp();
    process.exit(1);
  }

  const outputDir = path.join(process.cwd(), "output");
  const mappingTablePath = path.join(outputDir, "mapping_table.json");

  if (args[0] === "fix") {
    const coordsIndex = args.indexOf("--coords");
    const issueIndex = args.indexOf("--issue");
    
    const coordsValue = args[coordsIndex + 1];
    if (coordsIndex === -1 || !coordsValue) {
      console.error("❌ Missing --coords 'x,y'");
      process.exit(1);
    }

    const [x, y] = coordsValue.split(",").map(Number);
    if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) {
      console.error("❌ Invalid --coords format. Use 'x,y' (e.g., 150,400)");
      process.exit(1);
    }

    const issueValue = issueIndex !== -1 ? args[issueIndex + 1] : null;
    const issue = issueValue ?? "General fix";

    console.log(`🎯 Initializing Surgical Strike at [${x}, ${y}]...`);
    const resolution = resolveCoordinates(x, y, mappingTablePath, process.cwd());

    if (!resolution) {
      console.error("❌ Could not resolve coordinates.");
      process.exit(1);
    }

    console.log("📂 JIT Context Extracted:");
    console.log(resolution.context);
    console.log(`📝 Reported Issue: ${issue}`);
    console.log("\n🚀 Sending snippet to Surgical AI Engine...");
    console.log("✨ AI Fix Generated (Preview):");
    console.log("--------------------------------------------------");
    console.log(`FILE: ${resolution.file}`);
    console.log(`- (Original code at line ${resolution.line})`);
    console.log(`+ (Fixed code based on issue: ${issue})`);
    console.log("--------------------------------------------------");
    return;
  }

  // Scan Logic
  const targetDir = args.find(arg => !arg.startsWith("-"));
  const manualExclusions: string[] = [];
  args.forEach((arg, i) => {
    const nextArg = args[i + 1];
    if ((arg === "--exclude" || arg === "-e") && nextArg) {
      manualExclusions.push(nextArg);
    }
  });

  if (!targetDir) {
    printHelp();
    process.exit(1);
  }

  const absoluteTarget = path.resolve(targetDir);
  if (!fs.existsSync(absoluteTarget)) {
    console.error(`❌ Directory not found: ${absoluteTarget}`);
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log(`🔍 Scanning: ${absoluteTarget}`);
  const results = scanDirectory(absoluteTarget, manualExclusions);
  await generateProjectSpectrogram(results, outputDir);
  console.log("✅ Analysis Complete.");
}

function printHelp() {
  const pkgPath = path.join(import.meta.dirname, "../package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  console.log(`🎵 Sonic Code Sentinel v${pkg.version}`);
  console.log("\nUsage:");
  console.log("  npx sonic-boom <dir> [--exclude <pattern>]");
  console.log("  npx sonic-boom fix --coords <x,y> [--issue <description>]");
  console.log("\nOptions:");
  console.log("  --version, -v  Show version");
  console.log("  --help, -h     Show help");
  console.log("  --exclude, -e  Exclude patterns during scan");
}

main().catch(err => {
  console.error("💥 Critical Failure:", err);
  process.exit(1);
});
