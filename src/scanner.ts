import ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";
import { HOLOGRAPHIC_LAYERS, SPECTROGRAM_CONFIG, NODE_TYPE_OFFSETS } from "./constants";

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
  const ig = ignore();
  
  const ignoreFiles = [".gitignore", ".dockerignore", ".sonicignore"];
  ignoreFiles.forEach(file => {
    const filePath = path.join(absoluteRoot, file);
    if (fs.existsSync(filePath)) ig.add(fs.readFileSync(filePath, "utf-8"));
  });

  ig.add(["node_modules", ".git", "output", "dist", ".next", "out", "build"]);
  if (manualExclusions.length > 0) ig.add(manualExclusions);

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
      if (nodes.length > 0) results.push({ fileName: relativePath, nodes, layer });
    } catch (err) {
      console.error(`⚠️ Skipping ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return results;
}

function getAllFiles(dirPath: string, rootDir: string, ig: ReturnType<typeof ignore>, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    const relativePath = path.relative(rootDir, fullPath);
    if (ig.ignores(relativePath)) return;
    if (fs.statSync(fullPath).isDirectory()) getAllFiles(fullPath, rootDir, ig, arrayOfFiles);
    else arrayOfFiles.push(fullPath);
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
    return [];
  }

  function getNodeType(node: ts.Node): string {
    if (ts.isImportDeclaration(node)) return "ImportDeclaration";
    if (ts.isVariableDeclaration(node)) return "VariableDeclaration";
    if (ts.isFunctionDeclaration(node)) return "FunctionDeclaration";
    if (ts.isArrowFunction(node)) return "ArrowFunction";
    if (ts.isClassDeclaration(node)) return "ClassDeclaration";
    if (ts.isIfStatement(node)) return "IfStatement";
    if (ts.isSwitchStatement(node)) return "SwitchStatement";
    if (ts.isBinaryExpression(node)) return "BinaryExpression";
    if (ts.isCallExpression(node)) return "CallExpression";
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) return "JsxElement";
    if (ts.isInterfaceDeclaration(node)) return "InterfaceDeclaration";
    if (ts.isTypeAliasDeclaration(node)) return "TypeAliasDeclaration";
    return "Other";
  }

  const complexityCache = new WeakMap<ts.Node, number>();

  function calculateComplexity(node: ts.Node): number {
    if (complexityCache.has(node)) return complexityCache.get(node)!;

    let branchPoints = 0;
    if (
      ts.isIfStatement(node) ||
      ts.isConditionalExpression(node) ||
      node.kind === ts.SyntaxKind.ForStatement ||
      node.kind === ts.SyntaxKind.ForInStatement ||
      node.kind === ts.SyntaxKind.ForOfStatement ||
      node.kind === ts.SyntaxKind.WhileStatement ||
      node.kind === ts.SyntaxKind.DoStatement
    ) {
      branchPoints = 1;
    } else if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        branchPoints = 1;
      }
    }

    ts.forEachChild(node, (child) => {
      branchPoints += (calculateComplexity(child) - 1);
    });

    const result = 1 + branchPoints;
    complexityCache.set(node, result);
    return result;
  }

  function visit(node: ts.Node, depth: number) {
    // Noise Reduction: Skip trivial structural nodes
    if (node.kind === ts.SyntaxKind.EndOfFileToken || node.kind === ts.SyntaxKind.OpenParenToken || node.kind === ts.SyntaxKind.CloseParenToken) return;

    let isAnomaly = node.kind === ts.SyntaxKind.Unknown;
    
    // Semantic Anomaly detection for ': any'
    if (!isAnomaly && (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isPropertyDeclaration(node))) {
      const typeNode = (node as { type?: ts.TypeNode }).type;
      if (typeNode && typeNode.kind === ts.SyntaxKind.AnyKeyword) {
        isAnomaly = true;
      }
    }
    let hz: number;
    let amplitude: number = Math.max(0.1, 1.0 - (depth * 0.15));
    let isComplexityGrowl = false;

    const nodeType = getNodeType(node);

    if (isAnomaly) {
      hz = (HOLOGRAPHIC_LAYERS.ANOMALY.min + HOLOGRAPHIC_LAYERS.ANOMALY.max) / 2 + (Math.random() * 1000);
      amplitude = 1.0;
    } else {
      const complexity = calculateComplexity(node);
      if (complexity > SPECTROGRAM_CONFIG.COMPLEXITY_THRESHOLD || depth > SPECTROGRAM_CONFIG.NESTING_THRESHOLD) {
        isComplexityGrowl = true;
        amplitude = 1.0;
      }
      
      const typeOffset = NODE_TYPE_OFFSETS[nodeType] || 0;
      hz = layer.min + typeOffset + (complexity * 10);
      
      // Ensure we don't bleed into next layer
      hz = Math.min(hz, layer.max - 1);
    }

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    nodes.push({ hz, amplitude, line, column: character, type: nodeType, isComplexityGrowl });
    ts.forEachChild(node, (child) => visit(child, depth + 1));
  }

  if (layerName === 'LOGIC') visit(sourceFile, 0);
  else sourceCode.split('\n').forEach((_, i) => nodes.push({ hz: layer.min + Math.random() * (layer.max - layer.min), amplitude: 0.5, line: i, column: 0, type: "Line" }));

  return nodes;
}
