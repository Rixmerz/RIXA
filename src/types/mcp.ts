import { z } from 'zod';

/**
 * MCP Protocol Version
 */
export const MCP_VERSION = '2024-11-05';

/**
 * Base MCP message schema
 */
export const McpMessageSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
});

/**
 * MCP Request schema
 */
export const McpRequestSchema = McpMessageSchema.extend({
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

/**
 * MCP Response schema
 */
export const McpResponseSchema = McpMessageSchema.extend({
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
});

/**
 * MCP Notification schema
 */
export const McpNotificationSchema = McpMessageSchema.extend({
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

/**
 * MCP Resource schema
 */
export const McpResourceSchema = z.object({
  uri: z.string(),
  name: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
});

/**
 * MCP Tool schema
 */
export const McpToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
});

/**
 * Specific MCP method schemas
 */

// Initialize request/response
export const McpInitializeRequestSchema = McpRequestSchema.extend({
  method: z.literal('initialize'),
  params: z.object({
    protocolVersion: z.string(),
    capabilities: z.object({
      resources: z.boolean().optional(),
      tools: z.boolean().optional(),
      prompts: z.boolean().optional(),
    }),
    clientInfo: z.object({
      name: z.string(),
      version: z.string(),
    }),
  }),
});

export const McpInitializeResponseSchema = McpResponseSchema.extend({
  result: z.object({
    protocolVersion: z.string(),
    capabilities: z.object({
      resources: z.boolean().optional(),
      tools: z.boolean().optional(),
      prompts: z.boolean().optional(),
    }),
    serverInfo: z.object({
      name: z.string(),
      version: z.string(),
    }),
  }),
});

// Resources list request/response
export const McpResourcesListRequestSchema = McpRequestSchema.extend({
  method: z.literal('resources/list'),
  params: z.object({}).optional(),
});

export const McpResourcesListResponseSchema = McpResponseSchema.extend({
  result: z.object({
    resources: z.array(McpResourceSchema),
  }),
});

// Resource read request/response
export const McpResourceReadRequestSchema = McpRequestSchema.extend({
  method: z.literal('resources/read'),
  params: z.object({
    uri: z.string(),
  }),
});

export const McpResourceReadResponseSchema = McpResponseSchema.extend({
  result: z.object({
    contents: z.array(
      z.object({
        uri: z.string(),
        mimeType: z.string().optional(),
        text: z.string().optional(),
        blob: z.string().optional(), // base64 encoded
      })
    ),
  }),
});

// Tools list request/response
export const McpToolsListRequestSchema = McpRequestSchema.extend({
  method: z.literal('tools/list'),
  params: z.object({}).optional(),
});

export const McpToolsListResponseSchema = McpResponseSchema.extend({
  result: z.object({
    tools: z.array(McpToolSchema),
  }),
});

// Tool call request/response
export const McpToolCallRequestSchema = McpRequestSchema.extend({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()).optional(),
  }),
});

export const McpToolCallResponseSchema = McpResponseSchema.extend({
  result: z.object({
    content: z.array(
      z.object({
        type: z.enum(['text', 'image', 'resource']),
        text: z.string().optional(),
        data: z.string().optional(), // base64 for images
        resource: z.string().optional(), // URI for resources
      })
    ),
    isError: z.boolean().optional(),
  }),
});

// Notification schemas
export const McpProgressNotificationSchema = McpNotificationSchema.extend({
  method: z.literal('notifications/progress'),
  params: z.object({
    progressToken: z.union([z.string(), z.number()]),
    progress: z.number(),
    total: z.number().optional(),
  }),
});

// Type exports
export type McpMessage = z.infer<typeof McpMessageSchema>;
export type McpRequest = z.infer<typeof McpRequestSchema>;
export type McpResponse = z.infer<typeof McpResponseSchema>;
export type McpNotification = z.infer<typeof McpNotificationSchema>;
export type McpResource = z.infer<typeof McpResourceSchema>;
export type McpTool = z.infer<typeof McpToolSchema>;

export type McpInitializeRequest = z.infer<typeof McpInitializeRequestSchema>;
export type McpInitializeResponse = z.infer<typeof McpInitializeResponseSchema>;
export type McpResourcesListRequest = z.infer<typeof McpResourcesListRequestSchema>;
export type McpResourcesListResponse = z.infer<typeof McpResourcesListResponseSchema>;
export type McpResourceReadRequest = z.infer<typeof McpResourceReadRequestSchema>;
export type McpResourceReadResponse = z.infer<typeof McpResourceReadResponseSchema>;
export type McpToolsListRequest = z.infer<typeof McpToolsListRequestSchema>;
export type McpToolsListResponse = z.infer<typeof McpToolsListResponseSchema>;
export type McpToolCallRequest = z.infer<typeof McpToolCallRequestSchema>;
export type McpToolCallResponse = z.infer<typeof McpToolCallResponseSchema>;
export type McpProgressNotification = z.infer<typeof McpProgressNotificationSchema>;
