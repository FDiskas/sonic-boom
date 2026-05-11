import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { scanDirectory, type FileScanResult, type SonicNode } from "../src/scanner";
import { ANOMALY_CATEGORIES } from "../src/constants";

const tempDir = path.join(os.tmpdir(), `sonic-detections-${Date.now()}`);

function fixture(rel: string, content: string) {
  const abs = path.join(tempDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function findResult(results: FileScanResult[], fileName: string): FileScanResult | undefined {
  return results.find(r => r.fileName === fileName);
}

function categoriesOf(result: FileScanResult | undefined): Set<string> {
  const cats = new Set<string>();
  if (!result) return cats;
  for (const n of result.nodes) {
    if (n.anomalyCategory) cats.add(n.anomalyCategory);
  }
  return cats;
}

function findAnomaly(result: FileScanResult | undefined, category: string): SonicNode | undefined {
  return result?.nodes.find(n => n.anomalyCategory === category);
}

describe("anomaly detections", () => {
  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });

    // 1. Explicit `: any` — parameter, variable, property all should fire.
    fixture("anyType.ts", [
      "function foo(x: any) { return x; }",
      "const y: any = 1;",
      "export class C { z: any = 2; }",
      "export const _ = foo(y);",
    ].join("\n"));

    // 2. Empty catch block
    fixture("emptyCatch.ts", [
      "export function f() {",
      "  try { JSON.parse('1'); } catch (e) {}",
      "}",
    ].join("\n"));

    // 3. Heavy library imports (configured in SPECTROGRAM_CONFIG.HEAVY_LIBRARIES)
    fixture("heavyLib.ts", [
      "import _ from 'lodash';",
      "import moment from 'moment';",
      "export const x = _ ?? moment;",
    ].join("\n"));

    // 4. Layer violation — file path must contain "/components/" and import must
    //    reference "/pages/". The check uses literal slash boundaries.
    fixture("src/components/Btn.tsx", [
      "import { foo } from '../pages/home';",
      "export const Btn = () => foo;",
    ].join("\n"));

    // 5. Tailwind magic value — `-[123px]` arbitrary bracket in className.
    fixture("magic.tsx", [
      "export const X = () => <div className=\"w-[123px]\">x</div>;",
    ].join("\n"));

    // 6. Z-index escalation — z-[N] where N > MAX_Z_INDEX (1000).
    fixture("zIndex.tsx", [
      "export const X = () => <div className=\"z-[5000]\">x</div>;",
    ].join("\n"));

    // 7. Prop overload — interface ending in `Props` with >7 members.
    fixture("propOverload.ts", [
      "export interface MyProps {",
      "  a: 1; b: 1; c: 1; d: 1; e: 1; f: 1; g: 1; h: 1; i: 1;",
      "}",
    ].join("\n"));

    // 8. Unresolved TODO/FIXME in a leading comment.
    fixture("todo.ts", [
      "// TODO: fix this later",
      "export function f() { return 1; }",
    ].join("\n"));

    // 9. Commented-out code block — long comment (>5 lines) with code-like chars.
    fixture("commented.ts", [
      "/*",
      "const a = 1;",
      "function b() { return 2; }",
      "class C { x = 3; }",
      "if (a) { console.log(a); }",
      "const y = 4;",
      "*/",
      "export function f() { return 0; }",
    ].join("\n"));

    // 10. Massive component — >250 lines in a .tsx file.
    const massive: string[] = ["export const X = () => ("];
    for (let i = 0; i < 260; i++) massive.push(`  <span>${i}</span>`);
    massive.push(");");
    fixture("massive.tsx", massive.join("\n"));

    // 11. Missing test file — logic file with no sibling .test/.spec.
    fixture("untested.ts", "export const v = 1;");

    // 12. Heavy barrel export — index.ts with >10 exports.
    const barrels: string[] = [];
    for (let i = 0; i < 12; i++) barrels.push(`export const v${i} = ${i};`);
    fixture("barrel/index.ts", barrels.join("\n"));

    // 13. High complexity — function with cc > 5 (we use 7 nested ifs).
    fixture("complex.ts", [
      "export function complex(a: number) {",
      "  if (a > 0) {",
      "    if (a > 1) {",
      "      if (a > 2) {",
      "        if (a > 3) {",
      "          if (a > 4) {",
      "            if (a > 5) {",
      "              if (a > 6) return a;",
      "            }",
      "          }",
      "        }",
      "      }",
      "    }",
      "  }",
      "  return 0;",
      "}",
    ].join("\n"));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("detects Explicit 'any' type (param, variable, property)", () => {
    const results = scanDirectory(tempDir);
    const r = findResult(results, "anyType.ts");
    const anyNodes = r!.nodes.filter(n => n.anomalyCategory === ANOMALY_CATEGORIES.EXPLICIT_ANY);
    // Three occurrences (param x, variable y, property z).
    expect(anyNodes.length).toBeGreaterThanOrEqual(3);
    expect(anyNodes[0]!.severity).toBe("med");
  });

  test("detects Empty catch block", () => {
    const cats = categoriesOf(findResult(scanDirectory(tempDir), "emptyCatch.ts"));
    expect(cats.has(ANOMALY_CATEGORIES.EMPTY_CATCH)).toBe(true);
  });

  test("detects Heavy Library Import and includes library name in label", () => {
    const r = findResult(scanDirectory(tempDir), "heavyLib.ts");
    const heavy = r!.nodes.filter(n => n.anomalyCategory === ANOMALY_CATEGORIES.HEAVY_LIBRARY);
    expect(heavy.length).toBe(2);
    const labels = heavy.map(n => n.anomalyType ?? "");
    expect(labels.some(l => l.includes("lodash"))).toBe(true);
    expect(labels.some(l => l.includes("moment"))).toBe(true);
  });

  test("detects Layer Violation when /components/ imports from /pages/", () => {
    const cats = categoriesOf(findResult(scanDirectory(tempDir), "src/components/Btn.tsx"));
    expect(cats.has(ANOMALY_CATEGORIES.LAYER_VIOLATION)).toBe(true);
  });

  test("detects Tailwind Magic Value", () => {
    const cats = categoriesOf(findResult(scanDirectory(tempDir), "magic.tsx"));
    expect(cats.has(ANOMALY_CATEGORIES.MAGIC_VALUE)).toBe(true);
  });

  test("detects Z-Index Escalation and includes the value in label", () => {
    const r = findResult(scanDirectory(tempDir), "zIndex.tsx");
    const node = findAnomaly(r, ANOMALY_CATEGORIES.Z_INDEX);
    expect(node).toBeDefined();
    expect(node!.anomalyType).toMatch(/5000/);
  });

  test("detects Prop Overload and includes prop count in label", () => {
    const r = findResult(scanDirectory(tempDir), "propOverload.ts");
    const node = findAnomaly(r, ANOMALY_CATEGORIES.PROP_OVERLOAD);
    expect(node).toBeDefined();
    expect(node!.anomalyType).toMatch(/\d+ props/);
    expect(node!.severity).toBe("high");
  });

  test("detects Unresolved TODO/FIXME", () => {
    const cats = categoriesOf(findResult(scanDirectory(tempDir), "todo.ts"));
    expect(cats.has(ANOMALY_CATEGORIES.TODO)).toBe(true);
  });

  test("detects Commented-out Code Block", () => {
    const cats = categoriesOf(findResult(scanDirectory(tempDir), "commented.ts"));
    expect(cats.has(ANOMALY_CATEGORIES.COMMENTED_CODE)).toBe(true);
  });

  test("detects Massive Component and includes line count in label", () => {
    const r = findResult(scanDirectory(tempDir), "massive.tsx");
    const node = findAnomaly(r, ANOMALY_CATEGORIES.MASSIVE_COMPONENT);
    expect(node).toBeDefined();
    expect(node!.anomalyType).toMatch(/\d+ lines/);
    expect(node!.severity).toBe("high");
  });

  test("detects Missing Test File for orphan logic files", () => {
    const cats = categoriesOf(findResult(scanDirectory(tempDir), "untested.ts"));
    expect(cats.has(ANOMALY_CATEGORIES.MISSING_TEST)).toBe(true);
  });

  test("detects Heavy Barrel Export and includes export count in label", () => {
    const r = findResult(scanDirectory(tempDir), "barrel/index.ts");
    const node = findAnomaly(r, ANOMALY_CATEGORIES.HEAVY_BARREL);
    expect(node).toBeDefined();
    expect(node!.anomalyType).toMatch(/\d+ exports/);
  });

  test("detects High Complexity and surfaces cc + depth in label", () => {
    const r = findResult(scanDirectory(tempDir), "complex.ts");
    const growl = r!.nodes.find(n => n.isComplexityGrowl);
    expect(growl).toBeDefined();
    expect(growl!.anomalyCategory).toBe(ANOMALY_CATEGORIES.HIGH_COMPLEXITY);
    expect(growl!.anomalyType).toMatch(/cc=\d+/);
    expect(growl!.anomalyType).toMatch(/depth=\d+/);
  });

  test("every detected anomaly carries a severity in {high,med,low}", () => {
    const results = scanDirectory(tempDir);
    const allAnomalies = results.flatMap(res =>
      res.nodes.filter(n => n.anomalyCategory || n.isComplexityGrowl)
    );
    expect(allAnomalies.length).toBeGreaterThan(0);
    for (const a of allAnomalies) {
      expect(["high", "med", "low"]).toContain(a.severity!);
    }
  });

  test("severity matches the canonical mapping", () => {
    const results = scanDirectory(tempDir);
    expect(findAnomaly(findResult(results, "emptyCatch.ts"), ANOMALY_CATEGORIES.EMPTY_CATCH)!.severity).toBe("high");
    expect(findAnomaly(findResult(results, "magic.tsx"), ANOMALY_CATEGORIES.MAGIC_VALUE)!.severity).toBe("low");
    expect(findAnomaly(findResult(results, "todo.ts"), ANOMALY_CATEGORIES.TODO)!.severity).toBe("med");
    expect(findAnomaly(findResult(results, "untested.ts"), ANOMALY_CATEGORIES.MISSING_TEST)!.severity).toBe("low");
  });

  test("scans are deterministic — two runs produce identical node trees", () => {
    const r1 = scanDirectory(tempDir);
    const r2 = scanDirectory(tempDir);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  test("anomaly Hz values fall inside the ANOMALY band", () => {
    const results = scanDirectory(tempDir);
    const anomalies = results.flatMap(r =>
      r.nodes.filter(n => n.anomalyCategory || n.isComplexityGrowl)
    );
    for (const a of anomalies) {
      // ANOMALY band is 16000-20000 (see HOLOGRAPHIC_LAYERS.ANOMALY).
      expect(a.hz).toBeGreaterThanOrEqual(16000);
      expect(a.hz).toBeLessThan(20000);
    }
  });
});
