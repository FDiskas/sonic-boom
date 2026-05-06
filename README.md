# 📡 Sonic Code Sentinel (sonic-boom)

**Sonic Code Sentinel** is a revolutionary Multimodal Code Diagnostic tool that bypasses LLM token limits by encoding massive TypeScript/JavaScript codebases into high-density **Audio Spectrogram PNGs**. 

Instead of reading raw text, this system allows Vision-capable AI models (like Gemini 1.5 Pro) to diagnose system errors, architectural debt, and "auditory anomalies" by interpreting the visual patterns of code logic.

## 🎵 The "Sonic Code" Paradigm

The codebase is mapped onto a 2D frequency spectrum:
- **X-Axis**: Temporal sequence of the codebase (File/Line flow).
- **Y-Axis**: Frequency spectrum (20Hz – 20kHz) partitioned into **Holographic Layers**:
    - **20Hz - 8kHz**: Core Logic (.ts, .tsx, .js).
    - **8kHz - 12kHz**: Styles (.css, .scss).
    - **12kHz - 16kHz**: Assets & Markup (.svg, .html).
    - **16kHz - 20kHz**: **The Anomaly Zone** (Bugs, `any` types, Circular dependencies).
- **Amplitude (Brightness)**: Represents nesting depth and cyclomatic complexity.

### 🔊 Visual Anomalies
- **The Shriek**: A sharp Magenta spike in the 16kHz+ zone indicates a high-risk "any" type or unhandled exception.
- **The Growl**: A wide Red gradient indicates a "Complexity Growl"—functions with deep nesting or high cyclomatic complexity (> 5).

---

## 🚀 Getting Started

### Prerequisites
- [Bun](https://bun.sh) (v1.1+ recommended)

### Installation
```bash
bun install
```

### Usage
Analyze any local directory and generate a diagnostic spectrogram:

```bash
# Analyze a specific project
bun run src/index.ts ../path/to/your-project

# Exclude specific patterns (e.g., generated files or tests)
bun run src/index.ts ../path/to/your-project --exclude "**/generated/**" -e "*.test.ts"
```

## 📂 Output
The tool generates a diagnostic bundle in the `./output` directory:
- **`spectrogram.png`**: The visual representation of your codebase.
- **`mapping_table.json`**: A coordinate lookup table that maps X-axis pixels back to specific files and metadata.

## 🛡️ Features
- **Universal Ignore Engine**: Automatically respects `.gitignore`, `.dockerignore`, and `.sonicignore`.
- **Holographic Partitioning**: Prevents frequency bleeding between different file types (Logic vs. Styles).
- **Virtual File Slots**: Each file occupies a discrete "Time Slot" on the X-axis, separated by black "Silent Frames".
- **AST-Aware**: Uses the TypeScript Compiler API for deep structural analysis.

---

## 🛠️ Project Structure
- `src/scanner.ts`: AST traversal and frequency modulation logic.
- `src/generator.ts`: PNG rendering engine and mapping table exporter.
- `src/constants.ts`: Frequency ranges and complexity thresholds.
- `src/index.ts`: CLI entry point and ignore-file integration.

**Sonic Code Sentinel** — *Hear the code. See the bugs.*
