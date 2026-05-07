export const HOLOGRAPHIC_LAYERS = {
  LOGIC: { min: 20, max: 8000, extensions: [".ts", ".tsx", ".js", ".jsx"] },
  STYLES: { min: 8000, max: 12000, extensions: [".css", ".scss", ".less"] },
  MARKUP: { min: 12000, max: 16000, extensions: [".svg", ".html", ".md"] },
  ANOMALY: { min: 16000, max: 20000 },
};

// Precise Hz Offsets for JIT Resolution within the Logic Layer
export const NODE_TYPE_OFFSETS: Record<string, number> = {
  "ImportDeclaration": 100,
  "VariableDeclaration": 500,
  "FunctionDeclaration": 1000,
  "ArrowFunction": 1200,
  "ClassDeclaration": 1500,
  "IfStatement": 2000,
  "SwitchStatement": 2500,
  "BinaryExpression": 3000,
  "CallExpression": 3500,
  "JsxElement": 4000,
  "JsxAttribute": 4200,
  "InterfaceDeclaration": 5000,
  "TypeAliasDeclaration": 5500,
  "CommentLine": 7000,
};

export const SPECTROGRAM_CONFIG = {
  WIDTH: 2048, 
  HEIGHT: 1024,
  MAX_HZ: 20000,
  MIN_HZ: 20,
  COMPLEXITY_THRESHOLD: 5,
  NESTING_THRESHOLD: 5,
  CONTEXT_WINDOW: 20, // lines
  MAX_COMPONENT_LINES: 250,
  MAX_PROP_DRILLING: 4,
  MAX_Z_INDEX: 1000,
  HEAVY_LIBRARIES: ["moment", "lodash", "jquery"],
};
