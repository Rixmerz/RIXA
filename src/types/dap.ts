import { z } from 'zod';
import type { DebugProtocol } from '@vscode/debugprotocol';

/**
 * DAP Message types - subset we support initially
 */

// Base DAP message schema
export const DapMessageSchema = z.object({
  seq: z.number(),
  type: z.enum(['request', 'response', 'event']),
});

// DAP Request schema
export const DapRequestSchema = DapMessageSchema.extend({
  type: z.literal('request'),
  command: z.string(),
  arguments: z.record(z.unknown()).optional(),
});

// DAP Response schema
export const DapResponseSchema = DapMessageSchema.extend({
  type: z.literal('response'),
  request_seq: z.number(),
  success: z.boolean(),
  command: z.string(),
  message: z.string().optional(),
  body: z.record(z.unknown()).optional(),
});

// DAP Event schema
export const DapEventSchema = DapMessageSchema.extend({
  type: z.literal('event'),
  event: z.string(),
  body: z.record(z.unknown()).optional(),
});

/**
 * Specific DAP command schemas (subset we support)
 */

// Initialize request/response
export const DapInitializeRequestSchema = DapRequestSchema.extend({
  command: z.literal('initialize'),
  arguments: z.object({
    clientID: z.string().optional(),
    clientName: z.string().optional(),
    adapterID: z.string(),
    pathFormat: z.enum(['path', 'uri']).optional(),
    linesStartAt1: z.boolean().optional(),
    columnsStartAt1: z.boolean().optional(),
    supportsVariableType: z.boolean().optional(),
    supportsVariablePaging: z.boolean().optional(),
    supportsRunInTerminalRequest: z.boolean().optional(),
    locale: z.string().optional(),
  }),
});

export const DapInitializeResponseSchema = DapResponseSchema.extend({
  command: z.literal('initialize'),
  body: z
    .object({
      supportsConfigurationDoneRequest: z.boolean().optional(),
      supportsFunctionBreakpoints: z.boolean().optional(),
      supportsConditionalBreakpoints: z.boolean().optional(),
      supportsHitConditionalBreakpoints: z.boolean().optional(),
      supportsEvaluateForHovers: z.boolean().optional(),
      exceptionBreakpointFilters: z
        .array(
          z.object({
            filter: z.string(),
            label: z.string(),
            description: z.string().optional(),
            default: z.boolean().optional(),
          })
        )
        .optional(),
      supportsStepBack: z.boolean().optional(),
      supportsSetVariable: z.boolean().optional(),
      supportsRestartFrame: z.boolean().optional(),
      supportsGotoTargetsRequest: z.boolean().optional(),
      supportsStepInTargetsRequest: z.boolean().optional(),
      supportsCompletionsRequest: z.boolean().optional(),
      completionTriggerCharacters: z.array(z.string()).optional(),
      supportsModulesRequest: z.boolean().optional(),
      additionalModuleColumns: z.array(z.unknown()).optional(),
      supportedChecksumAlgorithms: z.array(z.string()).optional(),
      supportsRestartRequest: z.boolean().optional(),
      supportsExceptionOptions: z.boolean().optional(),
      supportsValueFormattingOptions: z.boolean().optional(),
      supportsExceptionInfoRequest: z.boolean().optional(),
      supportTerminateDebuggee: z.boolean().optional(),
      supportSuspendDebuggee: z.boolean().optional(),
      supportsDelayedStackTraceLoading: z.boolean().optional(),
      supportsLoadedSourcesRequest: z.boolean().optional(),
      supportsLogPoints: z.boolean().optional(),
      supportsTerminateThreadsRequest: z.boolean().optional(),
      supportsSetExpression: z.boolean().optional(),
      supportsTerminateRequest: z.boolean().optional(),
      supportsDataBreakpoints: z.boolean().optional(),
      supportsReadMemoryRequest: z.boolean().optional(),
      supportsWriteMemoryRequest: z.boolean().optional(),
      supportsDisassembleRequest: z.boolean().optional(),
      supportsCancelRequest: z.boolean().optional(),
      supportsBreakpointLocationsRequest: z.boolean().optional(),
      supportsClipboardContext: z.boolean().optional(),
      supportsSteppingGranularity: z.boolean().optional(),
      supportsInstructionBreakpoints: z.boolean().optional(),
      supportsExceptionFilterOptions: z.boolean().optional(),
    })
    .optional(),
});

// Launch request
export const DapLaunchRequestSchema = DapRequestSchema.extend({
  command: z.literal('launch'),
  arguments: z.record(z.unknown()),
});

// Attach request
export const DapAttachRequestSchema = DapRequestSchema.extend({
  command: z.literal('attach'),
  arguments: z.record(z.unknown()),
});

// SetBreakpoints request/response
export const DapSetBreakpointsRequestSchema = DapRequestSchema.extend({
  command: z.literal('setBreakpoints'),
  arguments: z.object({
    source: z.object({
      name: z.string().optional(),
      path: z.string().optional(),
      sourceReference: z.number().optional(),
      presentationHint: z.enum(['normal', 'emphasize', 'deemphasize']).optional(),
      origin: z.string().optional(),
      sources: z.array(z.unknown()).optional(),
      adapterData: z.unknown().optional(),
      checksums: z.array(z.unknown()).optional(),
    }),
    lines: z.array(z.number()).optional(),
    breakpoints: z
      .array(
        z.object({
          line: z.number(),
          column: z.number().optional(),
          condition: z.string().optional(),
          hitCondition: z.string().optional(),
          logMessage: z.string().optional(),
        })
      )
      .optional(),
    sourceModified: z.boolean().optional(),
  }),
});

export const DapSetBreakpointsResponseSchema = DapResponseSchema.extend({
  command: z.literal('setBreakpoints'),
  body: z.object({
    breakpoints: z.array(
      z.object({
        id: z.number().optional(),
        verified: z.boolean(),
        message: z.string().optional(),
        source: z.unknown().optional(),
        line: z.number().optional(),
        column: z.number().optional(),
        endLine: z.number().optional(),
        endColumn: z.number().optional(),
        instructionReference: z.string().optional(),
        offset: z.number().optional(),
      })
    ),
  }),
});

// Continue request
export const DapContinueRequestSchema = DapRequestSchema.extend({
  command: z.literal('continue'),
  arguments: z.object({
    threadId: z.number(),
    singleThread: z.boolean().optional(),
  }),
});

// Next (step over) request
export const DapNextRequestSchema = DapRequestSchema.extend({
  command: z.literal('next'),
  arguments: z.object({
    threadId: z.number(),
    singleThread: z.boolean().optional(),
    granularity: z.enum(['statement', 'line', 'instruction']).optional(),
  }),
});

// StepIn request
export const DapStepInRequestSchema = DapRequestSchema.extend({
  command: z.literal('stepIn'),
  arguments: z.object({
    threadId: z.number(),
    singleThread: z.boolean().optional(),
    targetId: z.number().optional(),
    granularity: z.enum(['statement', 'line', 'instruction']).optional(),
  }),
});

// StepOut request
export const DapStepOutRequestSchema = DapRequestSchema.extend({
  command: z.literal('stepOut'),
  arguments: z.object({
    threadId: z.number(),
    singleThread: z.boolean().optional(),
    granularity: z.enum(['statement', 'line', 'instruction']).optional(),
  }),
});

// Pause request
export const DapPauseRequestSchema = DapRequestSchema.extend({
  command: z.literal('pause'),
  arguments: z.object({
    threadId: z.number(),
  }),
});

// Threads request/response
export const DapThreadsRequestSchema = DapRequestSchema.extend({
  command: z.literal('threads'),
});

export const DapThreadsResponseSchema = DapResponseSchema.extend({
  command: z.literal('threads'),
  body: z.object({
    threads: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
      })
    ),
  }),
});

// StackTrace request/response
export const DapStackTraceRequestSchema = DapRequestSchema.extend({
  command: z.literal('stackTrace'),
  arguments: z.object({
    threadId: z.number(),
    startFrame: z.number().optional(),
    levels: z.number().optional(),
    format: z.unknown().optional(),
  }),
});

export const DapStackTraceResponseSchema = DapResponseSchema.extend({
  command: z.literal('stackTrace'),
  body: z.object({
    stackFrames: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        source: z.unknown().optional(),
        line: z.number(),
        column: z.number(),
        endLine: z.number().optional(),
        endColumn: z.number().optional(),
        canRestart: z.boolean().optional(),
        instructionPointerReference: z.string().optional(),
        moduleId: z.union([z.string(), z.number()]).optional(),
        presentationHint: z.enum(['normal', 'label', 'subtle']).optional(),
      })
    ),
    totalFrames: z.number().optional(),
  }),
});

/**
 * DAP Event schemas
 */

// Stopped event
export const DapStoppedEventSchema = DapEventSchema.extend({
  event: z.literal('stopped'),
  body: z.object({
    reason: z.enum([
      'step',
      'breakpoint',
      'exception',
      'pause',
      'entry',
      'goto',
      'function breakpoint',
      'data breakpoint',
      'instruction breakpoint',
    ]),
    description: z.string().optional(),
    threadId: z.number().optional(),
    preserveFocusHint: z.boolean().optional(),
    text: z.string().optional(),
    allThreadsStopped: z.boolean().optional(),
    hitBreakpointIds: z.array(z.number()).optional(),
  }),
});

// Output event
export const DapOutputEventSchema = DapEventSchema.extend({
  event: z.literal('output'),
  body: z.object({
    category: z.enum(['console', 'important', 'stdout', 'stderr', 'telemetry']).optional(),
    output: z.string(),
    group: z.enum(['start', 'startCollapsed', 'end']).optional(),
    variablesReference: z.number().optional(),
    source: z.unknown().optional(),
    line: z.number().optional(),
    column: z.number().optional(),
    data: z.unknown().optional(),
  }),
});

// Thread event
export const DapThreadEventSchema = DapEventSchema.extend({
  event: z.literal('thread'),
  body: z.object({
    reason: z.enum(['started', 'exited']),
    threadId: z.number(),
  }),
});

// Type exports
export type DapMessage = z.infer<typeof DapMessageSchema>;
export type DapRequest = z.infer<typeof DapRequestSchema>;
export type DapResponse = z.infer<typeof DapResponseSchema>;
export type DapEvent = z.infer<typeof DapEventSchema>;

// Re-export some useful types from the protocol
export type DapCapabilities = DebugProtocol.Capabilities;
export type DapSource = DebugProtocol.Source;
export type DapBreakpoint = DebugProtocol.Breakpoint;
export type DapStackFrame = DebugProtocol.StackFrame;
export type DapThread = DebugProtocol.Thread;
