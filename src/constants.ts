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

// Canonical anomaly categories. Stable strings used as keys for color, Hz,
// and severity lookup — the spectrogram is a deterministic function of these.
export const ANOMALY_CATEGORIES = {
  EMPTY_CATCH: "Empty catch block",
  LAYER_VIOLATION: "Layer Violation",
  EXPLICIT_ANY: "Explicit 'any' type",
  HEAVY_LIBRARY: "Heavy Library Import",
  PROP_OVERLOAD: "Prop Overload",
  HIGH_COMPLEXITY: "High Complexity",
  MASSIVE_COMPONENT: "Massive Component",
  HEAVY_BARREL: "Heavy Barrel Export",
  Z_INDEX: "Z-Index Escalation",
  MAGIC_VALUE: "Tailwind Magic Value",
  TODO: "Unresolved TODO/FIXME",
  COMMENTED_CODE: "Commented-out Code Block",
  MISSING_TEST: "Missing Test File",
} as const;

export type AnomalyCategory = typeof ANOMALY_CATEGORIES[keyof typeof ANOMALY_CATEGORIES];
export type Severity = "high" | "med" | "low";

// Each category gets its own Hz row inside the ANOMALY band (16000-20000)
// so the spectrogram reads as a heatmap: row = concern, brightness = severity.
export const ANOMALY_HZ_OFFSETS: Record<string, number> = {
  [ANOMALY_CATEGORIES.EMPTY_CATCH]:        200,
  [ANOMALY_CATEGORIES.LAYER_VIOLATION]:    500,
  [ANOMALY_CATEGORIES.EXPLICIT_ANY]:       800,
  [ANOMALY_CATEGORIES.HEAVY_LIBRARY]:     1100,
  [ANOMALY_CATEGORIES.PROP_OVERLOAD]:     1400,
  [ANOMALY_CATEGORIES.HIGH_COMPLEXITY]:   1700,
  [ANOMALY_CATEGORIES.MASSIVE_COMPONENT]: 2000,
  [ANOMALY_CATEGORIES.HEAVY_BARREL]:      2300,
  [ANOMALY_CATEGORIES.Z_INDEX]:           2600,
  [ANOMALY_CATEGORIES.MAGIC_VALUE]:       2900,
  [ANOMALY_CATEGORIES.TODO]:              3200,
  [ANOMALY_CATEGORIES.COMMENTED_CODE]:    3500,
  [ANOMALY_CATEGORIES.MISSING_TEST]:      3800,
};

// RGB triples — additive on a near-black background. Each category is a
// visually distinct hue so a glance at the image identifies the concern.
export const ANOMALY_COLORS: Record<string, [number, number, number]> = {
  [ANOMALY_CATEGORIES.EMPTY_CATCH]:        [255,  40,  40],
  [ANOMALY_CATEGORIES.LAYER_VIOLATION]:    [255, 255, 255],
  [ANOMALY_CATEGORIES.EXPLICIT_ANY]:       [255, 100, 100],
  [ANOMALY_CATEGORIES.HEAVY_LIBRARY]:      [180,  80, 220],
  [ANOMALY_CATEGORIES.PROP_OVERLOAD]:      [255, 120,  60],
  [ANOMALY_CATEGORIES.HIGH_COMPLEXITY]:    [255, 180,   0],
  [ANOMALY_CATEGORIES.MASSIVE_COMPONENT]:  [255, 200,  80],
  [ANOMALY_CATEGORIES.HEAVY_BARREL]:       [200, 200,  80],
  [ANOMALY_CATEGORIES.Z_INDEX]:            [120, 220, 255],
  [ANOMALY_CATEGORIES.MAGIC_VALUE]:        [ 80, 230, 255],
  [ANOMALY_CATEGORIES.TODO]:               [255, 255, 100],
  [ANOMALY_CATEGORIES.COMMENTED_CODE]:     [150, 150, 150],
  [ANOMALY_CATEGORIES.MISSING_TEST]:       [100, 100, 130],
};

export const ANOMALY_SEVERITY: Record<string, Severity> = {
  [ANOMALY_CATEGORIES.EMPTY_CATCH]:        "high",
  [ANOMALY_CATEGORIES.LAYER_VIOLATION]:    "high",
  [ANOMALY_CATEGORIES.MASSIVE_COMPONENT]:  "high",
  [ANOMALY_CATEGORIES.PROP_OVERLOAD]:      "high",
  [ANOMALY_CATEGORIES.EXPLICIT_ANY]:       "med",
  [ANOMALY_CATEGORIES.HEAVY_LIBRARY]:      "med",
  [ANOMALY_CATEGORIES.HIGH_COMPLEXITY]:    "med",
  [ANOMALY_CATEGORIES.HEAVY_BARREL]:       "med",
  [ANOMALY_CATEGORIES.COMMENTED_CODE]:     "med",
  [ANOMALY_CATEGORIES.Z_INDEX]:            "med",
  [ANOMALY_CATEGORIES.TODO]:               "med",
  [ANOMALY_CATEGORIES.MAGIC_VALUE]:        "low",
  [ANOMALY_CATEGORIES.MISSING_TEST]:       "low",
};

export const SEVERITY_AMPLITUDE: Record<Severity, number> = {
  high: 1.0,
  med:  0.75,
  low:  0.5,
};

export const SPECTROGRAM_CONFIG = {
  WIDTH: 2048,
  HEIGHT: 1024,
  MAX_HZ: 20000,
  MIN_HZ: 20,
  COMPLEXITY_THRESHOLD: 5,
  COMPLEXITY_HIGH_SEVERITY: 20,
  NESTING_THRESHOLD: 5,
  CONTEXT_WINDOW: 20, // lines
  MAX_COMPONENT_LINES: 250,
  MAX_PROP_DRILLING: 4,
  MAX_Z_INDEX: 1000,
  SNAP_PIXEL_RADIUS: 12,
  HEAVY_LIBRARIES: ["moment", "lodash", "jquery"],
};
