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

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_project_spectrogram",
        description: "Encodes a project directory into a Sonic Spectrogram PNG. Returns base64 image and mapping table.",
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
        description: "Resolves visual (x, y) coordinates from a spectrogram to a specific file and line number.",
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
        description: "Retrieves a JIT context window around a specific line in a file.",
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

/**
 * Handle tool execution
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_project_spectrogram": {
        const rootDir = path.resolve(args?.directoryPath as string);
        const outputDir = path.join(process.cwd(), "output");
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const results = scanDirectory(rootDir);
        await generateProjectSpectrogram(results, outputDir);

        const pngPath = path.join(outputDir, "spectrogram.png");
        const mappingPath = path.join(outputDir, "mapping_table.json");

        const pngBase64 = fs.readFileSync(pngPath).toString("base64");
        const mappingTable = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));

        return {
          content: [
            {
              type: "text",
              text: `🎵 Project Encoded. Spectrogram generated for ${results.length} files. Access the visual map via the image below.`,
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
        const mappingPath = path.join(process.cwd(), "output", "mapping_table.json");
        
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
        const window = 20;
        const start = Math.max(0, lineNumber - 10);
        const end = Math.min(lines.length, start + window);
        
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

/**
 * Start the server
 */
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🎵 Sonic Code Sentinel MCP Server running on stdio (stdout is reserved for JSON-RPC)");
}

runServer().catch((error) => {
  console.error("💥 Fatal error running server:", error);
  process.exit(1);
});
