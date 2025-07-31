import type { DefineAPI, SDK } from "caido:plugin";
import { RequestSpec } from "caido:utils";

// Add global type declarations for setTimeout
declare global {
  function setTimeout(callback: (...args: any[]) => void, ms: number): number;
}

interface OpenAPISchema {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, Record<string, any>>;
  components?: {
    schemas?: Record<string, any>;
  };
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
  originalPath?: string;
}

interface TestResult {
  testCase: TestCase;
  success: boolean;
  status: number;
  responseTime: number;
  error?: string;
  response?: any;
}

interface TestOptions {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
  workers?: number;
  delayBetweenRequests?: number;
}

const parseOpenAPISchema = (sdk: SDK, schemaText: string): OpenAPISchema => {
  try {
    const schema = JSON.parse(schemaText);
    sdk.console.log("OpenAPI schema parsed successfully");
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
          method.toLowerCase() === 'put' || method.toLowerCase() === 'delete') {
        
        // Extract path variables from the path
        const pathVariables = extractPathVariables(path);
        
        const testCase: TestCase = {
          path,
          method: method.toUpperCase(),
          name: `${method.toUpperCase()} ${path}`,
          description: operation.summary || operation.description || `Test ${method.toUpperCase()} ${path}`,
          parameters: operation.parameters || [],
          requestBody: operation.requestBody,
          expectedStatus: getExpectedStatus(operation),
          pathVariables,
          originalPath: path
        };
        
        testCases.push(testCase);
      }
    }
  }
  
  sdk.console.log(`Generated ${testCases.length} test cases`);
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

const executeTest = async (sdk: SDK, testCase: TestCase, options: TestOptions, pathVariableValues?: Record<string, string>): Promise<TestResult> => {
  const startTime = Date.now();
  
  try {
    // Replace path variables with actual values
    let finalPath = testCase.path;
    if (pathVariableValues && testCase.pathVariables) {
      for (const variable of testCase.pathVariables) {
        const value = pathVariableValues[variable] || `{${variable}}`;
        finalPath = finalPath.replace(`{${variable}}`, value);
      }
    }
    
    const url = `${options.baseUrl}${finalPath}`;
    
    // Create RequestSpec for Caido HTTP request
    const spec = new RequestSpec(url);
    spec.setMethod(testCase.method);
    
    // Set headers - custom headers from UI replace defaults
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Connection': 'keep-alive',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    };
    
    // Use custom headers if provided, otherwise use defaults
    const headersToUse = options.headers && Object.keys(options.headers).length > 0 
      ? options.headers 
      : defaultHeaders;
    
    // Set all headers
    Object.entries(headersToUse).forEach(([key, value]) => {
      spec.setHeader(key, value);
    });

    // Add request body for POST/PUT requests
    if (testCase.requestBody && (testCase.method === 'POST' || testCase.method === 'PUT')) {
      spec.setBody(JSON.stringify(testCase.requestBody));
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
        if (typeof sentRequest.response.getCode === 'function') {
          statusCode = sentRequest.response.getCode();
        } else if (sentRequest.response.status) {
          statusCode = sentRequest.response.status;
        } else if (sentRequest.response.code) {
          statusCode = sentRequest.response.code;
        } else {
          statusCode = 0;
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
        return {
          testCase,
          success,
          status: statusCode,
          responseTime,
          response: responseData
        };
      } catch (responseError) {
        return {
          testCase,
          success: false,
          status: 0,
          responseTime,
          error: `Response processing error: ${responseError}`
        };
      }
    } else {
      throw new Error('No response received');
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    sdk.console.log(`Test ${testCase.name}: FAIL (0) - ${responseTime}ms - ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    return {
      testCase,
      success: false,
      status: 0,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

const runAllTests = async (sdk: SDK, schemaText: string, baseUrl: string, options: Partial<TestOptions> = {}, pathVariableValues?: Record<string, string[]>): Promise<TestResult[]> => {
  try {
    const schema = parseOpenAPISchema(sdk, schemaText);
    const testCases = generateTestCases(sdk, schema);
    const results: TestResult[] = [];
    
    const workers = options.workers || 1;
    const delayBetweenRequests = options.delayBetweenRequests || 0;
    
    sdk.console.log(`Running ${testCases.length} tests against ${baseUrl} with ${workers} worker(s)`);
    
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
        
        sdk.console.log(`Test ${testCase.name}: completed`);
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
    
    for (const value of values) {
      current[variable] = value;
      generateCombinations(current, index + 1);
    }
  };
  
  generateCombinations({}, 0);
  return combinations;
};

const runSpecificTests = async (sdk: SDK, schemaText: string, baseUrl: string, testNames: string[]): Promise<TestResult[]> => {
  try {
    const schema = parseOpenAPISchema(sdk, schemaText);
    const allTestCases = generateTestCases(sdk, schema);
    const filteredTestCases = allTestCases.filter(testCase => 
      testNames.some(name => testCase.name.includes(name) || testCase.path.includes(name))
    );
    
    const results: TestResult[] = [];
    
    sdk.console.log(`Running ${filteredTestCases.length} filtered tests against ${baseUrl}`);
    
    for (const testCase of filteredTestCases) {
      const result = await executeTest(sdk, testCase, { baseUrl });
      results.push(result);
    }
    
    return results;
  } catch (error) {
    throw new Error(`Failed to run specific tests: ${error}`);
  }
};

const runSingleTest = async (sdk: SDK, testCase: TestCase, baseUrl: string, options: Partial<TestOptions> = {}, pathVariableValues?: Record<string, string>): Promise<TestResult> => {
  try {
    sdk.console.log(`Running single test: ${testCase.name} against ${baseUrl}`);
    const result = await executeTest(sdk, testCase, { ...options, baseUrl }, pathVariableValues);
    
    sdk.console.log(`runSingleTest returning:`, {
      testCase: result.testCase.name,
      success: result.success,
      status: result.status,
      responseTime: result.responseTime,
      hasResponse: result.response !== undefined,
      responseType: typeof result.response
    });
    
    return result;
  } catch (error) {
    throw new Error(`Failed to run single test: ${error}`);
  }
};

const validateSchema = (sdk: SDK, schemaText: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  try {
    const schema = JSON.parse(schemaText);
    
    if (!schema.openapi) {
      errors.push("Missing 'openapi' version field");
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
      
      sdk.console.log(`HTTP Test: ${url} - Status: ${statusCode}`);
      
      return {
        success: statusCode >= 200 && statusCode < 300,
        status: statusCode,
        response: responseBody
      };
    } else {
      throw new Error('No response received');
    }
  } catch (error) {
    sdk.console.log(`HTTP Test Failed: ${url} - ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      success: false,
      status: 0,
      response: error instanceof Error ? error.message : 'Unknown error'
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
}>;

export function init(sdk: SDK<API>) {
  sdk.api.register("parseOpenAPISchema", parseOpenAPISchema);
  sdk.api.register("generateTestCases", generateTestCases);
  sdk.api.register("executeTest", executeTest);
  sdk.api.register("runAllTests", runAllTests);
  sdk.api.register("runSpecificTests", runSpecificTests);
  sdk.api.register("runSingleTest", runSingleTest);
  sdk.api.register("validateSchema", validateSchema);
  sdk.api.register("getSchemaInfo", getSchemaInfo);
  sdk.api.register("testHttpRequest", testHttpRequest);
}
