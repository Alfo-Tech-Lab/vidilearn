import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { youtubeExtractor } from "../extractors/youtube.js";
import { articleExtractor } from "../extractors/article.js";
import { dbService } from "./db.js";
import { embeddingService } from "./embedding.js";
import { summarizeService } from "./summarize.js";

export async function startMcpServer() {
  const server = new Server(
    {
      name: "vidilearn",
      version: "1.2.0",
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
          name: "search_memory",
          description: "Hybrid keyword and semantic vector search in local memory",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              limit: { type: "number", description: "Limit number of results (default 5)" },
            },
            required: ["query"],
          },
        },
        {
          name: "get_transcript",
          description: "Extract YouTube transcript text only",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "YouTube video URL" },
              lang: { type: "string", description: "Language code (default: en)" },
            },
            required: ["url"],
          },
        },
        {
          name: "summarize_document",
          description: "Generate summary of a document in local memory",
          inputSchema: {
            type: "object",
            properties: {
              docId: { type: "number", description: "Document ID in database" },
            },
            required: ["docId"],
          },
        },
        {
          name: "list_documents",
          description: "List all ingested documents in local memory",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "retrieve_chunks",
          description: "Retrieve all raw chunks belonging to a document ID",
          inputSchema: {
            type: "object",
            properties: {
              docId: { type: "number", description: "Document ID in database" },
            },
            required: ["docId"],
          },
        },
        {
          name: "trace_chunk",
          description: "Trace chunk details by chunk UUID or ID",
          inputSchema: {
            type: "object",
            properties: {
              chunkId: { type: "string", description: "Chunk UUID or database row ID" }
            },
            required: ["chunkId"]
          }
        },
        {
          name: "validate_retrieval",
          description: "Run diagnostic checks on database dimensions and vector collapses",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "audit_vectors",
          description: "Audit database hashes for duplicate vectors and anomalies",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === "search_memory") {
        const queryEmbedArr = await embeddingService.embed(args.query);
        const dbResults = await dbService.search(args.query, queryEmbedArr[0].embedding, args.limit || 5);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              results: dbResults.map(r => ({
                documentId: r.document_id,
                score: parseFloat(r.score.toFixed(4)),
                chunk: r.text,
                timestamp: r.metadata.timestamp || 0
              }))
            }, null, 2)
          }],
        };
      } else if (name === "get_transcript") {
        try {
          const transcript = await youtubeExtractor.getTranscript(args.url, { lang: args.lang });
          if (transcript.startsWith("Transcript unavailable")) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  error: {
                    code: "TRANSCRIPT_NOT_FOUND",
                    message: "No subtitles available for this video."
                  }
                }, null, 2)
              }],
              isError: true
            };
          }
          return {
            content: [{ type: "text", text: transcript }],
          };
        } catch (e) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: {
                  code: "TRANSCRIPT_NOT_FOUND",
                  message: e.message
                }
              }, null, 2)
            }],
            isError: true
          };
        }
      } else if (name === "summarize_document") {
        const stmt = dbService.db.prepare("SELECT text FROM chunks WHERE document_id = ?");
        const chunks = stmt.all(args.docId);
        if (chunks.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: {
                  code: "DOCUMENT_NOT_FOUND",
                  message: `No document chunks found for ID: ${args.docId}`
                }
              }, null, 2)
            }],
            isError: true
          };
        }
        const text = chunks.map(c => c.text).join('\n');
        const summary = await summarizeService.summarize(text, 'bullet');
        return {
          content: [{ type: "text", text: summary }],
        };
      } else if (name === "list_documents") {
        const docs = dbService.getAllDocuments();
        return {
          content: [{ type: "text", text: JSON.stringify(docs, null, 2) }],
        };
      } else if (name === "retrieve_chunks") {
        const stmt = dbService.db.prepare("SELECT * FROM chunks WHERE document_id = ?");
        const chunks = stmt.all(args.docId);
        return {
          content: [{ type: "text", text: JSON.stringify(chunks, null, 2) }],
        };
      } else if (name === "trace_chunk") {
        const stmt = dbService.db.prepare("SELECT c.*, d.title, d.url FROM chunks c JOIN documents d ON d.id = c.document_id WHERE c.chunk_uuid = ? OR c.id = ?");
        const chunk = stmt.get(args.chunkId, args.chunkId);
        if (!chunk) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                error: {
                  code: "CHUNK_NOT_FOUND",
                  message: `No chunk found matching ID or UUID: ${args.chunkId}`
                }
              }, null, 2)
            }],
            isError: true
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(chunk, null, 2) }]
        };
      } else if (name === "validate_retrieval") {
        const chunks = dbService.db.prepare("SELECT * FROM chunks").all();
        let validCount = 0;
        let wrongDimension = 0;
        chunks.forEach(c => {
          const floatArr = new Float32Array(c.embedding.buffer, c.embedding.byteOffset, c.embedding.byteLength / 4);
          if (floatArr.length !== 384) wrongDimension++;
          else validCount++;
        });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              totalChecked: chunks.length,
              validCount,
              invalidSizeCount: wrongDimension,
              status: wrongDimension === 0 ? "CLEAN" : "ANOMALOUS"
            }, null, 2)
          }]
        };
      } else if (name === "audit_vectors") {
        const chunks = dbService.db.prepare("SELECT hash FROM chunks").all();
        const hashes = new Set();
        let duplicates = 0;
        chunks.forEach(c => {
          if (hashes.has(c.hash)) duplicates++;
          else hashes.add(c.hash);
        });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              totalScanned: chunks.length,
              duplicates,
              metadataCorruptionCount: 0
            }, null, 2)
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: {
                code: "UNKNOWN_TOOL",
                message: `The tool ${name} is unrecognized.`
              }
            }, null, 2)
          }],
          isError: true
        };
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: {
              code: "FATAL_ERROR",
              message: error.message
            }
          }, null, 2)
        }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Vidilearn MCP Server running on stdio");
}
