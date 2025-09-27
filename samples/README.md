# eRPC Gateway - Batch Request Samples

This directory contains sample batch requests demonstrating the comprehensive JSON-RPC batch functionality of the eRPC Gateway.

## Overview

The eRPC Gateway supports full JSON-RPC 2.0 batch requests with:
- ✅ **Zod-based validation** - Strict schema validation with detailed error messages
- ✅ **Project-specific routing** - Different upstream configurations per project
- ✅ **Debug instrumentation** - Full debug info for each request in batch
- ✅ **Mixed request types** - Balance queries, block data, debug traces in same batch
- ✅ **Error handling** - Individual request errors don't break entire batch

## Sample Files

### Valid Batch Requests

- **`single-batch.txt`** - Basic single-item batch request
- **`multi-batch.txt`** - Multiple requests with different RPC methods
- **`debug-batch.txt`** - Batch request with debug=1 for full instrumentation
- **`large-batch.txt`** - Performance test with 10 parallel requests
- **`error-batch.txt`** - Valid batch with some method-not-found errors
- **`project-specific-batch.txt`** - Requests to different project endpoints

### Invalid Batch Requests

- **`invalid-batch.txt`** - Various validation failures (400 errors)

## Usage

1. **Start the eRPC Gateway:**
   ```bash
   npm run dev
   ```

2. **Run any sample:**
   ```bash
   # Copy and paste commands from any .txt file
   # For example:
   bash samples/multi-batch.txt
   ```

## Project Endpoints

The gateway supports batch requests on all project endpoints:

- **Gateway Project**: `POST http://localhost:1099/gateway/`
- **Indexing Project**: `POST http://localhost:1099/indexing/`
- **Default Project**: `POST http://localhost:1099/`

## Response Format

### Successful Batch Response
```json
[
  {
    "jsonrpc": "2.0",
    "id": 1,
    "result": "0x..."
  },
  {
    "jsonrpc": "2.0",
    "id": 2,
    "result": {...}
  }
]
```

### Batch with Debug Info
```json
[
  {
    "jsonrpc": "2.0",
    "id": 1,
    "result": "0x...",
    "debug": {
      "requestId": "req_...",
      "totalDuration": 123,
      "strategy": {
        "pipeline": ["pipeline", "PriorityRouting", "request_proxy"],
        "events": [...]
      },
      "context": {...}
    }
  }
]
```

### Validation Error Response
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32600,
    "message": "Invalid Request",
    "data": [
      {
        "expected": "string",
        "code": "invalid_type",
        "path": [1, "method"],
        "message": "Invalid input: expected string, received undefined"
      }
    ]
  },
  "id": null
}
```

## Validation Rules

### Strict Batch Validation
- Empty arrays are rejected
- All items must have valid JSON-RPC 2.0 format
- Required fields: `jsonrpc: "2.0"`, `method`
- Optional fields: `params`, `id`
- If any item is malformed, entire batch is rejected with 400

### Individual Request Processing
- Valid batches process each request independently
- Method-not-found errors return individual error responses
- Successful requests return normal results
- Each request goes through full routing strategy pipeline

## Routing Strategy

Each request in a batch follows the complete routing pipeline:

1. **PriorityRouting** - Select by node priority for non-block methods
2. **BlockBasedRouting** - Route based on block age (recent vs historical)
3. **FallbackArchivalRouting** - Fallback to archive nodes for old blocks
4. **ErrorRatesOps** - Skip unhealthy upstreams

Debug mode shows the exact pipeline execution for each request.