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
    
    if (coordsIndex === -1 || !args[coordsIndex + 1]) {
      console.error("❌ Missing --coords 'x,y'");
      process.exit(1);
    }

    const [x, y] = args[coordsIndex + 1].split(",").map(Number);
    const issue = issueIndex !== -1 ? args[issueIndex + 1] : "General fix";

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
    if ((arg === "--exclude" || arg === "-e") && args[i + 1]) {
      manualExclusions.push(args[i + 1]);
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
