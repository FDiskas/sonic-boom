export const HOLOGRAPHIC_LAYERS = {
  LOGIC: { min: 20, max: 8000, extensions: [".ts", ".tsx", ".js", ".jsx"] },
  STYLES: { min: 8000, max: 12000, extensions: [".css", ".scss", ".less"] },
  MARKUP: { min: 12000, max: 16000, extensions: [".svg", ".html", ".md"] },
  ANOMALY: { min: 16000, max: 20000 },
};

export const FREQUENCY_MAP = {
  INFRASTRUCTURE: { min: 0, max: 0.1 },     // Percentages within the layer's range
  STRUCTURAL_HOOKS: { min: 0.1, max: 0.3 },
  LOGIC_FLOW: { min: 0.3, max: 0.6 },
  DATA_OPS: { min: 0.6, max: 0.9 },
  UI_JSX: { min: 0.9, max: 1.0 },
};

export const SPECTROGRAM_CONFIG = {
  WIDTH: 2048, 
  HEIGHT: 1024,
  MAX_HZ: 20000,
  MIN_HZ: 20,
  COMPLEXITY_THRESHOLD: 5,
  NESTING_THRESHOLD: 5,
};
