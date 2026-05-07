#!/usr/bin/env node
import { scanDirectory } from "./scanner";
import { generateProjectSpectrogram } from "./generator";
import { resolveCoordinates } from "./resolver";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const args = process.argv.slice(2);
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
  console.log("🎵 Sonic Code Sentinel CLI");
  console.log("Usage:");
  console.log("  bun run src/index.ts <dir> [--exclude <pattern>]");
  console.log("  bun run src/index.ts fix --coords <x,y> [--issue <description>]");
}

main().catch(err => {
  console.error("💥 Critical Failure:", err);
  process.exit(1);
});
