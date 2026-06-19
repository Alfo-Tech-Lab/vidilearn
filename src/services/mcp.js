import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { youtubeExtractor } from "../extractors/youtube.js";
import { articleExtractor } from "../extractors/article.js";
import { detectionService } from "./detection.js";

export async function startMcpServer() {
  const server = new Server(
    {
      name: "vidilearn",
      version: "1.1.0",
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
          name: "extract_youtube",
          description: "Extract transcripts and metadata from a YouTube video",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "YouTube video URL" },
            },
            required: ["url"],
          },
        },
        {
          name: "extract_web",
          description: "Extract clean content and metadata from a web article",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "Web article URL" },
            },
            required: ["url"],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === "extract_youtube") {
        if (!detectionService.isYouTube(args.url)) {
          throw new Error("Invalid YouTube URL");
        }
        const result = await youtubeExtractor.extract(args.url);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } else if (name === "extract_web") {
        const result = await articleExtractor.extract(args.url);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Vidilearn MCP Server running on stdio");
}
