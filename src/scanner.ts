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
  anomalyType?: string;
}

export interface FileScanResult {
  fileName: string;
  nodes: SonicNode[];
  layer: keyof typeof HOLOGRAPHIC_LAYERS;
  stats?: {
    lineCount: number;
    hasTest: boolean;
  };
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
  
  // Project-wide context
  const testFiles = new Set(files.filter(f => f.includes(".test.") || f.includes(".spec.")).map(f => path.basename(f).split('.')[0]));

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
      const baseName = path.basename(file).split('.')[0];
      const hasTest = testFiles.has(baseName);
      
      const nodes = scanCode(content, relativePath, layer, { hasTest, rootDir: absoluteRoot });
      
      if (nodes.length > 0) {
        results.push({ 
          fileName: relativePath, 
          nodes, 
          layer,
          stats: {
            lineCount: content.split('\n').length,
            hasTest
          }
        });
      }
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

export function scanCode(sourceCode: string, fileName: string, layerName: keyof typeof HOLOGRAPHIC_LAYERS, context: { hasTest: boolean; rootDir: string }): SonicNode[] {
  const layer = HOLOGRAPHIC_LAYERS[layerName];
  const nodes: SonicNode[] = [];
  let sourceFile: ts.SourceFile;

  try {
    sourceFile = ts.createSourceFile(fileName, sourceCode, ts.ScriptTarget.Latest, true);
  } catch (err) {
    return [];
  }

  // File-level checks
  const lineCount = sourceCode.split('\n').length;
  if (lineCount > SPECTROGRAM_CONFIG.MAX_COMPONENT_LINES && (fileName.endsWith('.tsx') || fileName.endsWith('.jsx'))) {
    nodes.push({ 
      hz: HOLOGRAPHIC_LAYERS.ANOMALY.min + 500, 
      amplitude: 1.0, 
      line: 0, 
      column: 0, 
      type: "File", 
      anomalyType: `Massive Component (${lineCount} lines)` 
    });
  }

  if (!context.hasTest && !fileName.includes('.test.') && !fileName.includes('.spec.') && layerName === 'LOGIC') {
    nodes.push({ 
      hz: HOLOGRAPHIC_LAYERS.ANOMALY.min + 1000, 
      amplitude: 0.8, 
      line: 0, 
      column: 0, 
      type: "File", 
      anomalyType: "Missing Test File" 
    });
  }

  if (fileName.endsWith('index.ts') || fileName.endsWith('index.js')) {
    const exportCount = (sourceCode.match(/export /g) || []).length;
    if (exportCount > 10) {
      nodes.push({ 
        hz: HOLOGRAPHIC_LAYERS.ANOMALY.min + 1500, 
        amplitude: 0.7, 
        line: 0, 
        column: 0, 
        type: "File", 
        anomalyType: `Heavy Barrel Export (${exportCount} exports)` 
      });
    }
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
    if (node.kind === ts.SyntaxKind.EndOfFileToken || node.kind === ts.SyntaxKind.OpenParenToken || node.kind === ts.SyntaxKind.CloseParenToken) return;

    let isAnomaly = node.kind === ts.SyntaxKind.Unknown;
    let anomalyType: string | undefined;
    
    // 1. Explicit Any
    if (!isAnomaly && (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isPropertyDeclaration(node))) {
      const typeNode = (node as { type?: ts.TypeNode }).type;
      if (typeNode && typeNode.kind === ts.SyntaxKind.AnyKeyword) {
        isAnomaly = true;
        anomalyType = "Explicit 'any' type";
      }
    }

    // 2. Empty Catch
    if (!isAnomaly && ts.isCatchClause(node)) {
      if (node.block.statements.length === 0) {
        isAnomaly = true;
        anomalyType = "Empty catch block";
      }
    }

    // 3. Heavy Libraries & Layer Boundaries
    if (!isAnomaly && ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier.getText().replace(/['"]/g, '');
      if (SPECTROGRAM_CONFIG.HEAVY_LIBRARIES.some(lib => moduleSpecifier.includes(lib))) {
        isAnomaly = true;
        anomalyType = `Heavy Library Import (${moduleSpecifier})`;
      }

      // Basic Layer Boundary Check
      if (fileName.includes('/components/') && moduleSpecifier.includes('/pages/')) {
        isAnomaly = true;
        anomalyType = "Layer Violation: Component importing from Page";
      }
    }

    // 4. Tailwind & Magic Values
    if (!isAnomaly && (ts.isJsxAttribute(node) || ts.isStringLiteral(node))) {
      const text = node.getText();
      if (text.includes('-[') && !text.includes('var(')) {
        isAnomaly = true;
        anomalyType = "Tailwind Magic Value detected";
      }
      const zMatch = text.match(/z-\[(\d+)\]|z-(\d+)/);
      if (zMatch) {
        const val = parseInt(zMatch[1] ?? zMatch[2] ?? "0");
        if (val > SPECTROGRAM_CONFIG.MAX_Z_INDEX) {
          isAnomaly = true;
          anomalyType = `Z-Index Escalation (${val})`;
        }
      }
    }

    // 6. Prop Overload (Heuristic for Prop Drilling)
    if (!isAnomaly && ts.isInterfaceDeclaration(node) && node.name.text.endsWith('Props')) {
      if (node.members.length > 7) {
        isAnomaly = true;
        anomalyType = `Prop Overload (${node.members.length} props)`;
      }
    }

    // 5. TODO/FIXME
    const fullText = sourceFile.getFullText();
    const comments = ts.getLeadingCommentRanges(fullText, node.getFullStart());
    if (comments) {
      for (const comment of comments) {
        const commentText = fullText.substring(comment.pos, comment.end);
        if (/TODO|FIXME/i.test(commentText)) {
          isAnomaly = true;
          anomalyType = "Unresolved TODO/FIXME";
          break;
        }
        // Detect commented-out code (heuristic: long comments with code-like characters)
        if (commentText.split('\n').length > 5 && /[{};=()]/g.test(commentText)) {
          isAnomaly = true;
          anomalyType = "Commented-out Code Block";
          break;
        }
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
      // Only check complexity for "major" blocks to avoid noise
      const isMajorBlock = ts.isFunctionDeclaration(node) || 
                          ts.isMethodDeclaration(node) || 
                          ts.isArrowFunction(node) || 
                          ts.isClassDeclaration(node);
                          
      if (isMajorBlock) {
        const complexity = calculateComplexity(node);
        if (complexity > SPECTROGRAM_CONFIG.COMPLEXITY_THRESHOLD || depth > SPECTROGRAM_CONFIG.NESTING_THRESHOLD) {
          isComplexityGrowl = true;
          amplitude = 1.0;
        }
      }
      
      const typeOffset = NODE_TYPE_OFFSETS[nodeType] || 0;
      hz = layer.min + typeOffset; // Remove complexity from Hz to keep bands clean
      hz = Math.min(hz, layer.max - 1);
    }

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    nodes.push({ hz, amplitude, line, column: character, type: nodeType, isComplexityGrowl, anomalyType });
    ts.forEachChild(node, (child) => visit(child, depth + 1));
  }

  if (layerName === 'LOGIC') visit(sourceFile, 0);
  else sourceCode.split('\n').forEach((_, i) => nodes.push({ hz: layer.min + Math.random() * (layer.max - layer.min), amplitude: 0.5, line: i, column: 0, type: "Line" }));

  return nodes;
}
