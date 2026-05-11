import { PNG } from "pngjs";
import * as fs from "fs";
import * as path from "path";
import {
  SPECTROGRAM_CONFIG,
  HOLOGRAPHIC_LAYERS,
  ANOMALY_COLORS,
  ANOMALY_CATEGORIES,
} from "./constants";
import type { FileScanResult } from "./scanner";

export interface MappingAnomaly {
  l: number;        // line
  h: number;        // hz
  t: string;        // human-readable type (may include parameters)
  c: string;        // canonical category (keys ANOMALY_COLORS / SEVERITY tables)
  s: string;        // severity: "high" | "med" | "low"
}

export interface MappingEntry {
  xr: [number, number]; // x_range
  f: string;           // file
  t: string;           // type
  nc: number;          // nodeCount
  ml: number;          // maxLine
  an: MappingAnomaly[]; // anomalies
}

const LAYER_COLORS: Record<string, [number, number, number]> = {
  LOGIC:  [ 50, 255, 150],
  STYLES: [ 50, 200, 255],
  MARKUP: [255, 150,  50],
};

export async function generateProjectSpectrogram(results: FileScanResult[], outputDir: string) {
  const { WIDTH, HEIGHT, MAX_HZ } = SPECTROGRAM_CONFIG;
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  const mappingTable: MappingEntry[] = [];

  // Dark "Ambient" background
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 5;
    png.data[i + 1] = 5;
    png.data[i + 2] = 15;
    png.data[i + 3] = 255;
  }

  const totalFiles = results.length;
  if (totalFiles === 0) return { pngPath: "", tablePath: "", mappingTable: [] };

  const slotWidth = Math.floor(WIDTH / totalFiles);

  results.forEach((result, fileIdx) => {
    const xStart = fileIdx * slotWidth;
    const xEnd = (fileIdx + 1) * slotWidth - 1;

    const maxLine = Math.max(...result.nodes.map(n => n.line), 1);

    mappingTable.push({
      xr: [xStart, xEnd],
      f: result.fileName,
      t: result.layer,
      nc: result.nodes.length,
      ml: maxLine,
      an: Array.from(
        result.nodes
          .filter(n => n.isComplexityGrowl || n.anomalyType)
          .reduce((map, n) => {
            const type = n.anomalyType || (n.isComplexityGrowl ? ANOMALY_CATEGORIES.HIGH_COMPLEXITY : "Anomaly");
            const category = n.anomalyCategory || (n.isComplexityGrowl ? ANOMALY_CATEGORIES.HIGH_COMPLEXITY : "Anomaly");
            const sev = n.severity || "med";
            const key = `${n.line}-${type}`;
            if (!map.has(key)) {
              map.set(key, { l: n.line, h: n.hz, t: type, c: category, s: sev });
            }
            return map;
          }, new Map<string, MappingAnomaly>())
          .values()
      )
    });

    for (const node of result.nodes) {
      const divisor = Math.max(1, slotWidth - 2);
      const xOffset = Math.floor((node.line / maxLine) * divisor);
      const x = xStart + xOffset;
      const y = HEIGHT - 1 - Math.floor((node.hz / MAX_HZ) * (HEIGHT - 1));

      if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) continue;

      const idx = (WIDTH * y + x) << 2;

      // Color is a function of category (heatmap row identity), not layer alone.
      let color: [number, number, number];
      if (node.anomalyCategory && ANOMALY_COLORS[node.anomalyCategory]) {
        color = ANOMALY_COLORS[node.anomalyCategory]!;
      } else if (node.hz >= HOLOGRAPHIC_LAYERS.ANOMALY.min) {
        color = ANOMALY_COLORS[ANOMALY_CATEGORIES.HIGH_COMPLEXITY]!;
      } else {
        color = LAYER_COLORS[result.layer] ?? LAYER_COLORS.LOGIC!;
      }

      // Complexity growl spreads horizontally for visibility — preserved.
      if (node.isComplexityGrowl) {
        for (let sx = -2; sx <= 2; sx++) {
          const sidx = (WIDTH * y + (x + sx)) << 2;
          if (sidx >= 0 && sidx < png.data.length) {
            png.data[sidx] = Math.min(255, (png.data[sidx] ?? 0) + color[0] * node.amplitude);
            png.data[sidx + 1] = Math.min(255, (png.data[sidx + 1] ?? 0) + color[1] * 0.5 * node.amplitude);
          }
        }
      }

      png.data[idx] = Math.min(255, (png.data[idx] ?? 0) + color[0] * node.amplitude);
      png.data[idx + 1] = Math.min(255, (png.data[idx + 1] ?? 0) + color[1] * node.amplitude);
      png.data[idx + 2] = Math.min(255, (png.data[idx + 2] ?? 0) + color[2] * node.amplitude);
    }

    const silentX = xEnd + 1;
    if (silentX < WIDTH) {
      for (let sy = 0; sy < HEIGHT; sy++) {
        const sidx = (WIDTH * sy + silentX) << 2;
        png.data[sidx] = 0;
        png.data[sidx + 1] = 0;
        png.data[sidx + 2] = 0;
      }
    }
  });

  const pngPath = path.join(outputDir, "spectrogram.png");
  const tablePath = path.join(outputDir, "mapping_table.json");

  try {
    await new Promise<void>((resolve, reject) => {
      png.pack().pipe(fs.createWriteStream(pngPath)).on("finish", resolve).on("error", reject);
    });
    fs.writeFileSync(tablePath, JSON.stringify(mappingTable));
  } catch (err) {
    console.error(`💥 Disk Write Error: ${err}`);
    throw err;
  }

  return { pngPath, tablePath, mappingTable };
}
