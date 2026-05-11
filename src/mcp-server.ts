#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { scanDirectory } from "./scanner";
import { generateProjectSpectrogram } from "./generator";
import { resolveCoordinates } from "./resolver";

const pkgPath = path.join(import.meta.dirname, "../package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`🎵 Sonic Code Sentinel MCP Server v${pkg.version}`);
  console.log("\nUsage:");
  console.log("  npx sonic-boom-mcp");
  console.log("\nThis is an MCP server and should be configured in your MCP client (e.g., Claude Desktop).");
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(`v${pkg.version}`);
  process.exit(0);
}

const DATA_DIR = path.join(os.tmpdir(), "sonic-boom-mcp");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const server = new Server(
  {
    name: "sonic-code-sentinel",
    version: pkg.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_project_spectrogram",
        description: "CRITICAL: Call this tool FIRST for any project-wide analysis. It visualizes the entire codebase as a spectrogram to find bugs efficiently.",
        inputSchema: {
          type: "object",
          properties: {
            directoryPath: {
              type: "string",
              description: "The absolute path to the project directory to scan.",
            },
          },
          required: ["directoryPath"],
        },
      },
      {
        name: "resolve_sonic_coordinates",
        description: "Mandatory step to translate visual spectrogram anomalies (X, Y) into a precise file and line number. NEVER guess the file from the mapping table manually.",
        inputSchema: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            directoryPath: {
              type: "string",
              description: "The project directory (where the scan was performed)."
            },
          },
          required: ["x", "y", "directoryPath"],
        },
      },
      {
        name: "get_code_snippet",
        description: "CRITICAL: Use this ONLY after identifying an anomaly via spectrogram. It fetches the exact 20-line context window. DO NOT use standard read_file for large projects to avoid token overflow.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Relative path to the file." },
            lineNumber: { type: "number" },
            directoryPath: { type: "string", description: "The project root directory." },
          },
          required: ["filePath", "lineNumber", "directoryPath"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_project_spectrogram":
        return await handleGetProjectSpectrogram(args);
      case "resolve_sonic_coordinates":
        return await handleResolveCoordinates(args);
      case "get_code_snippet":
        return await handleGetCodeSnippet(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`💥 Tool Error [${name}]:`, error);
    return {
      content: [
        {
          type: "text",
          text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function handleGetProjectSpectrogram(args: any) {
  const rootDir = path.resolve(args?.directoryPath as string);
  const results = scanDirectory(rootDir);
  const { pngPath, mappingTable } = await generateProjectSpectrogram(results, DATA_DIR);

  if (!pngPath) {
    throw new Error("Failed to generate spectrogram: No files found.");
  }

  const pngBase64 = fs.readFileSync(pngPath).toString("base64");
  const nodeCount = results.reduce((acc, r) => acc + r.nodes.length, 0);

  const SEV_RANK: Record<string, number> = { high: 3, med: 2, low: 1 };
  const anomalyFiles = results
    .map(r => {
      const findings = r.nodes.filter(n => n.anomalyType || n.isComplexityGrowl);
      if (findings.length === 0) return null;
      const top = findings.reduce<string>((acc, n) => {
        const s = n.severity ?? "med";
        return (SEV_RANK[s] ?? 0) > (SEV_RANK[acc] ?? 0) ? s : acc;
      }, "low");
      const uniqueTypes = Array.from(new Set(findings.map(n => n.anomalyType ?? "High Complexity")));
      return { file: r.fileName, severity: top, types: uniqueTypes, count: findings.length };
    })
    .filter((x): x is { file: string; severity: string; types: string[]; count: number } => x !== null)
    .sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0) || b.count - a.count);

  const anomalySummary = anomalyFiles.slice(0, 10)
    .map(a => `- [${a.severity.toUpperCase()}] ${a.file} (${a.types.join(", ")})`)
    .join("\n");

  return {
    content: [
      {
        type: "text",
        text: `🎵 Project Encoded. Scanned ${results.length} files (${nodeCount} nodes).\n\n` +
          `### 🕵️ Anomaly Summary (Top 10, by severity):\n${anomalySummary || "No major anomalies detected."}\n\n` +
          `### 🎨 Spectrogram Legend (deterministic heatmap — same code → same image):\n` +
          `Y-axis bands inside the ANOMALY region (top of image) each correspond to ONE concern.\n` +
          `Brightness = severity (high/med/low). Color encodes the category:\n` +
          `- **White**: Layer Violation (high)\n` +
          `- **Bright Red**: Empty catch block (high)\n` +
          `- **Light Red**: Explicit \`: any\` type (med)\n` +
          `- **Purple**: Heavy library import — moment/lodash/jquery (med)\n` +
          `- **Orange**: Prop Overload >7 props (high)\n` +
          `- **Amber**: High Complexity — cc included in label (med, high if cc>=20)\n` +
          `- **Gold**: Massive Component >250 lines (high)\n` +
          `- **Dim Yellow**: Heavy Barrel Export >10 (med)\n` +
          `- **Sky Blue**: Z-Index Escalation (med)\n` +
          `- **Cyan**: Tailwind Magic Value (low)\n` +
          `- **Bright Yellow**: Unresolved TODO/FIXME (med)\n` +
          `- **Grey**: Commented-out Code Block (med)\n` +
          `- **Dim Blue-Grey**: Missing Test File (low)\n` +
          `Below ANOMALY: green/blue/orange = Logic/Styles/Markup structural pixels.\n\n` +
          `**NOTE**: The mapping table is stored locally. Use 'resolve_sonic_coordinates' with (x, y) to inspect specific points.`
      },
      {
        type: "image",
        data: pngBase64,
        mimeType: "image/png"
      }
    ],
  };
}

async function handleResolveCoordinates(args: any) {
  const { x, y, directoryPath } = args as { x: number; y: number; directoryPath: string };
  const mappingPath = path.join(DATA_DIR, "mapping_table.json");

  const resolution = resolveCoordinates(x, y, mappingPath, path.resolve(directoryPath));

  if (!resolution) {
    throw new Error("Could not resolve coordinates.");
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(resolution),
      },
    ],
  };
}

async function handleGetCodeSnippet(args: any) {
  const { filePath, lineNumber, directoryPath } = args as { filePath: string; lineNumber: number; directoryPath: string };
  const absPath = path.join(path.resolve(directoryPath), filePath);

  if (!fs.existsSync(absPath)) throw new Error(`File not found: ${filePath}`);

  const lines = fs.readFileSync(absPath, "utf-8").split("\n");
  const start = Math.max(0, lineNumber - 10);
  const end = Math.min(lines.length, start + 20);
  const snippet = lines.slice(start, end).map((l, i) => `${start + i + 1} | ${l}`).join("\n");

  return {
    content: [
      {
        type: "text",
        text: `\`\`\`typescript\n// ${filePath}\n${snippet}\n\`\`\``,
      },
    ],
  };
}

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🎵 Sonic Code Sentinel MCP Server running. Stdout is reserved for JSON-RPC.");
}

runServer().catch((error) => {
  console.error("💥 Fatal MCP Error:", error);
  process.exit(1);
});
