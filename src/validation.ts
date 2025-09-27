import { z } from 'zod';

// JSON-RPC 2.0 specification schemas
export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string().min(1, 'Method is required'),
  params: z.any().optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional()
});

export const jsonRpcBatchRequestSchema = z.array(jsonRpcRequestSchema).min(1, 'Batch request cannot be empty');

export const jsonRpcRequestOrBatchSchema = z.union([
  jsonRpcRequestSchema,
  jsonRpcBatchRequestSchema
]);

// Error response schema
export const jsonRpcErrorSchema = z.object({
  jsonrpc: z.literal('2.0'),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional()
  }),
  id: z.union([z.string(), z.number(), z.null()])
});

// Validation result types
export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;
export type JsonRpcBatchRequest = z.infer<typeof jsonRpcBatchRequestSchema>;
export type JsonRpcRequestOrBatch = z.infer<typeof jsonRpcRequestOrBatchSchema>;
export type JsonRpcError = z.infer<typeof jsonRpcErrorSchema>;

// Validation functions
export function validateJsonRpcRequest(data: unknown): {
  success: true;
  data: JsonRpcRequest;
  isBatch: false;
} | {
  success: false;
  error: JsonRpcError;
} {
  const result = jsonRpcRequestSchema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
      isBatch: false
    };
  }

  return {
    success: false,
    error: {
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid Request',
        data: result.error.issues
      },
      id: typeof data === 'object' && data !== null && 'id' in data ? (data as any).id : null
    }
  };
}

export function validateJsonRpcBatchRequest(data: unknown): {
  success: true;
  data: JsonRpcBatchRequest;
  isBatch: true;
} | {
  success: false;
  error: JsonRpcError;
} {
  const result = jsonRpcBatchRequestSchema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
      isBatch: true
    };
  }

  return {
    success: false,
    error: {
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid Request',
        data: result.error.issues
      },
      id: null
    }
  };
}

export function validateJsonRpcRequestOrBatch(data: unknown): {
  success: true;
  data: JsonRpcRequest | JsonRpcBatchRequest;
  isBatch: boolean;
} | {
  success: false;
  error: JsonRpcError;
} {
  // Check if it's an array (batch request)
  if (Array.isArray(data)) {
    const batchResult = validateJsonRpcBatchRequest(data);
    if (batchResult.success) {
      return {
        success: true,
        data: batchResult.data,
        isBatch: true
      };
    }
    return batchResult;
  }

  // Single request
  const singleResult = validateJsonRpcRequest(data);
  if (singleResult.success) {
    return {
      success: true,
      data: singleResult.data,
      isBatch: false
    };
  }
  return singleResult;
}

// Helper function to create JSON-RPC error responses
export function createJsonRpcError(
  code: number,
  message: string,
  id: string | number | null = null,
  data?: any
): JsonRpcError {
  return {
    jsonrpc: '2.0',
    error: {
      code,
      message,
      ...(data && { data })
    },
    id
  };
}

// Common JSON-RPC error codes
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603
} as const;