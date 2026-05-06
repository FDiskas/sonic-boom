import ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";
import { FREQUENCY_MAP, HOLOGRAPHIC_LAYERS, SPECTROGRAM_CONFIG } from "./constants";

export interface SonicNode {
  hz: number;
  amplitude: number;
  line: number;
  column: number;
  type: string;
  isComplexityGrowl?: boolean;
}

export interface FileScanResult {
  fileName: string;
  nodes: SonicNode[];
  layer: keyof typeof HOLOGRAPHIC_LAYERS;
}

export function scanDirectory(rootDir: string, manualExclusions: string[] = []): FileScanResult[] {
  const results: FileScanResult[] = [];
  const absoluteRoot = path.resolve(rootDir);
  
  // Initialize ignore engine
  const ig = ignore();
  
  // Load ignore files
  const ignoreFiles = [".gitignore", ".dockerignore", ".sonicignore"];
  ignoreFiles.forEach(file => {
    const filePath = path.join(absoluteRoot, file);
    if (fs.existsSync(filePath)) {
      ig.add(fs.readFileSync(filePath, "utf-8"));
    }
  });

  // Add manual exclusions
  if (manualExclusions.length > 0) {
    ig.add(manualExclusions);
  }

  // Common noise defaults
  ig.add(["node_modules", ".git", "output"]);

  const files = getAllFiles(absoluteRoot, absoluteRoot, ig);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    let layer: keyof typeof HOLOGRAPHIC_LAYERS | null = null;

    for (const [key, config] of Object.entries(HOLOGRAPHIC_LAYERS)) {
      if ('extensions' in config && config.extensions.includes(ext)) {
        layer = key as keyof typeof HOLOGRAPHIC_LAYERS;
        break;
      }
    }

    if (!layer) continue;

    try {
      const content = fs.readFileSync(file, "utf-8");
      const relativePath = path.relative(absoluteRoot, file);
      const nodes = scanCode(content, relativePath, layer);
      
      if (nodes.length > 0) {
        results.push({ fileName: relativePath, nodes, layer });
      }
    } catch (err) {
      console.warn(`⚠️ Failed to scan ${file}:`, err instanceof Error ? err.message : err);
    }
  }

  return results;
}

function getAllFiles(dirPath: string, rootDir: string, ig: ReturnType<typeof ignore>, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    const relativePath = path.relative(rootDir, fullPath);

    // Check if path is ignored
    if (ig.ignores(relativePath)) {
      return;
    }

    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, rootDir, ig, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

export function scanCode(sourceCode: string, fileName: string, layerName: keyof typeof HOLOGRAPHIC_LAYERS): SonicNode[] {
  const layer = HOLOGRAPHIC_LAYERS[layerName];
  const nodes: SonicNode[] = [];

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(fileName, sourceCode, ts.ScriptTarget.Latest, true);
  } catch (err) {
    console.warn(`⚠️ TypeScript could not parse ${fileName}, skipping AST analysis.`);
    return [];
  }

  function getSubCategory(node: ts.Node): keyof typeof FREQUENCY_MAP {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return "INFRASTRUCTURE";
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text.startsWith("use")) return "STRUCTURAL_HOOKS";
    if (ts.isIfStatement(node) || ts.isSwitchStatement(node) || ts.isConditionalExpression(node)) return "LOGIC_FLOW";
    if (ts.isVariableDeclaration(node) || ts.isBinaryExpression(node)) return "DATA_OPS";
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) return "UI_JSX";
    return "DATA_OPS";
  }

  function calculateComplexity(node: ts.Node): number {
    let complexity = 1;
    node.forEachChild(child => {
      if (ts.isIfStatement(child) || ts.isConditionalExpression(child) || ts.isBinaryExpression(child) || ts.isIterationStatement(child, true)) {
        complexity += 1;
      }
    });
    return complexity;
  }

  function visit(node: ts.Node, depth: number) {
    const isAnomaly = node.getText().includes(": any") || node.kind === ts.SyntaxKind.Unknown;
    
    let hz: number;
    let amplitude: number = Math.max(0.1, 1.0 - (depth * 0.15));
    let isComplexityGrowl = false;

    if (isAnomaly) {
      const range = HOLOGRAPHIC_LAYERS.ANOMALY;
      hz = (range.min + range.max) / 2 + (Math.random() * 1000);
      amplitude = 1.0;
    } else {
      const subCat = getSubCategory(node);
      const subRange = FREQUENCY_MAP[subCat];
      const layerSpan = layer.max - layer.min;
      
      const complexity = calculateComplexity(node);
      
      if (complexity > SPECTROGRAM_CONFIG.COMPLEXITY_THRESHOLD || depth > SPECTROGRAM_CONFIG.NESTING_THRESHOLD) {
        isComplexityGrowl = true;
        amplitude = 1.0;
      }

      const basePos = (subRange.min + subRange.max) / 2;
      hz = layer.min + (basePos * layerSpan) + (complexity * 20);
    }

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());

    nodes.push({
      hz,
      amplitude,
      line,
      column: character,
      type: ts.SyntaxKind[node.kind],
      isComplexityGrowl
    });

    ts.forEachChild(node, (child) => visit(child, depth + 1));
  }

  if (layerName === 'LOGIC') {
    visit(sourceFile, 0);
  } else {
    const lines = sourceCode.split('\n');
    lines.forEach((_, idx) => {
      nodes.push({
        hz: layer.min + (Math.random() * (layer.max - layer.min)),
        amplitude: 0.5,
        line: idx,
        column: 0,
        type: "Line"
      });
    });
  }

  return nodes;
}
