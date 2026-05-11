import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { scanDirectory } from "../src/scanner";
import { generateProjectSpectrogram } from "../src/generator";
import { resolveCoordinates } from "../src/resolver";
import { SPECTROGRAM_CONFIG } from "../src/constants";

const { HEIGHT, MAX_HZ } = SPECTROGRAM_CONFIG;

// Generator's anomaly pixel placement, mirrored here so we can ask the
// resolver to round-trip a specific (line, hz) we know was drawn.
function anomalyPixel(entry: any, line: number, hz: number) {
  const slotWidth = entry.xr[1] - entry.xr[0] + 1;
  const divisor = Math.max(1, slotWidth - 2);
  const maxLine = entry.ml || 1;
  const x = entry.xr[0] + Math.floor((line / maxLine) * divisor);
  const y = HEIGHT - 1 - Math.floor((hz / MAX_HZ) * (HEIGHT - 1));
  return { x, y };
}

describe("resolveCoordinates", () => {
  const tempDir = path.join(os.tmpdir(), `sonic-resolver-test-${Date.now()}`);
  const outDir = path.join(os.tmpdir(), `sonic-resolver-out-${Date.now()}`);
  let tablePath = "";
  let mappingTable: any[] = [];

  beforeAll(async () => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });

    // Synthesize a file with one clear anomaly far from the header.
    const lines: string[] = [];
    for (let i = 0; i < 200; i++) lines.push(`const v${i} = ${i};`);
    lines[120] = "function veryComplex(a: any, b: any) { if (a) { if (b) { if (a > b) { return a; } else { return b; } } } return 0; }";
    fs.writeFileSync(path.join(tempDir, "a.ts"), lines.join("\n"));

    const results = scanDirectory(tempDir);
    const out = await generateProjectSpectrogram(results, outDir);
    tablePath = out.tablePath;
    mappingTable = out.mappingTable;
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  test("returns the real file name (not undefined)", () => {
    const entry = mappingTable[0];
    const { x, y } = anomalyPixel(entry, 0, 100);
    const r = resolveCoordinates(x, y, tablePath, tempDir);
    expect(r).not.toBeNull();
    expect(r!.file).toBe("a.ts");
  });

  test("snaps to the real anomaly line, not the X-derived estimate", () => {
    const entry = mappingTable[0];
    const anomalies = entry.an || [];
    expect(anomalies.length).toBeGreaterThan(0);

    for (const an of anomalies) {
      const { x, y } = anomalyPixel(entry, an.l, an.h);
      const r = resolveCoordinates(x, y, tablePath, tempDir);
      expect(r).not.toBeNull();
      // Resolver should return EXACTLY the anomaly's line (+1 for 1-based).
      expect(r!.line).toBe(an.l + 1);
      expect(r!.type).toBe(an.t);
    }
  });

  test("tolerates +/-2px imprecision on the click", () => {
    const entry = mappingTable[0];
    const anomalies = entry.an || [];
    const target = anomalies.find((a: any) => a.l > 50) || anomalies[0];
    const { x, y } = anomalyPixel(entry, target.l, target.h);

    for (const dx of [-2, -1, 0, 1, 2]) {
      const r = resolveCoordinates(x + dx, y, tablePath, tempDir);
      expect(r).not.toBeNull();
      // Within +/-2px we should still land on a real anomaly's line —
      // not drift to line 1 (the file header).
      const matched = anomalies.some((a: any) => a.l + 1 === r!.line);
      expect(matched).toBe(true);
    }
  });

  test("does not return line 1 for high-line anomalies (no header drift)", () => {
    const entry = mappingTable[0];
    const anomalies = entry.an || [];
    const highLineAnomaly = anomalies.find((a: any) => a.l > 50);
    if (!highLineAnomaly) return; // not applicable in this fixture

    const { x, y } = anomalyPixel(entry, highLineAnomaly.l, highLineAnomaly.h);
    const r = resolveCoordinates(x, y, tablePath, tempDir);
    expect(r).not.toBeNull();
    expect(r!.line).toBeGreaterThan(1);
  });
});
