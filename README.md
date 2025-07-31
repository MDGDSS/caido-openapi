# OpenAPI Tester Extension for Caido

A powerful Caido extension that automatically tests OpenAPI schemas by generating and executing test cases against your API endpoints.

## Features

- **Schema Validation**: Validates OpenAPI schemas for correctness and completeness
- **Automatic Test Generation**: Generates test cases from your OpenAPI schema paths
- **Real-time Testing**: Executes tests against your API endpoints and provides detailed results
- **Beautiful UI**: Modern, responsive interface with real-time feedback
- **Test Results**: Comprehensive reporting with pass/fail status, response times, and error details
- **Sample Data**: Built-in sample schema for quick testing

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the extension:
   ```bash
   pnpm build
   ```
4. Load the extension in Caido

## Quick Start with Example Server

To test the extension with a real API:

1. Install the example server dependencies:
   ```bash
   cp example-server-package.json package.json
   npm install
   ```

2. Start the example API server:
   ```bash
   node example-server.js
   ```

3. In the OpenAPI Tester extension:
   - Set the base URL to `http://localhost:3000`
   - Use the sample schema or paste your own OpenAPI schema
   - Click "Run Tests" to execute the tests

## Usage

### 1. Schema Input
- Paste your OpenAPI schema (JSON format) into the text area
- The extension will automatically validate the schema
- Use the "Load Sample Schema" button to see an example

### 2. Configuration
- Set the base URL for your API (e.g., `http://localhost:3000`)
- The extension will append the paths from your schema to this base URL

### 3. Running Tests
- Click "Run Tests" to execute all generated test cases
- Tests will be executed sequentially against your API
- Results are displayed in real-time

### 4. Viewing Results
- Switch to the "Test Results" tab to see detailed results
- View summary statistics (total, passed, failed tests)
- Examine individual test results with status codes and response times

## Supported HTTP Methods

The extension automatically generates tests for:
- GET requests
- POST requests (with request body support)
- PUT requests (with request body support)
- DELETE requests

## Sample OpenAPI Schema

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Sample API",
    "version": "1.0.0",
    "description": "A sample API for testing"
  },
  "paths": {
    "/users": {
      "get": {
        "summary": "Get all users",
        "responses": {
          "200": {
            "description": "Successful response"
          }
        }
      },
      "post": {
        "summary": "Create a new user",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "name": { "type": "string" },
                  "email": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "User created successfully"
          }
        }
      }
    }
  }
}
```

## Development

### Project Structure
```
openapitesting/
├── packages/
│   ├── backend/          # Backend logic for schema parsing and testing
│   └── frontend/         # Vue.js frontend interface
├── caido.config.ts       # Extension configuration
└── package.json          # Project dependencies
```

### Available Scripts
- `pnpm build` - Build the extension
- `pnpm watch` - Watch for changes and rebuild
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm lint` - Run ESLint

### Backend API

The backend provides the following functions:
- `validateSchema(schemaText: string)` - Validates OpenAPI schema
- `parseOpenAPISchema(schemaText: string)` - Parses schema into structured data
- `generateTestCases(schema: OpenAPISchema)` - Generates test cases from schema
- `executeTest(testCase: TestCase, baseUrl: string)` - Executes a single test
- `runAllTests(schemaText: string, baseUrl: string)` - Runs all tests for a schema

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
