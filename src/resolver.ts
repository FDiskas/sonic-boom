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
  const entry = mappingTable.find((e: any) => x >= e.x_range[0] && x <= e.x_range[1]);
  if (!entry) return null;

  const absoluteFilePath = path.join(rootDir, entry.file);
  if (!fs.existsSync(absoluteFilePath)) return null;

  // 2. Estimate the line number
  // Since we map lines linearly to X within the slot:
  const xInSlot = x - entry.x_range[0];
  const slotWidth = entry.x_range[1] - entry.x_range[0] + 1;
  const maxLine = (entry.metadata as any).maxLine || 1;
  
  // Safeguard against division by zero for very narrow slots
  const divisor = Math.max(1, slotWidth - 2);
  const estimatedLine = Math.floor((xInSlot / divisor) * maxLine);
  
  // 3. Refine using Y (Frequency)
  const hz = ((SPECTROGRAM_CONFIG.HEIGHT - 1 - y) / (SPECTROGRAM_CONFIG.HEIGHT - 1)) * SPECTROGRAM_CONFIG.MAX_HZ;
  
  // Check if it's an Anomaly or a specific logic type
  let detectedType = "Unknown";
  if (hz >= HOLOGRAPHIC_LAYERS.ANOMALY.min) {
    detectedType = "Anomaly/Error";
  } else {
    detectedType = entry.metadata.type;
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
File: ${entry.file}
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
