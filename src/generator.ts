import { PNG } from "pngjs";
import * as fs from "fs";
import * as path from "path";
import {
  SPECTROGRAM_CONFIG,
  HOLOGRAPHIC_LAYERS,
  ANOMALY_COLORS,
  ANOMALY_CATEGORIES,
  ANOMALY_HZ_OFFSETS,
  ANOMALY_SHORT_CODE,
} from "./constants";
import { drawText, fillRect, setPixel } from "./png-text";
import type { FileScanResult } from "./scanner";

export interface MappingAnomaly {
  l: number;        // line
  h: number;        // hz
  t: string;        // human-readable type (may include parameters)
  c: string;        // canonical category (keys ANOMALY_COLORS / SEVERITY tables)
  s: string;        // severity: "high" | "med" | "low"
}

export interface MappingEntry {
  xr: [number, number]; // x_range (absolute PNG coords, inside the plot area)
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

const TEXT_COLOR: [number, number, number] = [220, 220, 220];
const AXIS_COLOR: [number, number, number] = [120, 120, 140];
const BORDER_COLOR: [number, number, number] = [80, 80, 100];

// Plot Y = TOP + (PLOT_HEIGHT - 1) - floor((hz / MAX_HZ) * (PLOT_HEIGHT - 1)).
// Keeping this in one place: resolver mirrors the inverse.
function hzToY(hz: number, plotHeight: number, plotTop: number, maxHz: number): number {
  return plotTop + (plotHeight - 1) - Math.floor((hz / maxHz) * (plotHeight - 1));
}

export async function generateProjectSpectrogram(results: FileScanResult[], outputDir: string) {
  const {
    WIDTH, HEIGHT, MAX_HZ,
    PLOT_LEFT, PLOT_TOP, PLOT_RIGHT_MARGIN, PLOT_BOTTOM_MARGIN,
  } = SPECTROGRAM_CONFIG;

  const plotWidth = WIDTH - PLOT_LEFT - PLOT_RIGHT_MARGIN;
  const plotHeight = HEIGHT - PLOT_TOP - PLOT_BOTTOM_MARGIN;
  const plotRight = PLOT_LEFT + plotWidth - 1;
  const plotBottom = PLOT_TOP + plotHeight - 1;

  const png = new PNG({ width: WIDTH, height: HEIGHT });
  const mappingTable: MappingEntry[] = [];

  // Dark "Ambient" background (whole image — plot area pixels will be drawn over).
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 5;
    png.data[i + 1] = 5;
    png.data[i + 2] = 15;
    png.data[i + 3] = 255;
  }

  const totalFiles = results.length;
  if (totalFiles === 0) return { pngPath: "", tablePath: "", mappingTable: [] };

  const slotWidth = Math.floor(plotWidth / totalFiles);

  results.forEach((result, fileIdx) => {
    const xStart = PLOT_LEFT + fileIdx * slotWidth;
    const xEnd = PLOT_LEFT + (fileIdx + 1) * slotWidth - 1;

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
      const y = hzToY(node.hz, plotHeight, PLOT_TOP, MAX_HZ);

      if (x < PLOT_LEFT || x > plotRight || y < PLOT_TOP || y > plotBottom) continue;

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
          const sxAbs = x + sx;
          if (sxAbs < PLOT_LEFT || sxAbs > plotRight) continue;
          const sidx = (WIDTH * y + sxAbs) << 2;
          png.data[sidx] = Math.min(255, (png.data[sidx] ?? 0) + color[0] * node.amplitude);
          png.data[sidx + 1] = Math.min(255, (png.data[sidx + 1] ?? 0) + color[1] * 0.5 * node.amplitude);
        }
      }

      png.data[idx] = Math.min(255, (png.data[idx] ?? 0) + color[0] * node.amplitude);
      png.data[idx + 1] = Math.min(255, (png.data[idx + 1] ?? 0) + color[1] * node.amplitude);
      png.data[idx + 2] = Math.min(255, (png.data[idx + 2] ?? 0) + color[2] * node.amplitude);
    }

    // Thin separator between slots — only inside the plot area.
    const silentX = xEnd + 1;
    if (silentX <= plotRight) {
      for (let sy = PLOT_TOP; sy <= plotBottom; sy++) {
        setPixel(png, silentX, sy, [0, 0, 0]);
      }
    }
  });

  // ── In-image legend, axes, and ticks ───────────────────────────────────────
  // Vision-readable references baked into the PNG so a model can act on the
  // image without consulting an external mapping file.
  drawLegendStrip(png, plotHeight, PLOT_TOP, MAX_HZ);
  drawTopBanner(png, PLOT_LEFT, plotWidth, totalFiles);
  drawFileIndexAxis(png, results, slotWidth, PLOT_LEFT, plotBottom);
  drawPlotBorder(png, PLOT_LEFT, PLOT_TOP, plotWidth, plotHeight);

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

// Left margin: each row sits at exactly the Y position where that category's
// anomalies are drawn in the plot, so the AI can trace a pixel horizontally
// to the legend swatch + code without external reference.
function drawLegendStrip(
  png: PNG,
  plotHeight: number,
  plotTop: number,
  maxHz: number,
): void {
  const { ANOMALY: anomalyBand } = HOLOGRAPHIC_LAYERS;
  const swatchW = 14;
  const swatchH = 10;
  const swatchX = 8;
  const textX = swatchX + swatchW + 4;

  // Categories sorted by Hz so legend reads top-to-bottom matching the plot.
  const categories = Object.entries(ANOMALY_HZ_OFFSETS)
    .sort(([, a], [, b]) => b - a); // higher Hz = higher in image = top of legend

  for (const [category, offset] of categories) {
    const hz = anomalyBand.min + offset;
    const y = hzToY(hz, plotHeight, plotTop, maxHz);
    const color = ANOMALY_COLORS[category] ?? [200, 200, 200];
    const code = ANOMALY_SHORT_CODE[category] ?? category;

    fillRect(png, swatchX, y - Math.floor(swatchH / 2), swatchW, swatchH, color);
    drawText(png, textX, y - 3, code, TEXT_COLOR, 1);
  }
}

// Top banner: a single scale=2 label naming the axis so the AI knows the
// X-axis encodes file slots and the Y-axis encodes category.
function drawTopBanner(
  png: PNG,
  plotLeft: number,
  plotWidth: number,
  totalFiles: number,
): void {
  drawText(png, plotLeft, 4, `FILES:${totalFiles}  X=FILE_SLOT  Y=CATEGORY`, TEXT_COLOR, 1);
  // Thin axis line just below the banner, above the plot.
  for (let x = plotLeft; x < plotLeft + plotWidth; x++) {
    setPixel(png, x, 14, AXIS_COLOR);
  }
}

// Bottom margin: tick + file-index number every Nth slot. Stride chosen so
// labels never overlap. The AI reads "anomaly cluster around tick F12" then
// looks up F12 in the text-response file-index table.
function drawFileIndexAxis(
  png: PNG,
  results: FileScanResult[],
  slotWidth: number,
  plotLeft: number,
  plotBottom: number,
): void {
  const totalFiles = results.length;
  const labelWidth = 4 * (5 + 1); // up to 3 digits + 'F'
  const minSpacing = labelWidth + 6;
  const stride = Math.max(1, Math.ceil(minSpacing / Math.max(slotWidth, 1)));

  const axisY = plotBottom + 1;
  for (let x = plotLeft; x < plotLeft + slotWidth * totalFiles; x++) {
    setPixel(png, x, axisY, AXIS_COLOR);
  }

  for (let i = 0; i < totalFiles; i += stride) {
    const xCenter = plotLeft + i * slotWidth + Math.floor(slotWidth / 2);
    // Tick mark
    for (let dy = 1; dy <= 4; dy++) setPixel(png, xCenter, axisY + dy, AXIS_COLOR);
    drawText(png, xCenter - 6, axisY + 6, `F${i}`, TEXT_COLOR, 1);
  }
}

// Thin border around the plot area — gives the AI a clear visual frame.
function drawPlotBorder(
  png: PNG,
  plotLeft: number,
  plotTop: number,
  plotWidth: number,
  plotHeight: number,
): void {
  const right = plotLeft + plotWidth - 1;
  const bottom = plotTop + plotHeight - 1;
  for (let x = plotLeft; x <= right; x++) {
    setPixel(png, x, plotTop, BORDER_COLOR);
    setPixel(png, x, bottom, BORDER_COLOR);
  }
  for (let y = plotTop; y <= bottom; y++) {
    setPixel(png, plotLeft, y, BORDER_COLOR);
    setPixel(png, right, y, BORDER_COLOR);
  }
}
