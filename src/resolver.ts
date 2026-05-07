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

  // 2. Estimate the line number
  const xInSlot = x - entry.xr[0];
  const slotWidth = entry.xr[1] - entry.xr[0] + 1;
  const maxLine = entry.ml || 1;
  
  const divisor = Math.max(1, slotWidth - 2);
  const estimatedLine = Math.floor((xInSlot / divisor) * maxLine);
  
  // 3. Refine using Y (Frequency) and Metadata
  const hz = ((SPECTROGRAM_CONFIG.HEIGHT - 1 - y) / (SPECTROGRAM_CONFIG.HEIGHT - 1)) * SPECTROGRAM_CONFIG.MAX_HZ;
  
  // Find the closest anomaly in this file to the estimated line and frequency
  const anomalies = entry.an || [];
  let detectedType = entry.t;
  let closestAnomaly = null;
  let minDistance = Infinity;

  for (const anomaly of anomalies) {
    const lineDist = Math.abs(anomaly.l - estimatedLine);
    const hzDist = Math.abs(anomaly.h - hz) / 100; // Normalize frequency distance
    const dist = Math.sqrt(lineDist * lineDist + hzDist * hzDist);
    
    if (dist < minDistance && dist < 50) { // Only snap if reasonably close
      minDistance = dist;
      closestAnomaly = anomaly;
    }
  }

  if (closestAnomaly) {
    detectedType = closestAnomaly.t;
  } else if (hz >= HOLOGRAPHIC_LAYERS.ANOMALY.min) {
    detectedType = "Anomaly/Error";
  }

  // 4. Extract JIT Context
  const content = fs.readFileSync(absoluteFilePath, "utf-8");
  const lines = content.split("\n");
  const totalLines = lines.length;
  const windowSize = SPECTROGRAM_CONFIG.CONTEXT_WINDOW;
  const startLine = Math.max(0, estimatedLine - Math.floor(windowSize / 2));
  const endLine = Math.min(totalLines, startLine + windowSize);
  
  const contextLines = lines.slice(startLine, endLine).map((line, i) => {
    const currentLineNum = startLine + i + 1;
    const marker = currentLineNum === estimatedLine + 1 ? "> " : "  ";
    return `${marker}${currentLineNum} | ${line}`;
  });

  const context = `
File: ${entry.f}
Line: ${estimatedLine + 1}
Type: ${detectedType}

\`\`\`typescript
${contextLines.join("\n")}
\`\`\`
`;

  return {
    file: entry.file,
    line: estimatedLine + 1,
    type: detectedType,
    context
  };
}
