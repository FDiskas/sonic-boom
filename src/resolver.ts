import * as fs from "fs";
import * as path from "path";
import { SPECTROGRAM_CONFIG, HOLOGRAPHIC_LAYERS } from "./constants";

export interface ResolvedCoordinate {
  file: string;
  line: number;
  type: string;
  context: string;
}

export function resolveCoordinates(
  x: number, 
  y: number, 
  mappingTablePath: string, 
  rootDir: string
): ResolvedCoordinate | null {
  const mappingTable = JSON.parse(fs.readFileSync(mappingTablePath, "utf-8"));
  
  // 1. Find the file segment using X
  const entry = mappingTable.find((e: any) => x >= e.xr[0] && x <= e.xr[1]);
  if (!entry) return null;

  const absoluteFilePath = path.join(rootDir, entry.f);
  if (!fs.existsSync(absoluteFilePath)) return null;

  // 2. Estimate the line number from X (used as a fallback)
  const xInSlot = x - entry.xr[0];
  const slotWidth = entry.xr[1] - entry.xr[0] + 1;
  const maxLine = entry.ml || 1;

  const divisor = Math.max(1, slotWidth - 2);
  const estimatedLine = Math.floor((xInSlot / divisor) * maxLine);

  const hz = ((SPECTROGRAM_CONFIG.HEIGHT - 1 - y) / (SPECTROGRAM_CONFIG.HEIGHT - 1)) * SPECTROGRAM_CONFIG.MAX_HZ;

  // 3. Snap to the nearest known anomaly in *pixel space* — this is the
  //    inverse of the placement math in generator.ts (xOffset/y computation).
  //    Snapping in pixel space (not line space) matches how the user clicked
  //    and prevents drift to file-header lines when the slot is narrow.
  const anomalies: { l: number; h: number; t: string }[] = entry.an || [];
  let snappedLine: number | null = null;
  let detectedType = entry.t;
  const SNAP_PIXEL_RADIUS = 4; // ~4px tolerance for imprecise clicks
  let bestPixelDist = Infinity;

  for (const anomaly of anomalies) {
    const ax = entry.xr[0] + Math.floor((anomaly.l / maxLine) * divisor);
    const ay = SPECTROGRAM_CONFIG.HEIGHT - 1 - Math.floor((anomaly.h / SPECTROGRAM_CONFIG.MAX_HZ) * (SPECTROGRAM_CONFIG.HEIGHT - 1));
    const dx = ax - x;
    const dy = ay - y;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    if (pixelDist < bestPixelDist && pixelDist <= SNAP_PIXEL_RADIUS) {
      bestPixelDist = pixelDist;
      snappedLine = anomaly.l;
      detectedType = anomaly.t;
    }
  }

  if (snappedLine === null && hz >= HOLOGRAPHIC_LAYERS.ANOMALY.min) {
    detectedType = "Anomaly/Error";
  }

  const resolvedLine = snappedLine !== null ? snappedLine : estimatedLine;

  // 4. Extract JIT Context centered on the resolved line
  const content = fs.readFileSync(absoluteFilePath, "utf-8");
  const lines = content.split("\n");
  const totalLines = lines.length;
  const windowSize = SPECTROGRAM_CONFIG.CONTEXT_WINDOW;
  const startLine = Math.max(0, resolvedLine - Math.floor(windowSize / 2));
  const endLine = Math.min(totalLines, startLine + windowSize);

  const contextLines = lines.slice(startLine, endLine).map((line, i) => {
    const currentLineNum = startLine + i + 1;
    const marker = currentLineNum === resolvedLine + 1 ? "> " : "  ";
    return `${marker}${currentLineNum} | ${line}`;
  });

  const context = `
File: ${entry.f}
Line: ${resolvedLine + 1}
Type: ${detectedType}

\`\`\`typescript
${contextLines.join("\n")}
\`\`\`
`;

  return {
    file: entry.f,
    line: resolvedLine + 1,
    type: detectedType,
    context
  };
}
