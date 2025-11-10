import type { DefineAPI, SDK } from "caido:plugin";
import { RequestSpec } from "caido:utils";

// Add global type declarations for setTimeout
declare global {
  function setTimeout(callback: (...args: any[]) => void, ms: number): number;
}

// Result type for error handling
export type Result<T> =
  | { kind: "Error"; error: string }
  | { kind: "Ok"; value: T };

interface OpenAPISchema {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, Record<string, any>>;
  components?: {
    schemas?: Record<string, any>;
  };
  definitions?: Record<string, any>; // For Swagger 2.0
}

interface TestCase {
  path: string;
  method: string;
  name: string;
  description: string;
  parameters?: any[];
  requestBody?: any;
  expectedStatus?: number;
  pathVariables?: string[];
  bodyVariables?: Record<string, any>; // Add body variables
  originalPath?: string;
}

interface TestResult {
  testCase: TestCase;
  success: boolean;
  status: number;
  responseTime: number;
  error?: string;
  response?: any;
  responseHeaders?: Record<string, string>; // Store actual response headers
  responseRaw?: string; // Store raw response text if available
  actualBody?: any; // Store the actual body that was sent
  requestPath?: string;
  requestQuery?: string;
  requestUrl?: string;
  requestId?: string;
  requestRaw?: string;
}

interface TestOptions {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
  workers?: number;
  delayBetweenRequests?: number;
  parsedSchema?: OpenAPISchema; // For generating example values
  useParameterFromDefinition?: boolean; // Whether to use example values from schema
}

// Build query parameters from OpenAPI parameters definition
const buildQueryParams = (parameters?: any[]): Record<string, string> => {
  const queryParams: Record<string, string> = {};
  if (!parameters || parameters.length === 0) return queryParams;

  for (const param of parameters) {
    if (!param || (param.in !== 'query' && param.in !== 'Query')) continue;
    const name = param.name || '';
    if (!name) continue;

    // Prefer explicit example/defaults
    let value: any = undefined;
    if (param.example !== undefined) value = param.example;
    else if (param.examples) {
      const firstKey = Object.keys(param.examples)[0];
      if (firstKey && param.examples[firstKey]?.value !== undefined) {
        value = param.examples[firstKey].value;
      }
    }

    const schema = param.schema || {};
    if (value === undefined) {
      if (schema.example !== undefined) value = schema.example;
      else if (schema.default !== undefined) value = schema.default;
    }

    // Fallback: generate a basic example from schema/type
    if (value === undefined) {
      const basicSchema = schema.type ? schema : param; // Swagger 2 may use param.type
      try {
        value = generateExampleValue(basicSchema, 0);
      } catch (_) {
        // Final fallback by type heuristics
        const type = basicSchema.type || 'string';
        if (type === 'integer' || type === 'number') value = 0;
        else if (type === 'boolean') value = true;
        else if (type === 'array') value = ['value'];
        else value = 'value';
      }
    }

    // Only include required params, or those with computed values
    if (param.required || value !== undefined) {
      if (Array.isArray(value)) {
        queryParams[name] = value.map(v => String(v)).join(',');
      } else if (typeof value === 'object' && value !== null) {
        queryParams[name] = JSON.stringify(value);
      } else {
        queryParams[name] = String(value);
      }
    }
  }

  return queryParams;
};

const parseOpenAPISchema = (sdk: SDK, schemaText: string): OpenAPISchema => {
  try {
    const schema = JSON.parse(schemaText);
    // sdk.console.log("OpenAPI schema parsed successfully");
    return schema;
  } catch (error) {
    throw new Error(`Failed to parse OpenAPI schema: ${error}`);
  }
};

const generateTestCases = (sdk: SDK, schema: OpenAPISchema): TestCase[] => {
  const testCases: TestCase[] = [];
  
  for (const [path, methods] of Object.entries(schema.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method.toLowerCase() === 'get' || method.toLowerCase() === 'post' || 
          method.toLowerCase() === 'put' || method.toLowerCase() === 'delete' || method.toLowerCase() === 'patch') {
        
        // Extract path variables from the path
        const pathVariables = extractPathVariables(path);
        
        // Extract body parameters for Swagger 2.0
        let bodyParameter = null;
        let bodyVariables: Record<string, any> = {};
        
        if (operation.parameters) {
          for (const param of operation.parameters) {
            if (param.in === 'body' && param.schema) {
              bodyParameter = param.schema;
              // Extract body variables from schema
              bodyVariables = extractBodyVariables(param.schema, schema, sdk);
              break;
            }
          }
        }
        
        // For OpenAPI 3.x requestBody
        if (operation.requestBody?.content) {
          const content = operation.requestBody.content;
          const mediaType = Object.keys(content)[0] || 'application/json';
          const requestBodySchema = content[mediaType]?.schema;
          if (requestBodySchema) {
            bodyVariables = extractBodyVariables(requestBodySchema, schema, sdk);
          }
        }
        
        const testCase: TestCase = {
          path,
          method: method.toUpperCase(),
          name: `${method.toUpperCase()} ${path}`,
          description: operation.summary || operation.description || `Test ${method.toUpperCase()} ${path}`,
          parameters: operation.parameters || [],
          requestBody: operation.requestBody || bodyParameter, // Use body parameter for Swagger 2.0
          expectedStatus: getExpectedStatus(operation),
          pathVariables,
          bodyVariables,
          originalPath: path
        };
        

        
        testCases.push(testCase);
      }
    }
  }
  
  // sdk.console.log(`Generated ${testCases.length} test cases`);
  return testCases;
};

const extractPathVariables = (path: string): string[] => {
  const pathVariableRegex = /\{([^}]+)\}/g;
  const variables: string[] = [];
  let match;
  
  while ((match = pathVariableRegex.exec(path)) !== null) {
    if (match[1]) {
      variables.push(match[1]);
    }
  }
  
  return variables;
};

// Extract body variables from schema
const extractBodyVariables = (schema: any, parsedSchema: OpenAPISchema, sdk?: SDK): Record<string, any> => {
  const variables: Record<string, any> = {};
  
  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    const refSchema = parsedSchema.definitions?.[refName] || parsedSchema.components?.schemas?.[refName];
    if (refSchema && refSchema.properties) {
      for (const [propName, propSchema] of Object.entries(refSchema.properties)) {
        variables[propName] = generateExampleValue(propSchema as any, 0, parsedSchema);
      }
    }
    return variables;
  }
  
  // Handle direct properties
  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      variables[propName] = generateExampleValue(propSchema as any, 0, parsedSchema);
    }
  }
  
  return variables;
};

const getExpectedStatus = (operation: any): number => {
  if (operation.responses) {
    // Look for 2xx status codes first
    for (const [status, response] of Object.entries(operation.responses)) {
      if (status.startsWith('2')) {
        return parseInt(status);
      }
    }
    // Fall back to first available status
    const firstStatus = Object.keys(operation.responses)[0];
    return firstStatus ? parseInt(firstStatus) : 200;
  }
  return 200;
};

// Generate example value for schema (like Swagger UI)
const generateExampleValue = (schema: any, depth: number = 0, parsedSchema?: OpenAPISchema): any => {
  // Only stop recursion for circular references, not for legitimate nested structures
  if (depth > 10) return '...'; // Much higher limit for complex schemas
  
  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    // Try to find the referenced schema
    let refSchema;
    if (parsedSchema?.components?.schemas?.[refName]) {
      refSchema = parsedSchema.components.schemas[refName];
    } else if (parsedSchema?.definitions?.[refName]) {
      refSchema = parsedSchema.definitions[refName];
    }
    if (refSchema) {
      return generateExampleValue(refSchema, depth + 1, parsedSchema);
    }
    return `{${refName}}`;
  }
  
  // Handle basic types
  if (schema.type) {
    switch (schema.type) {
      case 'string':
        if (schema.format === 'date-time') return '2025-08-02T16:56:40.491Z';
        if (schema.format === 'date') return '2025-08-02';
        if (schema.format === 'email') return 'user@example.com';
        if (schema.enum) return schema.enum[0];
        if (schema.example) return schema.example;
        return 'string';
      case 'integer':
      case 'number':
        if (schema.example) return schema.example;
        if (schema.default) return schema.default;
        return 0;
      case 'boolean':
        if (schema.example) return schema.example;
        return true;
      case 'array':
        if (schema.items) {
          const itemExample = generateExampleValue(schema.items, depth + 1, parsedSchema);
          // Always return an array with at least one item, even if it's just the example
          return [itemExample];
        }
        return [];
      case 'object':
        if (schema.properties) {
          const obj: any = {};
          for (const [propName, propSchema] of Object.entries(schema.properties)) {
            obj[propName] = generateExampleValue(propSchema as any, depth + 1, parsedSchema);
          }
          return obj;
        }
        if (schema.additionalProperties) {
          // For additionalProperties, generate a proper object with the correct type
          const additionalPropType = generateExampleValue(schema.additionalProperties, depth + 1, parsedSchema);
          
          // Generate a realistic object with the correct additionalProperties type
          if (Array.isArray(additionalPropType)) {
            // If additionalProperties is an array type, create an object with array values
            return {
              'items': additionalPropType,
              'data': additionalPropType,
              'list': additionalPropType
            };
          } else if (typeof additionalPropType === 'object' && additionalPropType !== null) {
            // If additionalProperties is an object type, create an object with object values
            return {
              'item1': additionalPropType,
              'item2': additionalPropType,
              'data': additionalPropType
            };
          } else {
            // For primitive types, create an object with primitive values
            return {
              'id': typeof additionalPropType === 'number' ? 1 : 'example',
              'name': typeof additionalPropType === 'string' ? 'example' : 'Example Name',
              'value': additionalPropType,
              'enabled': typeof additionalPropType === 'boolean' ? true : false
            };
          }
        }
        return {};
    }
  }
  
  // Handle enums
  if (schema.enum) {
    return schema.enum[0];
  }
  
  // Handle examples
  if (schema.example) {
    return schema.example;
  }
  
  return 'example';
};

// Generate request body from schema parameters
const generateRequestBodyFromSchema = (testCase: TestCase, parsedSchema: OpenAPISchema): any => {
  // For OpenAPI 3.x requestBody
  if (testCase.requestBody?.content) {
    const content = testCase.requestBody.content;
    const mediaType = Object.keys(content)[0] || 'application/json';
    const schema = content[mediaType]?.schema;
    if (schema) {
      // For OpenAPI 3.x, use the schema as-is unless it's very generic
      if (schema.type === 'object' && 
          schema.additionalProperties && 
          !schema.properties &&
          !schema.$ref) {
        // Only use smart detection for truly generic schemas
        const possibleDefinitions = findPossibleObjectDefinitions({ schema }, parsedSchema, testCase);
        if (possibleDefinitions.length > 0) {
          return generateExampleValue(possibleDefinitions[0], 0, parsedSchema);
        }
      }
      return generateExampleValue(schema, 0, parsedSchema);
    }
  }
  
  // For Swagger 2.0 parameters with body
  if (testCase.parameters) {
    for (const param of testCase.parameters) {
      if (param.in === 'body' && param.schema) {
        // Check if this is a very generic object with only additionalProperties
        // Only use smart detection for truly generic schemas
        if (param.schema.type === 'object' && 
            param.schema.additionalProperties && 
            !param.schema.properties &&
            !param.schema.$ref) {
          // Look for object definitions that might match this parameter
          const possibleDefinitions = findPossibleObjectDefinitions(param, parsedSchema, testCase);
          if (possibleDefinitions.length > 0) {
            // Use the first matching definition
            return generateExampleValue(possibleDefinitions[0], 0, parsedSchema);
          }
        }
        return generateExampleValue(param.schema, 0, parsedSchema);
      }
    }
  }
  
  return null;
};

// Find possible object definitions that might match a generic parameter
const findPossibleObjectDefinitions = (param: any, parsedSchema: OpenAPISchema, testCase: TestCase): any[] => {
  const definitions = parsedSchema.definitions || {};
  const schemas = parsedSchema.components?.schemas || {};
  
  // Look for definitions that have properties (not just additionalProperties)
  const candidates: any[] = [];
  
  // First, try to find definitions that might be referenced by the parameter
  if (param.schema && param.schema.$ref) {
    const refName = param.schema.$ref.split('/').pop();
    const refSchema = definitions[refName] || schemas[refName];
    if (refSchema && refSchema.properties && Object.keys(refSchema.properties).length > 0) {
      candidates.push(refSchema);
      return candidates; // Return immediately if we found a direct reference
    }
  }
  
  // If no specific reference found, look for definitions that might match the endpoint context
  // Try to find definitions that contain keywords from the test case path or name
  const pathKeywords = testCase.path.toLowerCase().split(/[\/\-_]/).filter(k => k.length > 2);
  const nameKeywords = testCase.name.toLowerCase().split(/[\s\-_]/).filter(k => k.length > 2);
  const allKeywords = [...pathKeywords, ...nameKeywords];
  
  // Check definitions (Swagger 2.0)
  for (const [name, def] of Object.entries(definitions)) {
    if (def && typeof def === 'object' && def.properties && Object.keys(def.properties).length > 0) {
      // Check if the definition name contains any keywords from the endpoint
      const nameLower = name.toLowerCase();
      const hasMatchingKeyword = allKeywords.some(keyword => nameLower.includes(keyword));
      
      if (hasMatchingKeyword) {
        candidates.push(def);
      }
    }
  }
  
  // Check schemas (OpenAPI 3.x)
  for (const [name, schema] of Object.entries(schemas)) {
    if (schema && typeof schema === 'object' && schema.properties && Object.keys(schema.properties).length > 0) {
      // Check if the schema name contains any keywords from the endpoint
      const nameLower = name.toLowerCase();
      const hasMatchingKeyword = allKeywords.some(keyword => nameLower.includes(keyword));
      
      if (hasMatchingKeyword) {
        candidates.push(schema);
      }
    }
  }
  
  // If no contextual matches found, fall back to all definitions but prioritize by relevance
  if (candidates.length === 0) {
    // Instead of using all definitions, let's be more selective
    // Look for definitions that might be related to the HTTP method or common patterns
    const methodKeywords = [testCase.method.toLowerCase()];
    if (testCase.method === 'POST') methodKeywords.push('create', 'add', 'new');
    if (testCase.method === 'PUT') methodKeywords.push('update', 'modify', 'edit');
    if (testCase.method === 'DELETE') methodKeywords.push('delete', 'remove');
    
    for (const [name, def] of Object.entries(definitions)) {
      if (def && typeof def === 'object' && def.properties && Object.keys(def.properties).length > 0) {
        const nameLower = name.toLowerCase();
        const hasMethodKeyword = methodKeywords.some(keyword => nameLower.includes(keyword));
        
        if (hasMethodKeyword) {
          candidates.push(def);
        }
      }
    }
    
    // If still no matches, use the first few definitions but avoid the most generic ones
    if (candidates.length === 0) {
      const allDefs = Object.entries(definitions)
        .filter(([name, def]) => def && typeof def === 'object' && def.properties && Object.keys(def.properties).length > 0)
        .sort((a, b) => Object.keys(b[1].properties).length - Object.keys(a[1].properties).length);
      
      // Take the first 3 most detailed definitions
      for (let i = 0; i < Math.min(3, allDefs.length); i++) {
        const entry = allDefs[i];
        if (entry && entry[1]) {
          candidates.push(entry[1]);
        }
      }
    }
  }
  
  // Sort by number of properties (prefer more detailed objects)
  candidates.sort((a, b) => {
    const aProps = Object.keys(a.properties || {}).length;
    const bProps = Object.keys(b.properties || {}).length;
    return bProps - aProps;
  });
  
  return candidates;
};

const executeTest = async (sdk: SDK, testCase: TestCase, options: TestOptions, pathVariableValues?: Record<string, string>, bodyVariableValues?: Record<string, any>, queryParameterValues?: Record<string, string>): Promise<TestResult> => {
  const startTime = Date.now();
  let requestBody: any = null; // Declare requestBody at function scope
  
  try {
    // Replace path variables with actual values
    let finalPath = testCase.path;
    if (pathVariableValues && testCase.pathVariables) {
      for (const variable of testCase.pathVariables) {
        const value = pathVariableValues[variable] || `{${variable}}`;
        finalPath = finalPath.replace(`{${variable}}`, value);
      }
    }
    
    // Build query string from operation parameters (query params)
    const queryParams = buildQueryParams(testCase.parameters);
    
    // Override with custom query parameter values if provided
    if (queryParameterValues && Object.keys(queryParameterValues).length > 0) {
      Object.entries(queryParameterValues).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          queryParams[key] = value;
        }
      });
    }
    
    const queryStringRaw = Object.keys(queryParams).length > 0
      ? Object.entries(queryParams)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&')
      : '';

    // Parse base URL to extract scheme/host and base path (Caido RequestSpec constructor only uses scheme/host/port)
    let specBase = options.baseUrl;
    let basePathPrefix = '';
    try {
      const parsed = new URL(options.baseUrl);
      specBase = `${parsed.protocol}//${parsed.host}`; // host includes hostname:port when present
      basePathPrefix = parsed.pathname || '';
      if (basePathPrefix.endsWith('/')) {
        basePathPrefix = basePathPrefix.slice(0, -1);
      }
    } catch (_) {
      // If parsing fails, fall back to using the provided base URL and no base path prefix
      specBase = options.baseUrl;
      basePathPrefix = '';
    }

    // Compose full path (base path prefix + API path)
    const safeFinalPath = finalPath.startsWith('/') ? finalPath : `/${finalPath}`;
    const fullPath = `${basePathPrefix}${safeFinalPath}` || '/';

    // Create RequestSpec for Caido HTTP request using only scheme/host, then set path and query explicitly
    const spec = new RequestSpec(specBase);
    spec.setMethod(testCase.method);
    spec.setPath(fullPath);
    if (queryStringRaw) {
      spec.setQuery(queryStringRaw);
    }
    
    // Set headers - custom headers from UI replace defaults
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-User': '?1',
      'Sec-Fetch-Dest': 'document',
      'Connection': 'keep-alive',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    };
    
    // Use custom headers if provided, otherwise use defaults
    const headersToUse = {
      ...defaultHeaders,
      ...(options.headers && Object.keys(options.headers).length > 0 ? options.headers : {})
    };
    
    // Set all headers
    Object.entries(headersToUse).forEach(([key, value]) => {
      spec.setHeader(key, value);
    });

    // Determine request body for all methods (needed for actualBody in results)
    // Important: never send the raw OpenAPI requestBody object. Only send concrete data values.
    requestBody = null;

    // Use provided body variables if available - but only for the current test case
    // Debug logs removed

    if (bodyVariableValues && Object.keys(bodyVariableValues).length > 0 && testCase.bodyVariables) {
      // Only use body variables that are relevant to this test case
      const relevantBodyVariables: Record<string, any> = {};
      Object.keys(testCase.bodyVariables).forEach(key => {
        if (bodyVariableValues[key] !== undefined) {
          relevantBodyVariables[key] = bodyVariableValues[key];
        }
      });

      if (Object.keys(relevantBodyVariables).length > 0) {
        requestBody = relevantBodyVariables;
        // Debug logs removed
      } else if (testCase.bodyVariables && Object.keys(testCase.bodyVariables).length > 0) {
        // Fallback to test case body variables if any are defined for this endpoint
        requestBody = testCase.bodyVariables;
        // Debug logs removed
      }
    } else if (testCase.bodyVariables && Object.keys(testCase.bodyVariables).length > 0) {
      // Use extracted body variables from test case
      requestBody = testCase.bodyVariables;
      // Debug logs removed
    } else if (testCase.requestBody && options.parsedSchema && options.useParameterFromDefinition !== false) {
      // If this operation defines a requestBody, generate concrete example values from the schema
      const generatedBody = generateRequestBodyFromSchema(testCase, options.parsedSchema);
      if (generatedBody) {
        requestBody = generatedBody;
        // Debug logs removed
      }
    }
    
    // Add request body and Content-Length for POST/PUT/PATCH requests
    let requestBodyString = '';
    if (testCase.method === 'POST' || testCase.method === 'PUT' || testCase.method === 'PATCH') {
      // Set request body if available
      if (requestBody) {
        requestBodyString = JSON.stringify(requestBody);
        spec.setBody(requestBodyString);
      } else {
        // For POST/PUT/PATCH without body, use empty string
        requestBodyString = '';
        spec.setBody('');
      }
    }

    // Add Content-Length header for POST/PUT/PATCH requests (after all other headers)
    if (testCase.method === 'POST' || testCase.method === 'PUT' || testCase.method === 'PATCH') {
      const contentLength = requestBodyString.length;
      spec.setHeader('Content-Length', contentLength.toString());
      // Debug logs removed
    }

    // Send the request using Caido SDK
    const sentRequest = await sdk.requests.send(spec);
    const responseTime = Date.now() - startTime;
    
    if (sentRequest.response) {
      try {
        // Try different ways to access status code and body
        let statusCode: number;
        let responseBody: string;
        let responseBodyObj: any;
        let requestRawText: string | undefined = undefined;
        let requestId: string | undefined = undefined;
        let responseHeaders: Record<string, string> = {};
        let responseRaw: string | undefined = undefined;
        
        if (typeof sentRequest.response.getCode === 'function') {
          statusCode = sentRequest.response.getCode();
        } else if (sentRequest.response.status) {
          statusCode = sentRequest.response.status;
        } else if (sentRequest.response.code) {
          statusCode = sentRequest.response.code;
        } else {
          statusCode = 0;
        }
        
        // Try to capture response headers
        try {
          if (typeof sentRequest.response.getHeaders === 'function') {
            const headers = sentRequest.response.getHeaders();
            if (headers && typeof headers === 'object') {
              // Headers might be a Map, object, or array of [key, value] pairs
              if (headers instanceof Map) {
                headers.forEach((value, key) => {
                  responseHeaders[key] = String(value);
                });
              } else if (Array.isArray(headers)) {
                headers.forEach(([key, value]) => {
                  responseHeaders[String(key)] = String(value);
                });
              } else {
                // Assume it's a plain object
                Object.entries(headers).forEach(([key, value]) => {
                  responseHeaders[key] = String(value);
                });
              }
            }
          } else if (sentRequest.response.headers) {
            // Try direct headers property
            const headers = sentRequest.response.headers;
            if (headers instanceof Map) {
              headers.forEach((value, key) => {
                responseHeaders[key] = String(value);
              });
            } else if (Array.isArray(headers)) {
              headers.forEach(([key, value]) => {
                responseHeaders[String(key)] = String(value);
              });
            } else {
              Object.entries(headers).forEach(([key, value]) => {
                responseHeaders[key] = String(value);
              });
            }
          }
          
          // Try to get raw response text (includes headers)
          if (typeof sentRequest.response.getRaw === 'function') {
            const rawResp = sentRequest.response.getRaw();
            if (rawResp && typeof rawResp.toText === 'function') {
              responseRaw = rawResp.toText();
            }
          }
        } catch (_) {
          // ignore header extraction errors
        }
        
        // Try to capture the raw request text that was actually sent
        try {
          if (sentRequest.request && typeof sentRequest.request.getRaw === 'function') {
            const rawReq = sentRequest.request.getRaw();
            if (rawReq && typeof rawReq.toText === 'function') {
              requestRawText = rawReq.toText();
            }
          }
          if (sentRequest.request && typeof sentRequest.request.getId === 'function') {
            const idVal = sentRequest.request.getId();
            if (idVal !== undefined && idVal !== null) {
              requestId = String(idVal);
            }
          }
        } catch (_) {
          // ignore raw extraction errors
        }
        if (typeof sentRequest.response.getBody === 'function') {
          responseBodyObj = sentRequest.response.getBody();
          if (responseBodyObj && typeof responseBodyObj.toText === 'function') {
            responseBody = responseBodyObj.toText();
          } else if (responseBodyObj && typeof responseBodyObj.toString === 'function') {
            responseBody = responseBodyObj.toString();
          } else {
            responseBody = '';
          }
        } else if (sentRequest.response.body) {
          responseBody = sentRequest.response.body;
        } else if (sentRequest.response.data) {
          responseBody = sentRequest.response.data;
        } else {
          responseBody = '';
        }
        // Parse response body
        let responseData;
        try {
          // Check if it's XML first
          if (responseBody.trim().startsWith('<?xml') || responseBody.trim().startsWith('<')) {
            responseData = responseBody; // Keep XML as string for proper formatting
          } else {
            // Try to parse as JSON
            responseData = JSON.parse(responseBody);
          }
        } catch (parseError) {
          responseData = responseBody;
        }
        const success = statusCode >= 200 && statusCode < 300;
        const result = {
          testCase,
          success,
          status: statusCode,
          responseTime,
          response: responseData,
          responseHeaders: Object.keys(responseHeaders).length > 0 ? responseHeaders : undefined,
          responseRaw,
          actualBody: requestBody,
          requestPath: fullPath,
          requestQuery: queryStringRaw,
          requestUrl: `${specBase}${fullPath}${queryStringRaw ? `?${queryStringRaw}` : ''}`,
          requestId,
          requestRaw: requestRawText
        };
        

        
        return result;
      } catch (responseError) {
        return {
          testCase,
          success: false,
          status: 0,
          responseTime,
          error: `Response processing error: ${responseError}`,
          actualBody: requestBody || null,
          requestPath: fullPath,
          requestQuery: queryStringRaw,
          requestUrl: `${specBase}${fullPath}${queryStringRaw ? `?${queryStringRaw}` : ''}`,
          requestRaw: undefined
        };
      }
    } else {
      throw new Error('No response received');
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    // Debug logs removed
    
    return {
      testCase,
      success: false,
      status: 0,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      actualBody: requestBody || null,
      requestPath: undefined,
      requestQuery: undefined,
      requestUrl: undefined
    };
  }
};

const runAllTests = async (sdk: SDK, schema: OpenAPISchema, baseUrl: string, options: Partial<TestOptions> = {}, pathVariableValues?: Record<string, string[]>): Promise<TestResult[]> => {
  try {
    const testCases = generateTestCases(sdk, schema);
    const results: TestResult[] = [];
    
    const workers = options.workers || 1;
    const delayBetweenRequests = options.delayBetweenRequests || 0;
    
    // Debug logs removed
    
    if (workers === 1) {
      // Sequential execution
      for (const testCase of testCases) {
        // Generate combinations for this test case
        const combinations = generateTestCombinations(testCase, pathVariableValues);
        
        if (combinations.length === 0) {
          // No path variables, run single test
          const result = await executeTest(sdk, testCase, { ...options, baseUrl });
          results.push(result);
        } else {
          // Run test for each combination
          for (const combination of combinations) {
            const result = await executeTest(sdk, testCase, { ...options, baseUrl }, combination);
            results.push(result);
            
            if (delayBetweenRequests > 0) {
              await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
            }
          }
        }
        
        // Debug logs removed
      }
    } else {
      // Parallel execution with workers - simplified for now
      for (const testCase of testCases) {
        const combinations = generateTestCombinations(testCase, pathVariableValues);
        
        if (combinations.length === 0) {
          const result = await executeTest(sdk, testCase, { ...options, baseUrl });
          results.push(result);
        } else {
          for (const combination of combinations) {
            const result = await executeTest(sdk, testCase, { ...options, baseUrl }, combination);
            results.push(result);
          }
        }
      }
    }
    
    return results;
  } catch (error) {
    throw new Error(`Failed to run tests: ${error}`);
  }
};

const generateTestCombinations = (testCase: TestCase, pathVariableValues?: Record<string, string[]>): Record<string, string>[] => {
  if (!testCase.pathVariables || testCase.pathVariables.length === 0 || !pathVariableValues) {
    return [];
  }
  
  const combinations: Record<string, string>[] = [];
  const variables = testCase.pathVariables;
  const valuesPerVariable: string[][] = [];
  
  // Get all values for each variable
  for (const variable of variables) {
    const values = pathVariableValues?.[variable] || [''];
    const nonEmptyValues = values?.filter(v => v.trim() !== '') || [''];
    valuesPerVariable.push(nonEmptyValues.length > 0 ? nonEmptyValues : ['']);
  }
  
  // Generate all combinations
  const generateCombinations = (current: Record<string, string>, index: number) => {
    if (index === variables.length) {
      combinations.push({ ...current });
      return;
    }
    
    const variable = variables[index];
    const values = valuesPerVariable[index];
    
    if (variable && values) {
      for (const value of values) {
        current[variable] = value;
        generateCombinations(current, index + 1);
      }
    }
  };
  
  generateCombinations({}, 0);
  return combinations;
};

const runSpecificTests = async (sdk: SDK, schema: OpenAPISchema, baseUrl: string, testNames: string[]): Promise<TestResult[]> => {
  try {
    const allTestCases = generateTestCases(sdk, schema);
    const filteredTestCases = allTestCases.filter(testCase => 
      testNames.some(name => testCase.name.includes(name) || testCase.path.includes(name))
    );
    
    const results: TestResult[] = [];
    
    // Debug logs removed
    
    for (const testCase of filteredTestCases) {
      const result = await executeTest(sdk, testCase, { baseUrl });
      results.push(result);
    }
    
    return results;
  } catch (error) {
    throw new Error(`Failed to run specific tests: ${error}`);
  }
};

const runSingleTest = async (sdk: SDK, testCase: TestCase, baseUrl: string, options: Partial<TestOptions> = {}, pathVariableValues?: Record<string, string>, bodyVariableValues?: Record<string, any>, queryParameterValues?: Record<string, string>): Promise<TestResult> => {
  try {
    // Debug logs removed
    const result = await executeTest(sdk, testCase, { ...options, baseUrl }, pathVariableValues, bodyVariableValues, queryParameterValues);
    
    // Debug logs removed
    
    return result;
  } catch (error) {
    throw new Error(`Failed to run single test: ${error}`);
  }
};

const validateSchema = (sdk: SDK, schemaText: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  try {
    const schema = JSON.parse(schemaText);
    
    // Check for OpenAPI or Swagger version field
    if (!schema.openapi && !schema.swagger) {
      errors.push("Missing 'openapi' or 'swagger' version field");
    }
    
    if (!schema.info) {
      errors.push("Missing 'info' section");
    } else {
      if (!schema.info.title) errors.push("Missing 'info.title'");
      if (!schema.info.version) errors.push("Missing 'info.version'");
    }
    
    if (!schema.paths || Object.keys(schema.paths).length === 0) {
      errors.push("Missing or empty 'paths' section");
    }
    
    // Additional validation
    if (schema.paths) {
      for (const [path, methods] of Object.entries(schema.paths)) {
        if (typeof methods !== 'object' || methods === null) {
          errors.push(`Invalid path definition for '${path}'`);
          continue;
        }
        
        for (const [method, operation] of Object.entries(methods)) {
          if (typeof operation !== 'object' || operation === null) {
            errors.push(`Invalid operation definition for ${method.toUpperCase()} ${path}`);
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Invalid JSON: ${error}`]
    };
  }
};

const getSchemaInfo = (sdk: SDK, schemaText: string): { title: string; version: string; description?: string; pathCount: number; methodCount: number } => {
  try {
    const schema = JSON.parse(schemaText);
    let methodCount = 0;
    
    if (schema.paths) {
      for (const methods of Object.values(schema.paths)) {
        if (typeof methods === 'object' && methods !== null) {
          methodCount += Object.keys(methods).length;
        }
      }
    }
    
    return {
      title: schema.info?.title || 'Unknown API',
      version: schema.info?.version || 'Unknown',
      description: schema.info?.description,
      pathCount: schema.paths ? Object.keys(schema.paths).length : 0,
      methodCount
    };
  } catch (error) {
    throw new Error(`Failed to get schema info: ${error}`);
  }
};

// Simple test function to demonstrate HTTP requests
const testHttpRequest = async (sdk: SDK, url: string): Promise<{ success: boolean; status: number; response: string }> => {
  try {
    const spec = new RequestSpec(url);
    spec.setMethod("GET");
    spec.setHeader('User-Agent', 'OpenAPI-Tester/1.0');
    
    const sentRequest = await sdk.requests.send(spec);
    
    if (sentRequest.response) {
      const statusCode = sentRequest.response.getCode();
      const responseBody = sentRequest.response.getBody();
      // Debug logs removed
      
      return {
        success: statusCode >= 200 && statusCode < 300,
        status: statusCode,
        response: responseBody
      };
    } else {
      throw new Error('No response received');
    }
  } catch (error) {
    // Debug logs removed
    return {
      success: false,
      status: 0,
      response: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Find test result in Caido's HTTP History and open it in native UI
const openTestResultInCaido = async (sdk: SDK, testResult: TestResult, baseUrl: string): Promise<void> => {
  try {
    const url = baseUrl + testResult.testCase.path;
    const method = testResult.testCase.method;
    
    // Create HTTPQL query to find the request
    const query = `method.eq:"${method}" AND url.eq:"${url}"`;
    
    // Use Caido's search to find the request
    const searchResults = await sdk.search.search(query);
    
    if (searchResults && searchResults.length > 0) {
      // Get the most recent matching request
      const request = searchResults[0];
      
      // Open the request in Caido's native request/response viewer
      await sdk.navigation.navigateToRequest(request.id);
      
      // Debug logs removed
    } else {
      // Debug logs removed
    }
  } catch (error) {
    // Debug logs removed
  }
};

// Send a test result's request to Replay, ensuring a collection exists for the given base URL
// Note: collectionId is optional; when provided we will attach the new session to that collection
async function sendResultToReplay(
  sdk: SDK,
  testResultParam: any,
  collectionNameParam: any,
  collectionIdParam?: any
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  try {
    // Coerce/parse inputs coming from RPC which may be JSON-stringified
    let testResult: TestResult;
    try {
      testResult = typeof testResultParam === 'string' ? JSON.parse(testResultParam) : testResultParam;
    } catch (e) {
      return { success: false, error: 'Invalid testResult payload' };
    }

    let collectionName: string = String(collectionNameParam ?? '').trim();
    if (collectionName.startsWith('"') && collectionName.endsWith('"')) {
      collectionName = collectionName.slice(1, -1);
    }
    if (!collectionName) return { success: false, error: 'Missing collection name' };

    let collectionId: string | undefined = undefined;
    if (collectionIdParam !== undefined && collectionIdParam !== null && String(collectionIdParam).trim() !== '') {
      collectionId = String(collectionIdParam);
    }

    // Determine request source: prefer saved Request ID (most reliable), fallback to RequestSpec
    let source: any = undefined;
    if (testResult.requestId) {
      source = String(testResult.requestId);
    } else {
      // Build RequestSpec from raw HTTP to ensure headers and formatting are preserved
      try {
        if (testResult.requestRaw && (sdk as any).requests?.send) {
          // Convert raw into a RequestSpec via RequestsSDK (parse raw)
          const tempSpec = new RequestSpec('http://localhost/');
          try {
            const raw = (testResult.requestRaw as string);
            // Basic parse: split first line and headers; set method/path/query/headers
            const [requestLine, ...rest] = raw.split('\r\n');
            const [method, path] = requestLine.split(' ');
            if (method) tempSpec.setMethod(method);
            if (path) {
              const urlObj = new URL(path, testResult.requestUrl || 'http://placeholder');
              tempSpec.setPath(urlObj.pathname);
              const qs = urlObj.search.replace(/^\?/, '');
              if (qs) tempSpec.setQuery(qs);
            }
            for (const line of rest) {
              if (!line) continue;
              const idx = line.indexOf(':');
              if (idx > 0) {
                const h = line.slice(0, idx).trim();
                const v = line.slice(idx + 1).trim();
                if (h && v) tempSpec.setHeader(h, v);
              }
            }
          } catch (_) {}
          source = tempSpec;
        } else {
          const fullUrl = typeof testResult.requestUrl === 'string' && testResult.requestUrl.trim() !== ''
            ? testResult.requestUrl
            : `${testResult.requestPath || testResult.testCase?.path || '/'}`;
          const spec = new RequestSpec(fullUrl);
          if (testResult.testCase?.method) spec.setMethod(testResult.testCase.method);
          if (testResult.requestPath) spec.setPath(testResult.requestPath);
          if (testResult.requestQuery) spec.setQuery(testResult.requestQuery);
          if (testResult.actualBody) {
            try { spec.setBody(JSON.stringify(testResult.actualBody)); } catch (_) {}
          }
          source = spec;
        }
      } catch (e) {
        // Debug logs removed
      }
    }

    // Create Replay session
    if ((sdk as any).replay?.createSession) {
      // Workflow SDK expects positional params: createSession(source?, collection?)
      const session = await (sdk as any).replay.createSession(
        source,
        (collectionId && String(collectionId).trim() !== '') ? String(collectionId) : undefined
      );
      const id = typeof session?.getId === 'function' ? session.getId() : (session?.id || undefined);
      return { success: true, sessionId: id };
    }
    return { success: false, error: 'Replay SDK not available' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    try { (sdk as any).console?.error?.('sendResultToReplay failed:', msg); } catch (_) {}
    return { success: false, error: msg };
  }
}

// Database helper functions
const saveSessionsToDb = async (sdk: SDK, projectId: string, sessions: any[]): Promise<Result<void>> => {
  try {
    const db = await sdk.meta.db();
    
    // Clean and serialize sessions data
    const cleanedSessions = sessions.map(session => {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(session)) {
        // Skip functions and undefined values
        if (typeof value === 'function' || value === undefined) {
          continue;
        }
        // Convert Sets to arrays
        if (value instanceof Set) {
          cleaned[key] = Array.from(value);
        } else if (value instanceof Map) {
          cleaned[key] = Array.from(value.entries());
        } else {
          cleaned[key] = value;
        }
      }
      return cleaned;
    });
    
    const value = JSON.stringify(cleanedSessions);
    const key = `openapi-sessions-${projectId}`;
    const stmt = await db.prepare(`
      INSERT OR REPLACE INTO config (key, value) 
      VALUES (?, ?)
    `);
    await stmt.run(key, value);
    return { kind: "Ok", value: undefined };
  } catch (error) {
    sdk.console.error(`Failed to save sessions: ${error instanceof Error ? error.message : String(error)}`);
    return {
      kind: "Error",
      error: `Failed to save sessions: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const loadSessionsFromDb = async (sdk: SDK, projectId: string): Promise<Result<any[]>> => {
  try {
    const db = await sdk.meta.db();
    const key = `openapi-sessions-${projectId}`;
    const stmt = await db.prepare(`SELECT value FROM config WHERE key = ?`);
    const result = await stmt.get<{ value: string }>(key);
    
    if (result === undefined || result.value === undefined) {
      return { kind: "Ok", value: [] };
    }
    const sessions = JSON.parse(result.value) as any[];
    return { kind: "Ok", value: sessions };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to load sessions: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const saveTestResultsToDb = async (sdk: SDK, testResults: any): Promise<Result<void>> => {
  try {
    const db = await sdk.meta.db();
    const value = JSON.stringify(testResults);
    const key = 'openapi-testing-results';
    const stmt = await db.prepare(`
      INSERT OR REPLACE INTO config (key, value) 
      VALUES (?, ?)
    `);
    await stmt.run(key, value);
    return { kind: "Ok", value: undefined };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to save test results: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const loadTestResultsFromDb = async (sdk: SDK): Promise<Result<any>> => {
  try {
    const db = await sdk.meta.db();
    const key = 'openapi-testing-results';
    const stmt = await db.prepare(`SELECT value FROM config WHERE key = ?`);
    const result = await stmt.get<{ value: string }>(key);
    
    if (result === undefined || result.value === undefined) {
      return { kind: "Ok", value: null };
    }
    const testResults = JSON.parse(result.value) as any;
    return { kind: "Ok", value: testResults };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to load test results: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

// Log all database contents
const saveGlobalSettingsToDb = async (sdk: SDK, settings: any): Promise<Result<void>> => {
  try {
    const db = await sdk.meta.db();
    const value = JSON.stringify(settings);
    const key = 'openapi-global-settings';
    const stmt = await db.prepare(`
      INSERT OR REPLACE INTO config (key, value) 
      VALUES (?, ?)
    `);
    await stmt.run(key, value);
    return { kind: "Ok", value: undefined };
  } catch (error) {
    return { kind: "Error", error: error instanceof Error ? error.message : String(error) };
  }
};

const loadGlobalSettingsFromDb = async (sdk: SDK): Promise<Result<any>> => {
  try {
    const db = await sdk.meta.db();
    const key = 'openapi-global-settings';
    const stmt = await db.prepare(`SELECT value FROM config WHERE key = ?`);
    const result = await stmt.get<{ value: string }>(key);
    
    if (result === undefined || result.value === undefined) {
      // Return default settings if none exist
      return { kind: "Ok", value: {
        workers: 10,
        delayBetweenRequests: 100,
        timeout: 30000,
        allowDeleteInAllMethods: false,
        defaultPlaceholders: {
          string: 'string',
          integer: 0,
          number: 0,
          boolean: true,
          email: 'user@example.com',
          date: '2023-01-01',
          dateTime: '2023-01-01T00:00:00Z',
          uuid: '123e4567-e89b-12d3-a456-426614174000'
        }
      } };
    }
    const settings = JSON.parse(result.value) as any;
    return { kind: "Ok", value: settings };
  } catch (error) {
    return { kind: "Error", error: error instanceof Error ? error.message : String(error) };
  }
};

const logDatabaseContents = async (sdk: SDK): Promise<Result<void>> => {
  try {
    const db = await sdk.meta.db();
    const stmt = await db.prepare(`SELECT key, value FROM config`);
    const allRows = await stmt.all<{ key: string; value: string }>();
    
    sdk.console.log('=== Database Contents ===');
    sdk.console.log(`Total entries: ${allRows.length}`);
    
    for (const row of allRows) {
      try {
        const parsedValue = JSON.parse(row.value);
        sdk.console.log(`Key: ${row.key}`);
        sdk.console.log(`Value:`, parsedValue);
        sdk.console.log('---');
      } catch (parseError) {
        sdk.console.log(`Key: ${row.key}`);
        sdk.console.log(`Value (raw): ${row.value}`);
        sdk.console.log('---');
      }
    }
    
    sdk.console.log('=== End Database Contents ===');
    return { kind: "Ok", value: undefined };
  } catch (error) {
    sdk.console.error(`Failed to log database contents: ${error instanceof Error ? error.message : String(error)}`);
    return {
      kind: "Error",
      error: `Failed to log database contents: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

// Get all project keys that have sessions in the database
const getAllSessionProjectKeys = async (sdk: SDK): Promise<Result<string[]>> => {
  try {
    const db = await sdk.meta.db();
    const stmt = await db.prepare(`SELECT key FROM config WHERE key LIKE 'openapi-sessions-%'`);
    const allRows = await stmt.all<{ key: string }>();
    
    const projectKeys = allRows.map(row => {
      // Extract project key from key (format: openapi-sessions-{projectKey})
      return row.key.replace('openapi-sessions-', '');
    }).filter(key => key.length > 0);
    
    return { kind: "Ok", value: projectKeys };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to get session project keys: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

// Check if migration has been completed
const isMigrationCompleted = async (sdk: SDK): Promise<Result<boolean>> => {
  try {
    const db = await sdk.meta.db();
    const stmt = await db.prepare(`SELECT value FROM config WHERE key = 'openapi-migrated'`);
    const row = await stmt.first<{ value: string }>();
    
    sdk.console.log(`Migration check - row:`, row);
    
    if (row && (row.value === 'true' || row.value === true || String(row.value).toLowerCase() === 'true')) {
      sdk.console.log('Migration completed flag found, returning true');
      return { kind: "Ok", value: true };
    }
    
    sdk.console.log('Migration completed flag not found or not true, returning false');
    return { kind: "Ok", value: false };
  } catch (error) {
    sdk.console.error(`Failed to check migration status: ${error instanceof Error ? error.message : String(error)}`);
    return {
      kind: "Error",
      error: `Failed to check migration status: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

// Migrate data from localStorage to database
const migrateFromLocalStorage = async (sdk: SDK, localStorageData: { sessions: Record<string, any[]>, testResults: any }): Promise<Result<{ sessionsMigrated: number; testResultsMigrated: boolean }>> => {
  try {
    let sessionsMigrated = 0;
    let testResultsMigrated = false;
    
    // Migrate sessions (using the openapi env var value as the project key)
    for (const [key, sessions] of Object.entries(localStorageData.sessions)) {
      // Extract project key from key (format: openapi-sessions-{openapiValue})
      // The key is already the openapi environment variable value
      const projectKey = key.replace('openapi-sessions-', '');
      if (projectKey && Array.isArray(sessions) && sessions.length > 0) {
        sdk.console.log(`Migrating ${sessions.length} sessions for project key: ${projectKey}`);
        
        const result = await saveSessionsToDb(sdk, projectKey, sessions);
        if (result.kind === "Ok") {
          sessionsMigrated += sessions.length;
          sdk.console.log(`✓ Migrated ${sessions.length} sessions for project: ${projectKey}`);
        } else {
          sdk.console.error(`✗ Failed to migrate sessions for ${projectKey}: ${result.error}`);
        }
      }
    }
    
    // Migrate test results
    if (localStorageData.testResults) {
      const result = await saveTestResultsToDb(sdk, localStorageData.testResults);
      if (result.kind === "Ok") {
        testResultsMigrated = true;
        sdk.console.log('Migrated test results');
      } else {
        sdk.console.error(`Failed to migrate test results: ${result.error}`);
      }
    }
    
    sdk.console.log(`Migration complete: ${sessionsMigrated} sessions migrated, test results: ${testResultsMigrated ? 'yes' : 'no'}`);
    
    // Set migrated flag in database
    try {
      const db = await sdk.meta.db();
      const stmt = await db.prepare(`
        INSERT OR REPLACE INTO config (key, value) 
        VALUES ('openapi-migrated', 'true')
      `);
      await stmt.run();
      sdk.console.log('Migration flag set in database');
    } catch (error) {
      sdk.console.error(`Failed to set migration flag: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return { 
      kind: "Ok", 
      value: { sessionsMigrated, testResultsMigrated } 
    };
  } catch (error) {
    return {
      kind: "Error",
      error: `Failed to migrate from localStorage: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

export type API = DefineAPI<{
  parseOpenAPISchema: typeof parseOpenAPISchema;
  generateTestCases: typeof generateTestCases;
  executeTest: typeof executeTest;
  runAllTests: typeof runAllTests;
  runSpecificTests: typeof runSpecificTests;
  runSingleTest: typeof runSingleTest;
  validateSchema: typeof validateSchema;
  getSchemaInfo: typeof getSchemaInfo;
  testHttpRequest: typeof testHttpRequest;
  openTestResultInCaido: typeof openTestResultInCaido;
  sendResultToReplay: typeof sendResultToReplay;
  setEnvironmentVariable: typeof setEnvironmentVariable;
  saveSessionsToDb: typeof saveSessionsToDb;
  loadSessionsFromDb: typeof loadSessionsFromDb;
  saveTestResultsToDb: typeof saveTestResultsToDb;
  loadTestResultsFromDb: typeof loadTestResultsFromDb;
  saveGlobalSettingsToDb: typeof saveGlobalSettingsToDb;
  loadGlobalSettingsFromDb: typeof loadGlobalSettingsFromDb;
  logDatabaseContents: typeof logDatabaseContents;
  migrateFromLocalStorage: typeof migrateFromLocalStorage;
  getAllSessionProjectKeys: typeof getAllSessionProjectKeys;
  isMigrationCompleted: typeof isMigrationCompleted;
}>;

export function init(sdk: SDK<API>) {
  // Initialize database table
  (async () => {
    try {
      const db = await sdk.meta.db();
      await db.exec(`
        CREATE TABLE IF NOT EXISTS config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
    } catch (error) {
      console.error('Failed to initialize database:', error);
    }
  })();

  sdk.api.register("parseOpenAPISchema", parseOpenAPISchema);
  sdk.api.register("generateTestCases", generateTestCases);
  sdk.api.register("executeTest", executeTest);
  sdk.api.register("runAllTests", runAllTests);
  sdk.api.register("runSpecificTests", runSpecificTests);
  sdk.api.register("runSingleTest", runSingleTest);
  sdk.api.register("validateSchema", validateSchema);
  sdk.api.register("getSchemaInfo", getSchemaInfo);
  sdk.api.register("testHttpRequest", testHttpRequest);
  sdk.api.register("openTestResultInCaido", openTestResultInCaido);
  sdk.api.register("sendResultToReplay", sendResultToReplay);
  sdk.api.register("setEnvironmentVariable", setEnvironmentVariable);
  sdk.api.register("saveSessionsToDb", saveSessionsToDb);
  sdk.api.register("loadSessionsFromDb", loadSessionsFromDb);
  sdk.api.register("saveTestResultsToDb", saveTestResultsToDb);
  sdk.api.register("loadTestResultsFromDb", loadTestResultsFromDb);
  sdk.api.register("saveGlobalSettingsToDb", saveGlobalSettingsToDb);
  sdk.api.register("loadGlobalSettingsFromDb", loadGlobalSettingsFromDb);
  sdk.api.register("logDatabaseContents", logDatabaseContents);
  sdk.api.register("migrateFromLocalStorage", migrateFromLocalStorage);
  sdk.api.register("getAllSessionProjectKeys", getAllSessionProjectKeys);
  sdk.api.register("isMigrationCompleted", isMigrationCompleted);
}

// Set environment variable using backend SDK
async function setEnvironmentVariable(sdk: SDK, options: { name: string; value: string; secret?: boolean; global?: boolean }) {
  try {
    // Validate required parameters
    if (!options || typeof options !== 'object') {
      throw new Error('Options parameter is required and must be an object');
    }
    if (!options.name || typeof options.name !== 'string') {
      throw new Error('Environment variable name is required and must be a string');
    }
    if (!options.value || typeof options.value !== 'string') {
      throw new Error('Environment variable value is required and must be a string');
    }
    
    await sdk.env.setVar({
      name: options.name,
      value: options.value,
      secret: options.secret || false,
      global: options.global || false
    });
    
    return { success: true, value: options.value };
  } catch (error) {
    console.error('Failed to set environment variable:', error);
    return { success: false, error: error.message };
  }
}

