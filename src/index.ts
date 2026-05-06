import { scanDirectory } from "./scanner";
import { generateProjectSpectrogram } from "./generator";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const args = process.argv.slice(2);
  const targetDir = args.find(arg => !arg.startsWith("-"));
  
  const manualExclusions: string[] = [];
  args.forEach((arg, i) => {
    if (arg === "--exclude" || arg === "-e") {
      const val = args[i + 1];
      if (val) manualExclusions.push(val);
    }
  });

  if (!targetDir) {
    console.error("❌ Usage: bun run src/index.ts <directory-to-scan> [--exclude <pattern>]");
    process.exit(1);
  }

  const absoluteTarget = path.resolve(targetDir);
  if (!fs.existsSync(absoluteTarget)) {
    console.error(`❌ Directory not found: ${absoluteTarget}`);
    process.exit(1);
  }

  const outputDir = path.join(process.cwd(), "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log("🎵 Sonic Code Sentinel: Initializing...");
  console.log(`🔍 Target: ${absoluteTarget}`);
  if (manualExclusions.length > 0) {
    console.log(`🚫 Manual Exclusions: ${manualExclusions.join(", ")}`);
  }
  
  const results = scanDirectory(absoluteTarget, manualExclusions);
  
  if (results.length === 0) {
    console.warn("⚠️ No supported files found to scan.");
    return;
  }

  console.log(`🔊 Batch Processing ${results.length} files...`);
  await generateProjectSpectrogram(results, outputDir);
  
  console.log("✅ Diagnostic Complete.");
  console.log(`📍 Spectrogram: ${path.join(outputDir, "spectrogram.png")}`);
  console.log(`📍 Mapping Table: ${path.join(outputDir, "mapping_table.json")}`);
}

main().catch(err => {
  console.error("💥 Sentinel Critical Error:", err);
  process.exit(1);
});
