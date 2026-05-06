import { PNG } from "pngjs";
import * as fs from "fs";
import * as path from "path";
import { SPECTROGRAM_CONFIG, HOLOGRAPHIC_LAYERS } from "./constants";
import { FileScanResult } from "./scanner";

export interface MappingEntry {
  x_range: [number, number];
  file: string;
  metadata: {
    type: string;
    nodeCount: number;
  };
}

export async function generateProjectSpectrogram(results: FileScanResult[], outputDir: string) {
  const { WIDTH, HEIGHT, MAX_HZ } = SPECTROGRAM_CONFIG;
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  const mappingTable: MappingEntry[] = [];

  // Dark "Ambient" background
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 5;
    png.data[i+1] = 5;
    png.data[i+2] = 15;
    png.data[i+3] = 255;
  }

  const totalFiles = results.length;
  if (totalFiles === 0) return;

  const slotWidth = Math.floor(WIDTH / totalFiles);

  results.forEach((result, fileIdx) => {
    const xStart = fileIdx * slotWidth;
    const xEnd = (fileIdx + 1) * slotWidth - 1; // Leave 1px for Silent Frame
    
    mappingTable.push({
      x_range: [xStart, xEnd],
      file: result.fileName,
      metadata: {
        type: result.layer,
        nodeCount: result.nodes.length
      }
    });

    const maxLine = Math.max(...result.nodes.map(n => n.line), 1);

    for (const node of result.nodes) {
      // Map Line to X within the slot
      const xOffset = Math.floor((node.line / maxLine) * (slotWidth - 2));
      const x = xStart + xOffset;
      
      const y = HEIGHT - 1 - Math.floor((node.hz / MAX_HZ) * (HEIGHT - 1));

      if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) continue;

      const idx = (WIDTH * y + x) << 2;

      let r = 0, g = 0, b = 0;

      if (node.isComplexityGrowl) {
        // Complexity Growl: Wide Red Gradient
        r = 255; g = 30; b = 30;
        // Spread the growl slightly on X
        for (let sx = -2; sx <= 2; sx++) {
            const sidx = (WIDTH * y + (x + sx)) << 2;
            if (sidx >= 0 && sidx < png.data.length) {
                png.data[sidx] = Math.min(255, png.data[sidx] + 150 * node.amplitude);
            }
        }
      } else if (node.hz >= HOLOGRAPHIC_LAYERS.ANOMALY.min) {
        r = 255; g = 0; b = 255; // Anomaly Magenta
      } else if (result.layer === 'STYLES') {
        r = 50; g = 200; b = 255; // Style Cyan
      } else if (result.layer === 'MARKUP') {
        r = 255; g = 150; b = 50; // Markup Orange
      } else {
        r = 50; g = 255; b = 150; // Logic Green
      }

      png.data[idx] = Math.min(255, png.data[idx] + r * node.amplitude);
      png.data[idx + 1] = Math.min(255, png.data[idx + 1] + g * node.amplitude);
      png.data[idx + 2] = Math.min(255, png.data[idx + 2] + b * node.amplitude);
    }

    // Draw Silent Frame (Black vertical line)
    const silentX = xEnd + 1;
    if (silentX < WIDTH) {
      for (let sy = 0; sy < HEIGHT; sy++) {
        const sidx = (WIDTH * sy + silentX) << 2;
        png.data[sidx] = 0;
        png.data[sidx+1] = 0;
        png.data[sidx+2] = 0;
      }
    }
  });

  // Save PNG
  const pngPath = path.join(outputDir, "spectrogram.png");
  await new Promise<void>((resolve, reject) => {
    png.pack().pipe(fs.createWriteStream(pngPath)).on("finish", resolve).on("error", reject);
  });

  // Save Mapping Table
  const tablePath = path.join(outputDir, "mapping_table.json");
  fs.writeFileSync(tablePath, JSON.stringify(mappingTable, null, 2));

  // Redirect status updates to stderr to keep stdout clean for JSON-RPC
  console.error(`✨ Project Spectrogram generated at: ${pngPath}`);
  console.error(`📋 Mapping Table saved at: ${tablePath}`);
}
