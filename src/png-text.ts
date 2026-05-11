// Minimal 5x7 bitmap font + PNG drawing helpers. No external deps.
// We render directly into a pngjs RGBA buffer so the spectrogram can carry
// its own axes/legend/labels — making the image "self-decoding" without a
// separate mapping file.

import type { PNG } from "pngjs";

export type RGB = [number, number, number];

// Each glyph is 7 rows of 5 columns. '#' = lit pixel, ' ' = empty.
// Uppercase only (we uppercase labels) + digits + a few separators.
const GLYPHS: Record<string, string[]> = {
  "A": [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  "B": ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
  "C": [" ####", "#    ", "#    ", "#    ", "#    ", "#    ", " ####"],
  "D": ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
  "E": ["#####", "#    ", "#    ", "###  ", "#    ", "#    ", "#####"],
  "F": ["#####", "#    ", "#    ", "###  ", "#    ", "#    ", "#    "],
  "G": [" ####", "#    ", "#    ", "#  ##", "#   #", "#   #", " ####"],
  "H": ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  "I": ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
  "J": ["#####", "    #", "    #", "    #", "    #", "#   #", " ### "],
  "K": ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
  "L": ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
  "M": ["#   #", "## ##", "# # #", "#   #", "#   #", "#   #", "#   #"],
  "N": ["#   #", "##  #", "# # #", "#  ##", "#   #", "#   #", "#   #"],
  "O": [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  "P": ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  "Q": [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
  "R": ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  "S": [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
  "T": ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  "U": ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  "V": ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
  "W": ["#   #", "#   #", "#   #", "#   #", "# # #", "## ##", "#   #"],
  "X": ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
  "Y": ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
  "Z": ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
  "0": [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
  "1": ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
  "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
  "3": [" ### ", "#   #", "    #", "  ## ", "    #", "#   #", " ### "],
  "4": ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
  "5": ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
  "6": [" ### ", "#    ", "#    ", "#### ", "#   #", "#   #", " ### "],
  "7": ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
  "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
  "9": [" ### ", "#   #", "#   #", " ####", "    #", "    #", " ### "],
  "_": ["     ", "     ", "     ", "     ", "     ", "     ", "#####"],
  "-": ["     ", "     ", "     ", "#####", "     ", "     ", "     "],
  ":": ["     ", "  #  ", "  #  ", "     ", "  #  ", "  #  ", "     "],
  ".": ["     ", "     ", "     ", "     ", "     ", "     ", "  #  "],
  "/": ["    #", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "],
  "|": ["  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  " ": ["     ", "     ", "     ", "     ", "     ", "     ", "     "],
};

const GLYPH_W = 5;
const GLYPH_H = 7;
const KERNING = 1; // pixels between chars

export function setPixel(png: PNG, x: number, y: number, color: RGB): void {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = color[0];
  png.data[idx + 1] = color[1];
  png.data[idx + 2] = color[2];
  png.data[idx + 3] = 255;
}

export function fillRect(png: PNG, x: number, y: number, w: number, h: number, color: RGB): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(png, x + dx, y + dy, color);
    }
  }
}

// Draw text at (x, y) (top-left), upscaled by `scale`. Returns the width in
// pixels of what was drawn, so callers can chain labels.
export function drawText(png: PNG, x: number, y: number, text: string, color: RGB, scale = 1): number {
  const upper = text.toUpperCase();
  let cursor = x;
  for (const ch of upper) {
    const glyph = GLYPHS[ch] ?? GLYPHS[" "]!;
    for (let row = 0; row < GLYPH_H; row++) {
      const line = glyph[row]!;
      for (let col = 0; col < GLYPH_W; col++) {
        if (line[col] === "#") {
          fillRect(png, cursor + col * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cursor += (GLYPH_W + KERNING) * scale;
  }
  return cursor - x;
}

export function textWidth(text: string, scale = 1): number {
  return text.length * (GLYPH_W + KERNING) * scale - KERNING * scale;
}

export const TEXT_HEIGHT = GLYPH_H; // unscaled
