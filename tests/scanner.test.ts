import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { scanDirectory } from "../src/scanner";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Scanner Ignore Logic", () => {
  const tempDir = path.join(os.tmpdir(), `sonic-test-${Date.now()}`);

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    // Root level files
    fs.mkdirSync(path.join(tempDir, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "node_modules/bad.ts"), "error");
    
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "src/index.ts"), "const x = 1;");
    
    fs.mkdirSync(path.join(tempDir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "dist/bundle.js"), "console.log(1);");
    
    // Nested packages
    fs.mkdirSync(path.join(tempDir, "packages/pkg1"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "packages/pkg1/index.ts"), "export {}");
    
    fs.mkdirSync(path.join(tempDir, "packages/pkg1/temp"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "packages/pkg1/temp/ignored.ts"), "ignore me");

    // Ignore files
    fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\ndist/");
    fs.writeFileSync(path.join(tempDir, "packages/pkg1/.npmignore"), "temp/");
    fs.writeFileSync(path.join(tempDir, "packages/pkg1/.sonicignore"), "secret.ts");
    fs.writeFileSync(path.join(tempDir, "packages/pkg1/secret.ts"), "hush");
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("should respect root .gitignore", () => {
    const results = scanDirectory(tempDir);
    const files = results.map(r => r.fileName);
    
    expect(files).not.toContain("node_modules/bad.ts");
    expect(files).not.toContain("dist/bundle.js");
    expect(files).toContain("src/index.ts");
  });

  test("should respect nested .npmignore", () => {
    const results = scanDirectory(tempDir);
    const files = results.map(r => r.fileName);
    
    expect(files).not.toContain("packages/pkg1/temp/ignored.ts");
    expect(files).toContain("packages/pkg1/index.ts");
  });

  test("should respect nested .sonicignore", () => {
    const results = scanDirectory(tempDir);
    const files = results.map(r => r.fileName);
    
    expect(files).not.toContain("packages/pkg1/secret.ts");
  });

  test("should handle manual exclusions", () => {
    const results = scanDirectory(tempDir, ["src/index.ts"]);
    const files = results.map(r => r.fileName);
    
    expect(files).not.toContain("src/index.ts");
  });

  test("should handle nested directories in root .gitignore", () => {
    // Add a directory to ignore in root
    fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\ndist/\nignored-dir/");
    fs.mkdirSync(path.join(tempDir, "ignored-dir"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "ignored-dir/file.ts"), "test");
    
    const results = scanDirectory(tempDir);
    const files = results.map(r => r.fileName);
    expect(files).not.toContain("ignored-dir/file.ts");
  });

  test("should handle negation patterns", () => {
    fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\ndist/\n*.temp.ts\n!important.temp.ts");
    fs.writeFileSync(path.join(tempDir, "test.temp.ts"), "const x = 1;");
    fs.writeFileSync(path.join(tempDir, "important.temp.ts"), "const x = 1;");
    
    const results = scanDirectory(tempDir);
    const files = results.map(r => r.fileName);
    
    expect(files).not.toContain("test.temp.ts");
    expect(files).toContain("important.temp.ts");
  });

  test("does not crash on .vscode / .idea directories (EISDIR regression)", () => {
    // Reset .gitignore to a minimal one so we can isolate this behaviour.
    fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\ndist/");

    // .vscode and .idea exist as directories in many real projects — the scanner
    // used to treat them as ignore-FILES and crash with EISDIR on readFileSync.
    fs.mkdirSync(path.join(tempDir, ".vscode"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, ".vscode/settings.json"), "{}");
    fs.mkdirSync(path.join(tempDir, ".idea"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, ".idea/workspace.xml"), "<x/>");

    expect(() => scanDirectory(tempDir)).not.toThrow();

    const files = scanDirectory(tempDir).map(r => r.fileName);
    // Both IDE folders should also be skipped, not walked into.
    expect(files.some(f => f.startsWith(".vscode/"))).toBe(false);
    expect(files.some(f => f.startsWith(".idea/"))).toBe(false);
  });

  test("does not crash on random dot directory .zod (EISDIR regression)", () => {
    // Reset .gitignore to a minimal one so we can isolate this behaviour.
    fs.writeFileSync(path.join(tempDir, ".gitignore"), "node_modules/\ndist/");

    // .zod exists as a directory in some projects — the scanner
    // used to treat it as an ignore-FILE and crash with EISDIR on readFileSync.
    fs.mkdirSync(path.join(tempDir, ".zod"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, ".zod/settings.json"), "{}");

    expect(() => scanDirectory(tempDir)).not.toThrow();

    const files = scanDirectory(tempDir).map(r => r.fileName);
    // The .zod folder should also be skipped, not walked into.
    expect(files.some(f => f.startsWith(".zod/"))).toBe(false);
  });
});
