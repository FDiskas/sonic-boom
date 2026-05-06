import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { scanDirectory } from "./scanner";
import { generateProjectSpectrogram } from "./generator";
import { resolveCoordinates } from "./resolver";

const server = new Server(
  {
    name: "sonic-code-sentinel",
    version: "1.0.0",
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
      case "get_project_spectrogram": {
        const rootDir = path.resolve(args?.directoryPath as string);

        // Ensure outputDir is distinct and excluded from future scans via .sonicignore if needed
        // For the MCP server, we'll use a local 'mcp_output' folder
        const outputDir = path.join(process.cwd(), "mcp_output");
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const results = scanDirectory(rootDir);
        const { pngPath, mappingTable } = await generateProjectSpectrogram(results, outputDir);

        if (!pngPath) {
          throw new Error("Failed to generate spectrogram: No files found.");
        }

        const pngBase64 = fs.readFileSync(pngPath).toString("base64");
        const nodeCount = results.reduce((acc, r) => acc + r.nodes.length, 0);

        return {
          content: [
            {
              type: "text",
              text: `🎵 Project Encoded. Scanned ${results.length} files (${nodeCount} nodes).`,
            },
            {
              type: "image",
              data: pngBase64,
              mimeType: "image/png"
            },
            {
              type: "text",
              text: `Mapping Table: ${JSON.stringify(mappingTable)}`
            }
          ],
        };
      }

      case "resolve_sonic_coordinates": {
        const { x, y, directoryPath } = args as { x: number; y: number; directoryPath: string };
        const mappingPath = path.join(process.cwd(), "mcp_output", "mapping_table.json");

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

      case "get_code_snippet": {
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

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // CRITICAL: Always use console.error for logs in an MCP stdio server
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

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🎵 Sonic Code Sentinel MCP Server running. Stdout is reserved for JSON-RPC.");
}

runServer().catch((error) => {
  console.error("💥 Fatal MCP Error:", error);
  process.exit(1);
});
