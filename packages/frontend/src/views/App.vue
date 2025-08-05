<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Card from "primevue/card";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import ProgressSpinner from "primevue/progressspinner";
import Message from "primevue/message";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";
import InputNumber from "primevue/inputnumber";
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";

import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();

// Reactive state
const schemaText = ref("");
const baseUrl = ref("http://localhost:3000");
const workers = ref(10);
const delayBetweenRequests = ref(0);
const timeout = ref(30000);
const useRandomValues = ref(false);
const useParameterFromDefinition = ref(true); // Default to true to use example values
const isLoading = ref(false);
const validationResult = ref<{ valid: boolean; errors: string[] } | null>(null);
const testResults = ref<any[]>([]);
const activeTab = ref(0);
const testCases = ref<any[]>([]);
const isSchemaLoaded = ref(false);
const pathVariableValues = ref<Record<string, string[]>>({});
const bodyVariableValues = ref<Record<string, any>>({});
const runningTests = ref<Set<string>>(new Set());
const sidebarOpen = ref(true);
const customHeaders = ref("");
const variablesExpanded = ref(true);
const stopTestRequested = ref(false);
const expandedResults = ref<Set<string>>(new Set());
const requestResponseTab = ref('request');
const requestEditor = ref<any>(null);
const responseEditor = ref<any>(null);
const currentExpandedId = ref<string | null>(null);
const requestEditorContainers = ref<Map<string, HTMLElement>>(new Map());
const responseEditorContainers = ref<Map<string, HTMLElement>>(new Map());

// HTTPQL state
const httpqlQuery = ref("");
const httpqlResults = ref("");
const isHttpqlRunning = ref(false);
const filteredTestResults = ref<any[]>([]);
const isQueryActive = ref(false);

// Schema definition viewer state
const parsedSchema = ref<any>(null);
const selectedPath = ref("");
const selectedMethod = ref("");
const expandedPaths = ref<Set<string>>(new Set());
const expandedComponents = ref<Set<string>>(new Set());

// Sample OpenAPI schema for testing
const sampleSchema = `{
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
    },
    "/users/{id}": {
      "get": {
        "summary": "Get user by ID",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response"
          }
        }
      }
    }
  }
}`;

// Computed properties
const hasResults = computed(() => {
  return testResults.value.length > 0 || testCases.value.some(tc => tc.result);
});

const passedTests = computed(() => {
  const batchResults = testResults.value.filter(r => r.success).length;
  const individualResults = testCases.value.filter(tc => tc.result && tc.result.success).length;
  return batchResults + individualResults;
});

const failedTests = computed(() => {
  const batchResults = testResults.value.filter(r => !r.success).length;
  const individualResults = testCases.value.filter(tc => tc.result && !tc.result.success).length;
  return batchResults + individualResults;
});

const totalTests = computed(() => {
  const batchResults = testResults.value.length;
  const individualResults = testCases.value.filter(tc => tc.result).length;
  return batchResults + individualResults;
});

const allTestResults = computed(() => {
  const results = [...testResults.value];
  testCases.value.forEach(tc => {
    if (tc.results && tc.results.length > 0) {
      // Add all combination results
      results.push(...tc.results);
    } else if (tc.result) {
      // Fallback to single result for backward compatibility
      results.push(tc.result);
    }
  });
  // Sort by creation date (newest first)
  return results.sort((a, b) => {
    const timestampA = a.timestamp || 0;
    const timestampB = b.timestamp || 0;
    return timestampB - timestampA; // Newest first
  });
});

// Methods
const loadSampleSchema = () => {
  schemaText.value = sampleSchema;
  validateSchema();
};

const loadSchema = async () => {
  if (!schemaText.value.trim()) {
    return;
  }

  try {
    // First validate the schema
    validationResult.value = await sdk.backend.validateSchema(schemaText.value);
    
    if (validationResult.value.valid) {
      // Parse the schema to get the OpenAPI object
      const schema = await sdk.backend.parseOpenAPISchema(schemaText.value);
      
      // Store parsed schema for definition viewer
      parsedSchema.value = schema;
      
      // Generate test cases from the parsed schema
      const cases = await sdk.backend.generateTestCases(schema);
      testCases.value = cases;
      isSchemaLoaded.value = true;
      activeTab.value = 1; // Switch to test cases tab
      
      // Initialize path variables
      const allPathVariables = new Set<string>();
      cases.forEach(testCase => {
        if (testCase.pathVariables) {
          testCase.pathVariables.forEach((variable: string) => {
            allPathVariables.add(variable);
          });
        }
      });
      
      // Initialize path variable values
      pathVariableValues.value = {};
      allPathVariables.forEach(variable => {
        pathVariableValues.value[variable] = [''];
      });
      
      // Initialize body variable values
      bodyVariableValues.value = {};
      cases.forEach(testCase => {
        if (testCase.bodyVariables) {
          console.log(`Found body variables for ${testCase.name}:`, testCase.bodyVariables);
          Object.entries(testCase.bodyVariables).forEach(([key, value]) => {
            bodyVariableValues.value[key] = value;
          });
        }
      });
      
      console.log('Final bodyVariableValues:', bodyVariableValues.value);
      

    }
  } catch (error) {
    console.error("Failed to load schema:", error);
    validationResult.value = { valid: false, errors: [error instanceof Error ? error.message : "Failed to load schema"] };
  }
};

const validateSchema = async () => {
  if (!schemaText.value.trim()) {
    validationResult.value = { valid: false, errors: ["Please enter an OpenAPI schema"] };
    return;
  }

  try {
    validationResult.value = await sdk.backend.validateSchema(schemaText.value);
  } catch (error) {
    validationResult.value = { valid: false, errors: [error instanceof Error ? error.message : "Validation failed"] };
  }
};

const runAllTests = async () => {
  if (!schemaText.value.trim() || !baseUrl.value.trim()) {
    return;
  }

  resetStopFlag();
  isLoading.value = true;
  // Don't clear existing results - append new ones

  try {
    const options = {
      workers: workers.value,
      delayBetweenRequests: delayBetweenRequests.value,
      timeout: timeout.value,
      headers: parseCustomHeaders(),
      parsedSchema: parsedSchema.value, // Pass the parsed schema for example value generation
      useParameterFromDefinition: useParameterFromDefinition.value // Pass the checkbox value
    };
    
    // Get all test cases first
    const schema = await sdk.backend.parseOpenAPISchema(schemaText.value);
    const testCases = await sdk.backend.generateTestCases(schema);
    
    // Process each test case individually to show incremental results
    for (const testCase of testCases) {
      if (stopTestRequested.value) break;
      
      // Generate combinations for this test case
      const variableCombinations = generatePathVariableCombinations(testCase);
      
      if (variableCombinations.length === 0) {
        // No path variables, run single test
        const result = await sdk.backend.runSingleTest(testCase, baseUrl.value, options, {}, bodyVariableValues.value);
        updateTestCaseResult(testCase, result);
      } else {
        // Run test for each combination
        for (const combination of variableCombinations) {
          if (stopTestRequested.value) break;
          
          const result = await sdk.backend.runSingleTest(testCase, baseUrl.value, options, combination, bodyVariableValues.value);
          updateTestCaseResult(testCase, result, combination);
          
          // Add delay between requests if specified
          if (delayBetweenRequests.value > 0 && combination !== variableCombinations[variableCombinations.length - 1]) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenRequests.value));
          }
        }
      }
      
      // Don't auto-switch to results tab - let user stay where they are
    }
    
  } catch (error) {
    console.error("Test execution failed:", error);
  } finally {
    isLoading.value = false;
    resetStopFlag(); // Reset stop flag when tests complete (whether stopped or finished)
  }
};



const runSingleTest = async (testCase: any) => {
  if (!baseUrl.value.trim()) {
    return;
  }

  // Mark test as running
  runningTests.value.add(testCase.name);

  try {
    const options = {
      workers: 1,
      delayBetweenRequests: 0,
      timeout: timeout.value,
      headers: parseCustomHeaders(),
      parsedSchema: parsedSchema.value, // Pass the parsed schema for example value generation
      useParameterFromDefinition: useParameterFromDefinition.value // Pass the checkbox value
    };
    
    // Get all combinations of path variable values
    const variableCombinations = generatePathVariableCombinations(testCase);
    
    if (variableCombinations.length === 0) {
      // No path variables or no values, run single test
      const result = await sdk.backend.runSingleTest(testCase, baseUrl.value, options, {}, bodyVariableValues.value);
      updateTestCaseResult(testCase, result);
    } else {
      // Run test for each combination
      for (let i = 0; i < variableCombinations.length; i++) {
        const combination = variableCombinations[i];
        if (stopTestRequested.value) break;
        
        const result = await sdk.backend.runSingleTest(testCase, baseUrl.value, options, combination, bodyVariableValues.value);
        updateTestCaseResult(testCase, result, combination);
        
        // Add delay between requests if specified
        if (delayBetweenRequests.value > 0 && i < variableCombinations.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenRequests.value));
        }
      }
    }
  } catch (error) {
    console.error("Single test execution failed:", error);
  } finally {
    // Mark test as not running
    runningTests.value.delete(testCase.name);
    resetStopFlag(); // Reset stop flag when single test completes
  }
};

const generateRandomString = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const generatePathVariableCombinations = (testCase: any): Record<string, string>[] => {
  if (!testCase.pathVariables || testCase.pathVariables.length === 0) {
    return [];
  }
  
  const combinations: Record<string, string>[] = [];
  const variables = testCase.pathVariables;
  const valuesPerVariable: string[][] = [];
  
  // Get all values for each variable
  for (const variable of variables) {
    const values = pathVariableValues.value[variable] || [''];
    const nonEmptyValues = values.filter(v => v.trim() !== '');
    
    if (nonEmptyValues.length === 0) {
      if (useRandomValues.value) {
        // Use random string for empty variables when random values is enabled
        valuesPerVariable.push([generateRandomString()]);
      } else {
        // If no values provided, use empty string
        valuesPerVariable.push(['']);
      }
    } else {
      valuesPerVariable.push(nonEmptyValues);
    }
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

const updateTestCaseResult = (testCase: any, result: any, combination?: Record<string, string>) => {
  const index = testCases.value.findIndex(tc => tc.name === testCase.name);
  if (index !== -1) {
    // Initialize results array if it doesn't exist
    if (!testCases.value[index].results) {
      testCases.value[index].results = [];
    }
    

    
    // Add the result with combination info
    const resultWithCombination = {
      ...result,
      combination: combination || {},
      timestamp: new Date().toISOString()
    };
    
    testCases.value[index].results.push(resultWithCombination);
    
    // Also store the last result for backward compatibility
    testCases.value[index].result = result;
  }
};

const getStatusIcon = (success: boolean) => {
  return success ? "✅" : "❌";
};

const getStatusClass = (success: boolean) => {
  return success ? "text-green-600" : "text-red-600";
};

const formatResponseTime = (time: number) => {
  return `${time}ms`;
};

const getResponseSize = (response: any) => {
  try {
    const length = getResponseLength(response);
    if (typeof length === 'string') {
      return length; // Return error message as is
    }
    
    if (length === 0) {
      return '0 bytes';
    } else if (length < 1024) {
      return `${length} bytes`;
    } else if (length < 1024 * 1024) {
      return `${(length / 1024).toFixed(1)} KB`;
    } else {
      return `${(length / (1024 * 1024)).toFixed(1)} MB`;
    }
  } catch (error) {
    return 'Error calculating size';
  }
};

const getResponseLength = (response: any) => {
  try {
    if (typeof response === 'string') {
      return response.length;
    } else if (response && typeof response === 'object') {
      return JSON.stringify(response).length;
    } else {
      return String(response).length;
    }
  } catch (error) {
    return 'Error calculating length';
  }
};

const getHostFromUrl = (url: string): string => {
  try {
    // Remove protocol if present
    const urlWithoutProtocol = url.replace(/^https?:\/\//, '');
    // Get everything before the first slash or colon
    const host = urlWithoutProtocol.split(/[/:]/)[0];
    return host || 'localhost';
  } catch (error) {
    return 'localhost';
  }
};

const setRequestEditorContainer = (el: HTMLElement | null, resultId: string) => {
  if (el) {
    requestEditorContainers.value.set(resultId, el);
  }
};

const setResponseEditorContainer = (el: HTMLElement | null, resultId: string) => {
  if (el) {
    responseEditorContainers.value.set(resultId, el);
  }
};

const createNativeCaidoEditors = (testResult: any) => {
  try {
    const resultId = getResultId(testResult);
    
    // Get the containers for this specific result
    const requestContainer = requestEditorContainers.value.get(resultId);
    const responseContainer = responseEditorContainers.value.get(resultId);
    
    // Wait a bit for containers to be available
    if (!requestContainer || !responseContainer) {
      setTimeout(() => createNativeCaidoEditors(testResult), 100);
      return;
    }
    
    // Ensure containers are empty before creating new editors
    requestContainer.innerHTML = '';
    responseContainer.innerHTML = '';

    // Create request editor
    if (requestContainer) {
      requestContainer.classList.add('request-editor-container');
      const requestContent = formatRequestForCaido(testResult);
      
      try {
        // Try different possible SDK method names
        let requestEditorInstance;
        if (sdk.ui.httpRequestEditor) {
          requestEditorInstance = sdk.ui.httpRequestEditor();
        } else if (sdk.ui.createHttpRequestEditor) {
          requestEditorInstance = sdk.ui.createHttpRequestEditor();
        } else if (sdk.ui.requestEditor) {
          requestEditorInstance = sdk.ui.requestEditor();
        } else {
          return;
        }
        
        const requestElement = requestEditorInstance.getElement();
        requestContainer.appendChild(requestElement);
        
        // Set request content with delay to ensure editor is ready
        setTimeout(() => {
          try {
            const requestView = requestEditorInstance?.getEditorView();
            if (requestView) {
              requestView.dispatch({
                changes: {
                  from: 0,
                  to: requestView.state.doc.length,
                  insert: requestContent,
                },
              });
            }
          } catch (e) {
            // Silent fail
          }
        }, 200);
      } catch (e) {
        // Silent fail
      }
    }

    // Create response editor
    if (responseContainer) {
      responseContainer.classList.add('response-editor-container');
      const responseContent = formatResponseForCaido(testResult);
      
      try {
        // Try different possible SDK method names
        let responseEditorInstance;
        if (sdk.ui.httpResponseEditor) {
          responseEditorInstance = sdk.ui.httpResponseEditor();
        } else if (sdk.ui.createHttpResponseEditor) {
          responseEditorInstance = sdk.ui.createHttpResponseEditor();
        } else if (sdk.ui.responseEditor) {
          responseEditorInstance = sdk.ui.responseEditor();
        } else {
          return;
        }
        
        const responseElement = responseEditorInstance.getElement();
        responseContainer.appendChild(responseElement);
        
        // Set response content with delay to ensure editor is ready
        setTimeout(() => {
          try {
            const responseView = responseEditorInstance?.getEditorView();
            if (responseView) {
              responseView.dispatch({
                changes: {
                  from: 0,
                  to: responseView.state.doc.length,
                  insert: responseContent,
                },
              });
            }
          } catch (e) {
            // Silent fail
          }
        }, 200);
      } catch (e) {
        // Silent fail
      }
    }
  } catch (error) {
    console.error('Failed to create native Caido editors:', error);
  }
};

const formatRequestForCaido = (testResult: any): string => {
  const { testCase, combination } = testResult;
  
  // Replace path variables in the URL
  let finalPath = testCase.path;
  if (combination && Object.keys(combination).length > 0) {
    Object.entries(combination).forEach(([key, value]) => {
      finalPath = finalPath.replace(`{${key}}`, value);
    });
  }
  
  let request = `${testCase.method} ${finalPath} HTTP/1.1\r\n`;
  request += `Host: ${getHostFromUrl(baseUrl.value)}\r\n`;
  request += `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`;
  request += `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8\r\n`;
  request += `Accept-Language: en-US,en;q=0.9\r\n`;
  request += `Accept-Encoding: gzip, deflate, br\r\n`;
  request += `Connection: keep-alive\r\n`;
  request += `Upgrade-Insecure-Requests: 1\r\n`;
  
  request += '\r\n';
  
  // Add request body if present
  if (testCase.requestBody) {
    // Use the actual body that was sent, not the schema reference
    let bodyToShow = testCase.requestBody;
    
    // First, try to get the actual body from the test result
    console.log('formatRequestForCaido - testResult:', testResult);
    console.log('formatRequestForCaido - testResult.actualBody:', testResult?.actualBody);
    
    if (testResult && testResult.actualBody) {
      bodyToShow = testResult.actualBody;
      console.log('Using actualBody from testResult:', bodyToShow);
    } else if (testCase.bodyVariables && Object.keys(testCase.bodyVariables).length > 0) {
      // Fallback to body variables if actual body not available
      bodyToShow = testCase.bodyVariables;
      console.log('Using bodyVariables from testCase:', bodyToShow);
    } else {
      console.log('Using original requestBody:', bodyToShow);
    }
    
    request += JSON.stringify(bodyToShow, null, 2);
  }
  
  return request;
};

const formatResponseForCaido = (testResult: any): string => {
  const { status, response, error } = testResult;
  
  let responseText = `HTTP/1.1 ${status}\r\n`;
  responseText += `Content-Type: application/json\r\n`;
  responseText += `Content-Length: ${getResponseLength(response)}\r\n`;
  responseText += `Date: ${new Date().toUTCString()}\r\n`;
  responseText += `Server: nginx/1.18.0\r\n`;
  responseText += `Access-Control-Allow-Origin: *\r\n`;
  responseText += `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n`;
  responseText += `Access-Control-Allow-Headers: Content-Type, Authorization\r\n`;
  responseText += '\r\n';
  
  if (error) {
    responseText += `Error: ${error}`;
  } else if (response !== undefined && response !== null) {
    if (typeof response === 'object') {
      responseText += JSON.stringify(response, null, 2);
    } else {
      responseText += String(response);
    }
  } else {
    responseText += 'No response body';
  }
  
  return responseText;
};

const formatResponseBody = (response: any) => {
  try {
    if (typeof response === 'string') {
      // Check if it's XML
      if (response.trim().startsWith('<?xml') || response.trim().startsWith('<')) {
        // Format XML with indentation
        return formatXML(response);
      } else {
        return response;
      }
    } else if (response && typeof response === 'object') {
      // Return JSON as formatted string
      return JSON.stringify(response, null, 2);
    } else {
      return String(response);
    }
  } catch (error) {
    return `Error formatting response: ${error}`;
  }
};

const formatXML = (xmlString: string) => {
  // Format XML with proper indentation
  let formatted = '';
  let indent = 0;
  const indentSize = 2;
  
  // Split by tags but preserve them
  const parts = xmlString.split(/(<\/?[^>]+>)/);
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    if (trimmed.startsWith('<?xml')) {
      // XML declaration
      formatted += ' '.repeat(indent) + trimmed + '\n';
    } else if (trimmed.startsWith('</')) {
      // Closing tag - reduce indent first
      indent = Math.max(0, indent - indentSize);
      formatted += ' '.repeat(indent) + trimmed + '\n';
    } else if (trimmed.startsWith('<') && !trimmed.endsWith('/>')) {
      // Opening tag
      formatted += ' '.repeat(indent) + trimmed + '\n';
      indent += indentSize;
    } else if (trimmed.endsWith('/>')) {
      // Self-closing tag
      formatted += ' '.repeat(indent) + trimmed + '\n';
    } else {
      // Text content
      if (trimmed) {
        formatted += ' '.repeat(indent) + trimmed + '\n';
      }
    }
  }
  
  return formatted.trim();
};

const isJSONResponse = (response: any) => {
  return response && typeof response === 'object' && !Array.isArray(response);
};

const formatResponseBodyWithHighlighting = (response: any) => {
  try {
    if (typeof response === 'string') {
      return response;
    } else if (response && typeof response === 'object') {
      // For JSON, add syntax highlighting
      const jsonString = JSON.stringify(response, null, 2);
      return jsonString
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"([^"]+)":/g, '<span class="text-yellow-400">"$1"</span>:')
        .replace(/: "([^"]*)"/g, ': <span class="text-blue-300">"$1"</span>')
        .replace(/: (\d+)/g, ': <span class="text-green-400">$1</span>')
        .replace(/: (true|false|null)/g, ': <span class="text-purple-400">$1</span>');
    } else {
      return String(response);
    }
  } catch (error) {
    return `Error formatting response: ${error}`;
  }
};

const getTestStatus = (testCase: any) => {
  if (!testCase.result) return null;
  return {
    success: testCase.result.success,
    status: testCase.result.status,
    responseTime: testCase.result.responseTime,
    error: testCase.result.error
  };
};

const hasPathVariables = (testCase: any) => {
  return testCase.pathVariables && testCase.pathVariables.length > 0;
};

const getPathVariableValue = (variable: string) => {
  return pathVariableValues.value[variable] || [''];
};

const setPathVariableValue = (variable: string, values: string[]) => {
  pathVariableValues.value[variable] = values;
};

const addPathVariableValue = (variable: string) => {
  if (!pathVariableValues.value[variable]) {
    pathVariableValues.value[variable] = [''];
  } else {
    pathVariableValues.value[variable].push('');
  }
};

const removePathVariableValue = (variable: string, index: number) => {
  if (pathVariableValues.value[variable] && pathVariableValues.value[variable].length > 1) {
    pathVariableValues.value[variable].splice(index, 1);
  }
};

const isTestRunning = (testCase: any) => {
  return runningTests.value.has(testCase.name);
};

const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value;
};

const getUniquePathVariables = () => {
  const variables = new Set<string>();
  testCases.value.forEach(testCase => {
    if (testCase.pathVariables) {
      testCase.pathVariables.forEach((variable: string) => {
        variables.add(variable);
      });
    }
  });
  return Array.from(variables).sort();
};

const toggleVariables = () => {
  variablesExpanded.value = !variablesExpanded.value;
};

const toggleResultExpansion = (resultId: string) => {
  if (expandedResults.value.has(resultId)) {
    // If clicking on already expanded result, close it
    expandedResults.value.delete(resultId);
  } else {
    // If expanding a new result, close all others first (only one expanded at a time)
    expandedResults.value.clear();
    expandedResults.value.add(resultId);
  }
};

const isResultExpanded = (resultId: string) => {
  return expandedResults.value.has(resultId);
};

const getResultId = (data: any) => {
  // Create a unique ID for each result
  const baseId = `${data.testCase.name}-${data.testCase.method}-${data.testCase.path}`;
  let resultId = baseId;
  
  if (data.combination) {
    const combinationStr = Object.entries(data.combination)
      .map(([key, value]) => `${key}=${value}`)
      .join('-');
    resultId = `${baseId}-${combinationStr}`;
  }
  
  // Add timestamp to make each execution unique
  if (data.timestamp) {
    resultId = `${resultId}-${data.timestamp}`;
  } else {
    // Fallback: use current timestamp if not available
    resultId = `${resultId}-${Date.now()}`;
  }
  
  return resultId;
};

const parseCustomHeaders = (): Record<string, string> => {
  if (!customHeaders.value.trim()) return {};
  
  const headers: Record<string, string> = {};
  const lines = customHeaders.value.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && trimmedLine.includes(':')) {
      const [key, ...valueParts] = trimmedLine.split(':');
      const value = valueParts.join(':').trim();
      if (key && value) {
        headers[key.trim()] = value;
      }
    }
  }
  
  return headers;
};

const stopAllTests = () => {
  stopTestRequested.value = true;
  runningTests.value.clear();
  isLoading.value = false;
  // Note: resetStopFlag() will be called in the finally block of runAllTests
};

const resetStopFlag = () => {
  stopTestRequested.value = false;
};

const runHttpqlQuery = async () => {
  if (!httpqlQuery.value.trim()) {
    return;
  }

  isHttpqlRunning.value = true;
  httpqlResults.value = "";

  try {
    // Try to use GraphQL to query HTTP data (alternative to HTTPQL)
    if (sdk.graphql && typeof sdk.graphql.query === 'function') {
      try {
        // Try to query HTTP history data using GraphQL
        const query = `
          query {
            httpHistory {
              requests {
                id
                method
                url
                statusCode
                responseTime
                timestamp
              }
            }
          }
        `;
        const result = await sdk.graphql.query(query);
        httpqlResults.value = JSON.stringify(result, null, 2);
      } catch (graphqlError) {
        // If GraphQL doesn't work, try to filter the results based on the HTTPQL-like query
        await filterTestResultsByQuery();
      }
    } else {
      // Fallback: filter test results based on the query
      await filterTestResultsByQuery();
    }
  } catch (error) {
    httpqlResults.value = `Error running query: ${error instanceof Error ? error.message : String(error)}\n\nQuery: ${httpqlQuery.value}`;
  } finally {
    isHttpqlRunning.value = false;
  }
};

const filterTestResultsByQuery = async () => {
  const query = httpqlQuery.value.toLowerCase();
  
  // Simple query parser for common HTTPQL-like patterns
  if (query.includes('resp.code') || query.includes('status')) {
    // Filter by status code
    const statusMatch = query.match(/(?:resp\.code|status)\s*\.?\s*(?:eq|==|=)?\s*:?\s*(\d+)/);
    if (statusMatch) {
      const targetStatus = parseInt(statusMatch[1]);
      const filteredResults = allTestResults.value.filter(result => result.status === targetStatus);
      filteredTestResults.value = filteredResults;
      isQueryActive.value = true;
      httpqlResults.value = `Filtered results for status code ${targetStatus} (${filteredResults.length} results)`;
    } else {
      httpqlResults.value = `Query pattern recognized but no status code found.\n\nQuery: ${httpqlQuery.value}\n\nTry: resp.code.eq:200 or status:200`;
      isQueryActive.value = false;
    }
  } else if (query.includes('method')) {
    // Filter by HTTP method
    const methodMatch = query.match(/method\s*\.?\s*(?:eq|==|=)?\s*:?\s*(get|post|put|delete|patch)/i);
    if (methodMatch) {
      const targetMethod = methodMatch[1].toUpperCase();
      const filteredResults = allTestResults.value.filter(result => result.testCase.method === targetMethod);
      filteredTestResults.value = filteredResults;
      isQueryActive.value = true;
      httpqlResults.value = `Filtered results for method ${targetMethod} (${filteredResults.length} results)`;
    } else {
      httpqlResults.value = `Query pattern recognized but no method found.\n\nQuery: ${httpqlQuery.value}\n\nTry: method.eq:GET or method:POST`;
      isQueryActive.value = false;
    }
  } else if (query.includes('url') || query.includes('path')) {
    // Filter by URL/path
    const urlMatch = query.match(/(?:url|path)\s*\.?\s*(?:eq|==|=)?\s*:?\s*["']?([^"']+)["']?/);
    if (urlMatch) {
      const targetPath = urlMatch[1];
      const filteredResults = allTestResults.value.filter(result => 
        result.testCase.path.toLowerCase().includes(targetPath.toLowerCase())
      );
      filteredTestResults.value = filteredResults;
      isQueryActive.value = true;
      httpqlResults.value = `Filtered results for path containing "${targetPath}" (${filteredResults.length} results)`;
    } else {
      httpqlResults.value = `Query pattern recognized but no path found.\n\nQuery: ${httpqlQuery.value}\n\nTry: url.eq:"/users" or path:"/api"`;
      isQueryActive.value = false;
    }
  } else {
    // Show all results if no specific filter is applied
    filteredTestResults.value = allTestResults.value;
    isQueryActive.value = true;
    httpqlResults.value = `Showing all test results (${allTestResults.value.length} results)`;
  }
};

const clearQuery = () => {
  httpqlQuery.value = "";
  httpqlResults.value = "";
  filteredTestResults.value = [];
  isQueryActive.value = false;
};



// Schema definition viewer helper functions
const togglePathExpansion = (path: string) => {
  if (expandedPaths.value.has(path)) {
    expandedPaths.value.delete(path);
  } else {
    expandedPaths.value.add(path);
  }
};

const toggleComponentExpansion = (componentName: string) => {
  if (expandedComponents.value.has(componentName)) {
    expandedComponents.value.delete(componentName);
  } else {
    expandedComponents.value.add(componentName);
  }
};

const isPathExpanded = (path: string) => {
  return expandedPaths.value.has(path);
};

const isComponentExpanded = (componentName: string) => {
  return expandedComponents.value.has(componentName);
};

const getMethodColor = (method: string) => {
  const colors = {
    get: 'bg-green-500 text-white dark:bg-green-600 dark:text-green-100',
    post: 'bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100',
    put: 'bg-orange-500 text-white dark:bg-orange-600 dark:text-orange-100',
    delete: 'bg-red-500 text-white dark:bg-red-600 dark:text-red-100',
    patch: 'bg-purple-500 text-white dark:bg-purple-600 dark:text-purple-100'
  };
  return colors[method.toLowerCase() as keyof typeof colors] || 'bg-gray-500 text-white dark:bg-gray-600 dark:text-gray-100';
};

const formatSchemaType = (schema: any) => {
  if (!schema) return 'any';
  
  // Handle $ref (schema references)
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    return `ref: ${refName}`;
  }
  
  // Handle basic types
  if (schema.type) {
    let typeStr = schema.type;
    
    // Add format if available
    if (schema.format) {
      typeStr += ` (${schema.format})`;
    }
    
    // Add array information
    if (schema.type === 'array' && schema.items) {
      const itemType = formatSchemaType(schema.items);
      typeStr = `array of ${itemType}`;
    }
    
    // Add object information
    if (schema.type === 'object') {
      if (schema.properties) {
        const propCount = Object.keys(schema.properties).length;
        typeStr = `object (${propCount} properties)`;
      } else if (schema.additionalProperties) {
        typeStr = `object with additional properties`;
      }
    }
    
    return typeStr;
  }
  
  // Handle complex schemas
  if (schema.oneOf) return 'oneOf';
  if (schema.allOf) return 'allOf';
  if (schema.anyOf) return 'anyOf';
  if (schema.not) return 'not';
  
  // Handle enums
  if (schema.enum) {
    return `enum (${schema.enum.length} values)`;
  }
  
  // Default fallback
  return 'object';
};

const getSchemaDescription = (schema: any) => {
  if (schema.description) return schema.description;
  if (schema.summary) return schema.summary;
  return '';
};

// Find possible object definitions that might match a generic parameter
const findPossibleObjectDefinitions = (schema: any, context?: any): any[] => {
  const definitions = parsedSchema.value?.definitions || {};
  const schemas = parsedSchema.value?.components?.schemas || {};
  
  // Look for definitions that have properties (not just additionalProperties)
  const candidates: any[] = [];
  
  // First, try to find definitions that might be referenced by the schema
  if (schema && schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    const refSchema = definitions[refName] || schemas[refName];
    if (refSchema && refSchema.properties && Object.keys(refSchema.properties).length > 0) {
      candidates.push(refSchema);
    }
  }
  
  // If context is provided, try to find definitions that match the context
  if (context && context.path) {
    const pathKeywords = context.path.toLowerCase().split(/[\/\-_]/).filter(k => k.length > 2);
    const nameKeywords = context.name ? context.name.toLowerCase().split(/[\s\-_]/).filter(k => k.length > 2) : [];
    const allKeywords = [...pathKeywords, ...nameKeywords];
    
    // Check definitions (Swagger 2.0)
    for (const [name, def] of Object.entries(definitions)) {
      if (def && typeof def === 'object' && def.properties && Object.keys(def.properties).length > 0) {
        // Check if the definition name contains any keywords from the context
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
        // Check if the schema name contains any keywords from the context
        const nameLower = name.toLowerCase();
        const hasMatchingKeyword = allKeywords.some(keyword => nameLower.includes(keyword));
        
        if (hasMatchingKeyword) {
          candidates.push(schema);
        }
      }
    }
  }
  
  // If no contextual matches found, fall back to all definitions but prioritize by relevance
  if (candidates.length === 0) {
    for (const [name, def] of Object.entries(definitions)) {
      if (def && typeof def === 'object' && def.properties && Object.keys(def.properties).length > 0) {
        candidates.push(def);
      }
    }
    
    for (const [name, schema] of Object.entries(schemas)) {
      if (schema && typeof schema === 'object' && schema.properties && Object.keys(schema.properties).length > 0) {
        candidates.push(schema);
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

// Generate example value for schema (like Swagger UI)
const generateExampleValue = (schema: any, depth: number = 0): any => {
  if (depth > 10) return '...'; // Much higher limit for complex schemas
  
  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    // Try to find the referenced schema
    const refSchema = parsedSchema.value?.components?.schemas?.[refName] || 
                     parsedSchema.value?.definitions?.[refName];
    if (refSchema) {
      return generateExampleValue(refSchema, depth + 1);
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
          const itemExample = generateExampleValue(schema.items, depth + 1);
          return [itemExample];
        }
        return [];
      case 'object':
        if (schema.properties) {
          const obj: any = {};
          for (const [propName, propSchema] of Object.entries(schema.properties)) {
            obj[propName] = generateExampleValue(propSchema as any, depth + 1);
          }
          return obj;
        }
        if (schema.additionalProperties) {
          // For additionalProperties in Definition tab, just generate a realistic example
          // without trying to find a "better" definition, since we want to show the actual schema
          const additionalPropType = generateExampleValue(schema.additionalProperties, depth + 1);
          return {
            'id': typeof additionalPropType === 'number' ? 1 : 'example',
            'name': typeof additionalPropType === 'string' ? 'example' : 'Example Name',
            'value': additionalPropType,
            'enabled': typeof additionalPropType === 'boolean' ? true : false
          };
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

// Format example value as JSON string
const formatExampleValue = (schema: any): string => {
  try {
    const example = generateExampleValue(schema);
    return JSON.stringify(example, null, 2);
  } catch (error) {
    return '{}';
  }
};

// Watch for expanded results to create native Caido editors
watch(expandedResults, (newExpanded) => {
  
  // Clear all container contents to ensure clean state
  for (const container of requestEditorContainers.value.values()) {
    container.innerHTML = '';
  }
  for (const container of responseEditorContainers.value.values()) {
    container.innerHTML = '';
  }
  
  if (newExpanded.size > 0) {
    // Since only one result can be expanded at a time, get the first (and only) one
    const expandedId = Array.from(newExpanded)[0];
    
    // Find the test result in all available arrays
    

    
    // Try to find the result in allTestResults, testResults, and filteredTestResults
    let testResult = allTestResults.value.find(result => getResultId(result) === expandedId);
    if (!testResult) {
      testResult = testResults.value.find(result => getResultId(result) === expandedId);
    }
    if (!testResult) {
      testResult = filteredTestResults.value.find(result => getResultId(result) === expandedId);
    }
    
    if (testResult) {
      // Use nextTick to ensure DOM is updated, then create editors
      nextTick(() => {
        setTimeout(() => {
          createNativeCaidoEditors(testResult);
        }, 100); // Increased delay to ensure DOM is fully ready
      });
    }
  }
}, { deep: true });

// Add keyboard shortcuts for Repeater and Replay
const setupKeyboardShortcuts = () => {
  const handleKeyDown = (event: KeyboardEvent) => {
    // Only handle shortcuts when on the Results tab
    if (activeTab.value !== 3) return; // Results tab is index 3
    
    // Check if the event target is within a request or response editor
    const target = event.target as HTMLElement;
    const isInEditor = target.closest('.request-editor-container') || target.closest('.response-editor-container');
    
    if (!isInEditor) return; // Only work when clicking on editors
    
    // Ctrl+R or Cmd+R to send to Repeater
    if ((event.ctrlKey || event.metaKey) && event.key === 'r' && !event.shiftKey) {
      event.preventDefault();
      sendToRepeater();
    }
    
    // Ctrl+Shift+R or Cmd+Shift+R to send to Replay
    if ((event.ctrlKey || event.metaKey) && event.key === 'R' && event.shiftKey) {
      event.preventDefault();
      sendToReplay();
    }
  };
  
  document.addEventListener('keydown', handleKeyDown);
  
  // Cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
};

// Send current expanded result to Repeater
const sendToRepeater = () => {
  const expandedId = Array.from(expandedResults.value)[0];
  if (!expandedId) {
    return;
  }
  
  let testResult = allTestResults.value.find(result => getResultId(result) === expandedId);
  if (!testResult) {
    testResult = testResults.value.find(result => getResultId(result) === expandedId);
  }
  if (!testResult) {
    testResult = filteredTestResults.value.find(result => getResultId(result) === expandedId);
  }
  
  if (testResult) {
    try {
      sdk.shortcuts.sendToRepeater();
    } catch (error) {
      // Silent fail
    }
  }
};

// Send current expanded result to Replay
const sendToReplay = () => {
  const expandedId = Array.from(expandedResults.value)[0];
  if (!expandedId) {
    return;
  }
  
  let testResult = allTestResults.value.find(result => getResultId(result) === expandedId);
  if (!testResult) {
    testResult = testResults.value.find(result => getResultId(result) === expandedId);
  }
  if (!testResult) {
    testResult = filteredTestResults.value.find(result => getResultId(result) === expandedId);
  }
  
  if (testResult) {
    try {
      sdk.shortcuts.sendToReplay();
    } catch (error) {
      // Silent fail
    }
  }
};

// Setup keyboard shortcuts when component mounts
onMounted(() => {
  const cleanup = setupKeyboardShortcuts();
  
  // Cleanup on unmount
  onUnmounted(() => {
    cleanup();
  });
});

// Persist results in localStorage to prevent loss when switching tabs
const saveResultsToStorage = () => {
  try {
    const dataToSave = {
      allTestResults: allTestResults.value,
      testResults: testResults.value,
      filteredTestResults: filteredTestResults.value,
      timestamp: Date.now()
    };
    localStorage.setItem('openapi-testing-results', JSON.stringify(dataToSave));
  } catch (error) {
    // Silent fail if localStorage is not available
  }
};

const loadResultsFromStorage = () => {
  try {
    const saved = localStorage.getItem('openapi-testing-results');
    if (saved) {
      const data = JSON.parse(saved);
      // Only load if data is recent (within last hour)
      if (data.timestamp && (Date.now() - data.timestamp) < 3600000) {
        allTestResults.value = data.allTestResults || [];
        testResults.value = data.testResults || [];
        filteredTestResults.value = data.filteredTestResults || [];
      }
    }
  } catch (error) {
    // Silent fail if localStorage is not available
  }
};

// Save results whenever they change
watch([allTestResults, testResults, filteredTestResults], () => {
  saveResultsToStorage();
}, { deep: true });

// Load results on mount
onMounted(() => {
  loadResultsFromStorage();
});
</script>

<template>
  <div class="h-full flex flex-col relative overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div>
        <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-200">OpenAPI Tester</h1>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Test your OpenAPI schemas with real HTTP requests
        </p>
    </div>
      <div class="flex items-center gap-2">
        <Button 
          v-if="isSchemaLoaded && (getUniquePathVariables().length > 0 || Object.keys(bodyVariableValues).length > 0)"
          :label="sidebarOpen ? 'Hide Variables' : 'Variables'"
          @click="toggleSidebar"
          severity="secondary"
          size="small"
          :icon="sidebarOpen ? 'pi pi-chevron-left' : 'pi pi-chevron-right'"
        />
  </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Main Content -->
      <div class="flex-1 overflow-y-auto transition-all duration-300 ease-in-out">
        <div class="p-4">
        <TabView v-model:activeIndex="activeTab" class="h-full">
          <!-- Schema Input Tab -->
          <TabPanel header="Input">
            <div class="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h3 class="font-semibold text-blue-800 dark:text-blue-200 mb-2">Step 1: Input Your Schema</h3>
              <p class="text-sm text-blue-700 dark:text-blue-300">
                Paste your OpenAPI schema (JSON format) here. The schema will be validated and test cases will be generated.
              </p>
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-2">Base URL</label>
                <InputText 
                  v-model="baseUrl" 
                  placeholder="http://localhost:3000"
                  class="w-full"
                />
              </div>
              
              <div>
                <label class="block text-sm font-medium mb-2">OpenAPI Schema (JSON)</label>
                <Textarea 
                  v-model="schemaText" 
                  placeholder="Paste your OpenAPI schema here..."
                  class="w-full h-64 font-mono text-sm"
                  @input="validateSchema"
                />
              </div>

              <!-- Validation Results -->
              <div v-if="validationResult">
                <Message 
                  :severity="validationResult.valid ? 'success' : 'error'"
                  :closable="false"
                >
                  <template #messageicon>
                    <i :class="validationResult.valid ? 'pi pi-check' : 'pi pi-exclamation-triangle'"></i>
</template>
                  <div>
                    <div class="font-semibold">
                      {{ validationResult.valid ? 'Schema is valid!' : 'Schema validation failed' }}
                    </div>
                    <div v-if="validationResult.errors.length > 0" class="mt-2">
                      <div v-for="error in validationResult.errors" :key="error" class="text-sm">
                        • {{ error }}
                      </div>
                    </div>
                  </div>
                </Message>
              </div>

              <Button 
                label="Load Schema" 
                @click="loadSchema" 
                :disabled="!validationResult?.valid"
                class="w-full"
              />
            </div>
          </TabPanel>

          <!-- Test Cases Tab -->
          <TabPanel header="Endpoints">
            <div v-if="!isSchemaLoaded" class="text-center py-8 text-gray-500">
              <i class="pi pi-list text-4xl mb-4"></i>
              <p>No schema loaded yet. Load a valid schema from the Input tab.</p>
            </div>

            <div v-else>
              <div class="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <h3 class="font-semibold text-green-800 dark:text-green-200 mb-2">Step 2: Configure & Test</h3>
                <p class="text-sm text-green-700 dark:text-green-300">
                  Configure your test settings and run tests. You can test individual endpoints or run all tests at once.
                </p>
              </div>

              <div class="space-y-4">
                <!-- Configuration -->
                <Card>
                  <template #title>Test Configuration</template>
                  <template #content>
                                         <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                       <div>
                         <label class="block text-sm font-medium mb-2">Base URL</label>
                         <InputText 
                           v-model="baseUrl" 
                           placeholder="http://localhost:3000"
                           class="w-full"
                         />
                       </div>
                       
                       <div>
                         <label class="block text-sm font-medium mb-2">Number of Workers</label>
                         <InputNumber 
                           v-model="workers" 
                           :min="1" 
                           :max="10"
                           class="w-full"
                           placeholder="1"
                         />
                       </div>
                       
                       <div>
                         <label class="block text-sm font-medium mb-2">Delay Between Requests (ms)</label>
                         <InputNumber 
                           v-model="delayBetweenRequests" 
                           :min="0" 
                           :max="10000"
                           class="w-full"
                           placeholder="0"
                         />
                       </div>
                       
                       <div>
                         <label class="block text-sm font-medium mb-2">Timeout (ms)</label>
                         <InputNumber 
                           v-model="timeout" 
                           :min="1000" 
                           :max="120000"
                           class="w-full"
                           placeholder="30000"
                         />
                       </div>
                     </div>
                     
                     <div class="mt-4">
                       <label class="block text-sm font-medium mb-2">Custom Headers</label>
                       <Textarea 
                         v-model="customHeaders" 
                         placeholder="Authorization: Bearer token&#10;X-API-Key: your-api-key&#10;X-Custom-Header: value"
                         class="w-full h-20 text-sm font-mono"
                         rows="3"
                       />
                       <p class="text-xs text-gray-500 mt-1">
                         Enter headers in format: Key: Value (one per line). If you add custom headers, they will replace the default headers completely.
                       </p>
                     </div>
                     
                     <div class="mt-4 space-y-3">
                       <div class="flex items-center gap-2">
                         <input 
                           type="checkbox" 
                           id="randomValues"
                           v-model="useRandomValues"
                           class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                         />
                         <label for="randomValues" class="text-sm font-medium">Use Random Values for Empty Variables</label>
                       </div>
                       <p class="text-xs text-gray-500">
                         When enabled, empty path variables will be filled with random strings instead of being left empty.
                       </p>
                       
                       <div class="flex items-center gap-2">
                         <input 
                           type="checkbox" 
                           id="useParameterFromDefinition"
                           v-model="useParameterFromDefinition"
                           class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                         />
                         <label for="useParameterFromDefinition" class="text-sm font-medium">Use Parameter from Definition</label>
                       </div>
                       <p class="text-xs text-gray-500">
                         When enabled, POST/PUT requests will use example values from the schema definition as request body.
                       </p>
                     </div>
                    
                    <div class="mt-4 flex gap-2">
                      <Button 
                        label="Test All Endpoints" 
                        @click="runAllTests" 
                        :loading="isLoading"
                        :disabled="isLoading"
                        class="flex-1"
                      />
                      <Button 
                        v-if="isLoading || runningTests.size > 0"
                        label="Stop Tests" 
                        @click="stopAllTests" 
                        severity="danger"
                        size="small"
                      />
                    </div>
                  </template>
                </Card>

                <!-- Test Cases Table -->
                <Card>
                  <template #title>Endpoints ({{ testCases.length }})</template>
                  <template #content>
                                         <DataTable :value="testCases" stripedRows class="w-full" resizableColumns columnResizeMode="expand">
                       <Column field="method" header="Method" sortable resizable>
                         <template #body="{ data }">
                           <span class="px-2 py-1 rounded text-xs font-medium" 
                                 :class="{
                                   'bg-blue-100 text-blue-800': data.method === 'GET',
                                   'bg-green-100 text-green-800': data.method === 'POST',
                                   'bg-yellow-100 text-yellow-800': data.method === 'PUT',
                                   'bg-red-100 text-red-800': data.method === 'DELETE'
                                 }">
                             {{ data.method }}
                           </span>
                         </template>
                       </Column>
                       <Column field="path" header="Path" sortable resizable class="path-column" style="width: 25vw !important; max-width: 25vw !important;">
                         <template #body="{ data }">
                           <code class="text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 rounded whitespace-normal break-words">{{ data.path }}</code>
                         </template>
                       </Column>
                                             <Column header="Status" sortable resizable>
                         <template #body="{ data }">
                           <div v-if="getTestStatus(data)" class="flex items-center gap-2">
                             <span :class="getStatusClass(getTestStatus(data)!.success)">
                               {{ getStatusIcon(getTestStatus(data)!.success) }}
                             </span>
                             <span :class="getStatusClass(getTestStatus(data)!.success)">
                               {{ getTestStatus(data)!.status }}
                             </span>
                           </div>
                           <div v-else class="text-gray-400 text-sm">Not tested</div>
                         </template>
                       </Column>
                       <Column header="Response Time" sortable resizable>
                         <template #body="{ data }">
                           <span v-if="getTestStatus(data)" class="text-sm">
                             {{ formatResponseTime(getTestStatus(data)!.responseTime) }}
                           </span>
                           <span v-else class="text-gray-400 text-sm">-</span>
                         </template>
                       </Column>
                       <Column header="Actions" resizable>
                         <template #body="{ data }">
                           <Button 
                             label="Test" 
                             size="small"
                             @click="runSingleTest(data)"
                             :loading="isTestRunning(data)"
                             :disabled="isTestRunning(data) || isLoading"
                           />
                         </template>
                       </Column>
                    </DataTable>
                  </template>
                </Card>
              </div>
            </div>
          </TabPanel>

          <!-- Schema Definition Tab -->
          <TabPanel header="Definition">
            <div v-if="!parsedSchema" class="text-center py-8 text-gray-500">
              <i class="pi pi-file-text text-4xl mb-4"></i>
              <p>No schema loaded yet. Load a valid schema from the Input tab to view its definition.</p>
            </div>

            <div v-else class="space-y-6">
              <!-- API Info Section -->
              <Card>
                <template #title>
                  <div class="flex items-center gap-2">
                    <i class="pi pi-info-circle text-blue-500"></i>
                    API Information
                  </div>
                </template>
                <template #content>
                  <div class="space-y-4">
                    <!-- Basic Info -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                        <p class="text-sm text-gray-900 dark:text-gray-100">{{ parsedSchema.info?.title || 'N/A' }}</p>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Version</label>
                        <p class="text-sm text-gray-900 dark:text-gray-100">{{ parsedSchema.info?.version || 'N/A' }}</p>
                      </div>
                      <div v-if="parsedSchema.info?.description" class="md:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                        <p class="text-sm text-gray-900 dark:text-gray-100">{{ parsedSchema.info.description }}</p>
                      </div>
                      <div v-if="parsedSchema.info?.contact" class="md:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact</label>
                        <p class="text-sm text-gray-900 dark:text-gray-100">
                          {{ parsedSchema.info.contact.name || '' }}
                          {{ parsedSchema.info.contact.email ? `(${parsedSchema.info.contact.email})` : '' }}
                          {{ parsedSchema.info.contact.url ? `- ${parsedSchema.info.contact.url}` : '' }}
                        </p>
                      </div>
                      <div v-if="parsedSchema.info?.license" class="md:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">License</label>
                        <p class="text-sm text-gray-900 dark:text-gray-100">
                          {{ parsedSchema.info.license.name }}
                          {{ parsedSchema.info.license.url ? `(${parsedSchema.info.license.url})` : '' }}
                        </p>
                      </div>
                      <div v-if="parsedSchema.openapi || parsedSchema.swagger">
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">OpenAPI Version</label>
                        <p class="text-sm text-gray-900 dark:text-gray-100">{{ parsedSchema.openapi || parsedSchema.swagger }}</p>
                      </div>
                    </div>
                    
                    <!-- Server Information -->
                    <div v-if="parsedSchema.servers || parsedSchema.host">
                      <h4 class="font-medium text-gray-700 dark:text-gray-300 mb-2">Server Information</h4>
                      <div class="space-y-2">
                        <div v-if="parsedSchema.host">
                          <span class="font-medium text-gray-600 dark:text-gray-400">Host:</span>
                          <code class="ml-2 text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ parsedSchema.host }}</code>
                        </div>
                        <div v-if="parsedSchema.basePath">
                          <span class="font-medium text-gray-600 dark:text-gray-400">Base Path:</span>
                          <code class="ml-2 text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ parsedSchema.basePath }}</code>
                        </div>
                        <div v-if="parsedSchema.schemes">
                          <span class="font-medium text-gray-600 dark:text-gray-400">Schemes:</span>
                          <span class="ml-2 text-sm">{{ parsedSchema.schemes.join(', ') }}</span>
                        </div>
                        <div v-if="parsedSchema.servers">
                          <span class="font-medium text-gray-600 dark:text-gray-400">Servers:</span>
                          <div class="ml-2 space-y-1">
                            <div v-for="(server, index) in parsedSchema.servers" :key="index" class="text-sm">
                              <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ server.url }}</code>
                              <span v-if="server.description" class="ml-2 text-gray-500">- {{ server.description }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <!-- Tags Information -->
                    <div v-if="parsedSchema.tags">
                      <h4 class="font-medium text-gray-700 dark:text-gray-300 mb-2">Tags</h4>
                      <div class="flex flex-wrap gap-2">
                        <div v-for="tag in parsedSchema.tags" :key="tag.name" class="flex items-center gap-2">
                          <span class="px-3 py-1 bg-indigo-500 text-white dark:bg-indigo-600 dark:text-indigo-100 text-xs rounded-full font-medium shadow-sm">{{ tag.name }}</span>
                          <span v-if="tag.description" class="text-sm text-gray-600 dark:text-gray-400">{{ tag.description }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </Card>

              <!-- Paths Section -->
              <Card>
                <template #title>
                  <div class="flex items-center gap-2">
                    <i class="pi pi-link text-green-500"></i>
                    API Endpoints ({{ Object.keys(parsedSchema.paths || {}).length }})
                  </div>
                </template>
                <template #content>
                  <div class="space-y-4">
                    <div v-for="(methods, path) in parsedSchema.paths" :key="path" class="border border-gray-200 dark:border-gray-700 rounded-lg">
                      <!-- Path Header -->
                      <div 
                        class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                        @click="togglePathExpansion(path)"
                      >
                        <div class="flex items-center gap-2">
                          <i :class="isPathExpanded(path) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="text-gray-500"></i>
                          <span class="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{{ path }}</span>
                        </div>
                        <div class="flex items-center gap-2">
                          <div class="flex gap-1">
                            <span v-for="method in Object.keys(methods)" :key="method" 
                                  :class="['px-2 py-1 text-xs font-bold rounded', getMethodColor(method)]">
                              {{ method.toUpperCase() }}
                            </span>
                          </div>
                          <span class="text-xs text-gray-500">{{ Object.keys(methods).length }} methods</span>
                        </div>
                      </div>

                      <!-- Path Methods -->
                      <div v-if="isPathExpanded(path)" class="p-4 space-y-4">
                        <div v-for="(operation, method) in methods" :key="method" class="border-l-4 border-gray-200 dark:border-gray-600 pl-4">
                          <!-- Method Header -->
                          <div class="flex items-center gap-3 mb-3">
                            <span :class="['px-3 py-1 text-sm font-bold rounded shadow-sm', getMethodColor(method)]">
                              {{ method.toUpperCase() }}
                            </span>
                            <h4 class="font-medium text-gray-900 dark:text-gray-100">
                              {{ operation.summary || operation.operationId || `${method.toUpperCase()} ${path}` }}
                            </h4>
                          </div>

                          <!-- Operation Details -->
                          <div class="space-y-4 text-sm">
                            <!-- Operation ID and Tags -->
                            <div class="flex items-center gap-4 text-xs">
                              <div v-if="operation.operationId">
                                <span class="font-medium text-gray-600 dark:text-gray-400">Operation ID:</span>
                                <code class="ml-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ operation.operationId }}</code>
                              </div>
                              <div v-if="operation.tags && operation.tags.length > 0">
                                <span class="font-medium text-gray-600 dark:text-gray-400">Tags:</span>
                                <div class="flex flex-wrap gap-1 mt-1">
                                  <span v-for="tag in operation.tags" :key="tag" class="px-2 py-1 bg-emerald-500 text-white dark:bg-emerald-600 dark:text-emerald-100 rounded text-xs font-medium">{{ tag }}</span>
                                </div>
                              </div>
                            </div>

                            <div v-if="operation.description" class="text-gray-600 dark:text-gray-400">
                              {{ operation.description }}
                            </div>

                            <!-- Consumes/Produces (Swagger 2.0) -->
                            <div v-if="operation.consumes || operation.produces" class="flex items-center gap-4 text-xs">
                              <div v-if="operation.consumes">
                                <span class="font-medium text-gray-600 dark:text-gray-400">Consumes:</span>
                                <span class="ml-1">{{ operation.consumes.join(', ') }}</span>
                              </div>
                              <div v-if="operation.produces">
                                <span class="font-medium text-gray-600 dark:text-gray-400">Produces:</span>
                                <span class="ml-1">{{ operation.produces.join(', ') }}</span>
                              </div>
                            </div>

                            <!-- Parameters -->
                            <div v-if="operation.parameters && operation.parameters.length > 0">
                              <h5 class="font-medium text-gray-700 dark:text-gray-300 mb-2">Parameters</h5>
                              <div class="space-y-3">
                                <div v-for="param in operation.parameters" :key="param.name" class="border border-gray-200 dark:border-gray-600 rounded p-3">
                                  <div class="flex items-center gap-2 mb-1">
                                    <span class="font-mono text-gray-900 dark:text-gray-100 font-medium">{{ param.name }}</span>
                                    <span class="px-2 py-1 bg-cyan-500 text-white dark:bg-cyan-600 dark:text-cyan-100 rounded text-xs font-medium">{{ param.in }}</span>
                                    <span v-if="param.required" class="px-2 py-1 bg-red-500 text-white dark:bg-red-600 dark:text-red-100 rounded text-xs font-medium">required</span>
                                    <span v-else class="px-2 py-1 bg-gray-500 text-white dark:bg-gray-600 dark:text-gray-100 rounded text-xs font-medium">optional</span>
                                    <span v-if="param.schema" class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded text-xs font-medium">{{ formatSchemaType(param.schema) }}</span>
                                  </div>
                                  <div v-if="param.description" class="text-gray-600 dark:text-gray-400 text-xs">
                                    {{ param.description }}
                                  </div>
                                  
                                  <!-- Body Parameter Details (like Swagger UI) -->
                                  <div v-if="param.in === 'body' && param.schema" class="mt-3">
                                    <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                                      <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">Request Body Schema:</div>
                                      <div class="text-sm font-mono text-gray-900 dark:text-gray-100 mb-2">{{ formatSchemaType(param.schema) }}</div>
                                      
                                      <!-- Schema Reference (if it's a $ref) -->
                                      <div v-if="param.schema.$ref" class="mb-3">
                                        <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">References:</div>
                                        <code class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ param.schema.$ref }}</code>
                                      </div>
                                      
                                      <!-- Example Value (like Swagger UI) -->
                                      <div class="mb-3">
                                        <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Example Value:</div>
                                        <pre class="text-xs bg-gray-900 dark:bg-gray-700 text-gray-100 p-3 rounded overflow-auto max-h-48 font-mono">{{ formatExampleValue(param.schema) }}</pre>
                                      </div>
                                      
                                      <!-- Schema Properties (if available) -->
                                      <div v-if="param.schema.properties" class="space-y-2">
                                        <div class="text-xs text-gray-500 dark:text-gray-400">Properties:</div>
                                        <div class="space-y-1 pl-2">
                                          <div v-for="(prop, propName) in param.schema.properties" :key="propName" class="flex items-center gap-2 text-xs">
                                            <span class="font-mono text-gray-700 dark:text-gray-300 font-medium">{{ propName }}</span>
                                            <span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded font-medium">{{ formatSchemaType(prop) }}</span>
                                            <span v-if="prop.description" class="text-gray-500">- {{ prop.description }}</span>
                                            <span v-if="prop.example" class="text-gray-400">(example: {{ prop.example }})</span>
                                            <span v-if="prop.default" class="text-gray-400">(default: {{ prop.default }})</span>
                                          </div>
                                        </div>
                                      </div>
                                      
                                      <!-- Additional Properties -->
                                      <div v-if="param.schema.additionalProperties" class="mt-2">
                                        <div class="text-xs text-gray-500 dark:text-gray-400">Additional Properties:</div>
                                        <span class="text-xs text-gray-700 dark:text-gray-300">{{ formatSchemaType(param.schema.additionalProperties) }}</span>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <!-- Non-body Parameter Details -->
                                  <div v-if="param.in !== 'body' && param.schema && param.schema.properties" class="mt-2">
                                    <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Properties:</div>
                                    <div class="space-y-1 pl-2">
                                      <div v-for="(prop, propName) in param.schema.properties" :key="propName" class="flex items-center gap-2">
                                        <span class="font-mono text-gray-700 dark:text-gray-300">{{ propName }}</span>
                                        <span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded text-xs font-medium">{{ formatSchemaType(prop) }}</span>
                                        <span v-if="prop.description" class="text-gray-500">- {{ prop.description }}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <!-- Request Body -->
                            <div v-if="operation.requestBody">
                              <h5 class="font-medium text-gray-700 dark:text-gray-300 mb-2">Request Body</h5>
                              <div class="border border-gray-200 dark:border-gray-600 rounded p-3">
                                <div v-if="operation.requestBody.required !== undefined" class="mb-2">
                                  <span v-if="operation.requestBody.required" class="px-2 py-1 bg-red-500 text-white dark:bg-red-600 dark:text-red-100 rounded text-xs font-medium">required</span>
                                  <span v-else class="px-2 py-1 bg-gray-500 text-white dark:bg-gray-600 dark:text-gray-100 rounded text-xs font-medium">optional</span>
                                </div>
                                <div v-if="operation.requestBody.content">
                                  <div v-for="(content, mediaType) in operation.requestBody.content" :key="mediaType" class="mb-3">
                                    <div class="text-gray-600 dark:text-gray-400 mb-1 font-medium">{{ mediaType }}</div>
                                    <div v-if="content.schema" class="bg-gray-50 dark:bg-gray-800 p-3 rounded text-xs font-mono">
                                      <div class="text-gray-900 dark:text-gray-100 mb-1">{{ formatSchemaType(content.schema) }}</div>
                                      
                                      <!-- Schema Reference (if it's a $ref) -->
                                      <div v-if="content.schema.$ref" class="mb-2">
                                        <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">References:</div>
                                        <code class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ content.schema.$ref }}</code>
                                      </div>
                                      
                                      <!-- Example Value (like Swagger UI) -->
                                      <div class="mb-2">
                                        <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Example Value:</div>
                                        <pre class="text-xs bg-gray-900 dark:bg-gray-700 text-gray-100 p-2 rounded overflow-auto max-h-32 font-mono">{{ formatExampleValue(content.schema) }}</pre>
                                      </div>
                                      
                                      <div v-if="content.schema.properties" class="space-y-1 pl-2">
                                        <div v-for="(prop, propName) in content.schema.properties" :key="propName" class="flex items-center gap-2">
                                          <span class="font-mono text-gray-700 dark:text-gray-300">{{ propName }}</span>
                                          <span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded text-xs font-medium">{{ formatSchemaType(prop) }}</span>
                                          <span v-if="prop.description" class="text-gray-500">- {{ prop.description }}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <!-- Responses -->
                            <div v-if="operation.responses">
                              <h5 class="font-medium text-gray-700 dark:text-gray-300 mb-2">Responses</h5>
                              <div class="space-y-3">
                                <div v-for="(response, statusCode) in operation.responses" :key="statusCode" class="border border-gray-200 dark:border-gray-600 rounded p-3">
                                  <div class="flex items-center gap-2 mb-2">
                                    <span :class="[
                                      'px-2 py-1 rounded font-medium text-xs',
                                      statusCode.startsWith('2') ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                      statusCode.startsWith('4') ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                      statusCode.startsWith('5') ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                      'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                    ]">
                                      {{ statusCode }}
                                    </span>
                                    <span class="text-gray-600 dark:text-gray-400 font-medium">{{ response.description || 'No description' }}</span>
                                  </div>
                                  <div v-if="response.content" class="space-y-2">
                                    <div v-for="(content, mediaType) in response.content" :key="mediaType">
                                      <div class="text-gray-600 dark:text-gray-400 text-xs mb-1">{{ mediaType }}</div>
                                      <div v-if="content.schema" class="bg-gray-50 dark:bg-gray-800 p-2 rounded text-xs font-mono">
                                        {{ formatSchemaType(content.schema) }}
                                      </div>
                                    </div>
                                  </div>
                                  <div v-if="response.schema" class="bg-gray-50 dark:bg-gray-800 p-2 rounded text-xs font-mono">
                                    {{ formatSchemaType(response.schema) }}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </Card>

              <!-- Components Section -->
              <Card v-if="parsedSchema.components || parsedSchema.definitions">
                <template #title>
                  <div class="flex items-center gap-2">
                    <i class="pi pi-cube text-purple-500"></i>
                    Components & Definitions
                  </div>
                </template>
                <template #content>
                  <div class="space-y-6">
                    <!-- Schemas (OpenAPI 3.x) -->
                    <div v-if="parsedSchema.components?.schemas">
                      <h4 class="font-medium text-gray-700 dark:text-gray-300 mb-3">Schemas</h4>
                      <div class="space-y-3">
                        <div v-for="(schema, name) in parsedSchema.components.schemas" :key="name" class="border border-gray-200 dark:border-gray-700 rounded-lg">
                          <div 
                            class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                            @click="toggleComponentExpansion(name)"
                          >
                            <div class="flex items-center gap-3">
                              <i :class="isComponentExpanded(name) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="text-gray-500"></i>
                              <span class="font-medium text-gray-900 dark:text-gray-100">{{ name }}</span>
                              <span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded text-xs font-medium">{{ formatSchemaType(schema) }}</span>
                            </div>
                            <div class="flex items-center gap-2 text-xs text-gray-500">
                              <span v-if="schema.properties">{{ Object.keys(schema.properties).length }} properties</span>
                              <span v-if="schema.required">{{ schema.required.length }} required</span>
                            </div>
                          </div>
                          
                          <div v-if="isComponentExpanded(name)" class="p-4 space-y-4">
                            <div v-if="schema.description" class="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded">
                              {{ schema.description }}
                            </div>
                            
                            <!-- Schema Type Info -->
                            <div class="flex items-center gap-4 text-xs">
                              <div v-if="schema.type">
                                <span class="font-medium text-gray-600 dark:text-gray-400">Type:</span>
                                <span class="ml-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{{ schema.type }}</span>
                              </div>
                              <div v-if="schema.format">
                                <span class="font-medium text-gray-600 dark:text-gray-400">Format:</span>
                                <span class="ml-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{{ schema.format }}</span>
                              </div>
                              <div v-if="schema.example">
                                <span class="font-medium text-gray-600 dark:text-gray-400">Example:</span>
                                <code class="ml-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ schema.example }}</code>
                              </div>
                            </div>
                            
                            <!-- Properties -->
                            <div v-if="schema.properties" class="space-y-3">
                              <h5 class="font-medium text-gray-700 dark:text-gray-300">Properties</h5>
                              <div class="space-y-2">
                                <div v-for="(prop, propName) in schema.properties" :key="propName" class="border border-gray-200 dark:border-gray-600 rounded p-3">
                                  <div class="flex items-center gap-2 mb-1">
                                    <span class="font-medium text-gray-900 dark:text-gray-100">{{ propName }}</span>
                                    <span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded text-xs font-medium">{{ formatSchemaType(prop) }}</span>
                                    <span v-if="schema.required && schema.required.includes(propName)" class="px-2 py-1 bg-red-500 text-white dark:bg-red-600 dark:text-red-100 rounded text-xs font-medium">required</span>
                                    <span v-else class="px-2 py-1 bg-gray-500 text-white dark:bg-gray-600 dark:text-gray-100 rounded text-xs font-medium">optional</span>
                                  </div>
                                  <div v-if="prop.description" class="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    {{ prop.description }}
                                  </div>
                                  <div class="flex items-center gap-4 text-xs">
                                    <div v-if="prop.format">
                                      <span class="font-medium text-gray-600 dark:text-gray-400">Format:</span>
                                      <span class="ml-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{{ prop.format }}</span>
                                    </div>
                                    <div v-if="prop.example">
                                      <span class="font-medium text-gray-600 dark:text-gray-400">Example:</span>
                                      <code class="ml-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ prop.example }}</code>
                                    </div>
                                    <div v-if="prop.default">
                                      <span class="font-medium text-gray-600 dark:text-gray-400">Default:</span>
                                      <code class="ml-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ prop.default }}</code>
                                    </div>
                                  </div>
                                  <div v-if="prop.enum" class="mt-2">
                                    <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Enum values:</div>
                                    <div class="flex flex-wrap gap-1">
                                      <span v-for="enumValue in prop.enum" :key="enumValue" class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">{{ enumValue }}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            <!-- Required Fields Summary -->
                            <div v-if="schema.required && schema.required.length > 0" class="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded">
                              <h6 class="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Required Fields</h6>
                              <div class="flex flex-wrap gap-2">
                                <span v-for="requiredField in schema.required" :key="requiredField" class="px-2 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded text-xs font-medium">{{ requiredField }}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <!-- Definitions (Swagger 2.0) -->
                    <div v-if="parsedSchema.definitions">
                      <h4 class="font-medium text-gray-700 dark:text-gray-300 mb-3">Definitions</h4>
                      <div class="space-y-3">
                        <div v-for="(schema, name) in parsedSchema.definitions" :key="name" class="border border-gray-200 dark:border-gray-700 rounded-lg">
                          <div 
                            class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                            @click="toggleComponentExpansion(name)"
                          >
                            <div class="flex items-center gap-3">
                              <i :class="isComponentExpanded(name) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="text-gray-500"></i>
                              <span class="font-medium text-gray-900 dark:text-gray-100">{{ name }}</span>
                              <span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded text-xs font-medium">{{ formatSchemaType(schema) }}</span>
                            </div>
                            <div class="flex items-center gap-2 text-xs text-gray-500">
                              <span v-if="schema.properties">{{ Object.keys(schema.properties).length }} properties</span>
                              <span v-if="schema.required">{{ schema.required.length }} required</span>
                            </div>
                          </div>
                          
                          <div v-if="isComponentExpanded(name)" class="p-4 space-y-4">
                            <div v-if="schema.description" class="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded">
                              {{ schema.description }}
                            </div>
                            
                            <!-- Schema Type Info -->
                            <div class="flex items-center gap-4 text-xs">
                              <div v-if="schema.type">
                                <span class="font-medium text-gray-600 dark:text-gray-400">Type:</span>
                                <span class="ml-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{{ schema.type }}</span>
                              </div>
                              <div v-if="schema.format">
                                <span class="font-medium text-gray-600 dark:text-gray-400">Format:</span>
                                <span class="ml-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{{ schema.format }}</span>
                              </div>
                            </div>
                            
                            <!-- Properties -->
                            <div v-if="schema.properties" class="space-y-3">
                              <h5 class="font-medium text-gray-700 dark:text-gray-300">Properties</h5>
                              <div class="space-y-2">
                                <div v-for="(prop, propName) in schema.properties" :key="propName" class="border border-gray-200 dark:border-gray-600 rounded p-3">
                                  <div class="flex items-center gap-2 mb-1">
                                    <span class="font-medium text-gray-900 dark:text-gray-100">{{ propName }}</span>
                                    <span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded text-xs font-medium">{{ formatSchemaType(prop) }}</span>
                                    <span v-if="schema.required && schema.required.includes(propName)" class="px-2 py-1 bg-red-500 text-white dark:bg-red-600 dark:text-red-100 rounded text-xs font-medium">required</span>
                                    <span v-else class="px-2 py-1 bg-gray-500 text-white dark:bg-gray-600 dark:text-gray-100 rounded text-xs font-medium">optional</span>
                                  </div>
                                  <div v-if="prop.description" class="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    {{ prop.description }}
                                  </div>
                                  <div class="flex items-center gap-4 text-xs">
                                    <div v-if="prop.format">
                                      <span class="font-medium text-gray-600 dark:text-gray-400">Format:</span>
                                      <span class="ml-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{{ prop.format }}</span>
                                    </div>
                                    <div v-if="prop.example">
                                      <span class="font-medium text-gray-600 dark:text-gray-400">Example:</span>
                                      <code class="ml-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ prop.example }}</code>
                                    </div>
                                    <div v-if="prop.default">
                                      <span class="font-medium text-gray-600 dark:text-gray-400">Default:</span>
                                      <code class="ml-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ prop.default }}</code>
                                    </div>
                                  </div>
                                  <div v-if="prop.enum" class="mt-2">
                                    <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Enum values:</div>
                                    <div class="flex flex-wrap gap-1">
                                      <span v-for="enumValue in prop.enum" :key="enumValue" class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">{{ enumValue }}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            <!-- Required Fields Summary -->
                            <div v-if="schema.required && schema.required.length > 0" class="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded">
                              <h6 class="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Required Fields</h6>
                              <div class="flex flex-wrap gap-2">
                                <span v-for="requiredField in schema.required" :key="requiredField" class="px-2 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded text-xs font-medium">{{ requiredField }}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </Card>
            </div>
          </TabPanel>

          <!-- Test Results Tab -->
          <TabPanel header="Results">
            <div class="space-y-4">
              <!-- Query Bar -->
              <Card>
                <template #title>Query Test Results</template>
                <template #content>
                  <div class="space-y-4">
                    <div class="flex items-center gap-4">
                      <div class="flex-1">
                        <label for="httpql-query" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Query Test Results
                        </label>
                        <div class="flex gap-2">
                          <InputText
                            id="httpql-query"
                            v-model="httpqlQuery"
                            placeholder="Enter query (e.g., resp.code.eq:200, method.eq:GET, url.eq:'/users')"
                            class="flex-1"
                            @keyup.enter="runHttpqlQuery"
                          />
                          <Button 
                            label="Run Query" 
                            icon="pi pi-play"
                            @click="runHttpqlQuery"
                            :loading="isHttpqlRunning"
                            :disabled="!httpqlQuery.trim()"
                          />
                          <Button 
                            v-if="isQueryActive"
                            label="Clear" 
                            icon="pi pi-times"
                            @click="clearQuery"
                            severity="secondary"
                            size="small"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <!-- Query Results -->
                    <div v-if="httpqlResults" class="mt-4">
                      <h4 class="font-medium text-gray-800 dark:text-gray-200 mb-2">Query Results</h4>
                      <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                        <pre class="text-sm font-mono text-gray-900 dark:text-gray-100 overflow-auto max-h-64">{{ httpqlResults }}</pre>
                      </div>
                    </div>
                  </div>
                </template>
              </Card>

              <!-- Test Results Section -->
              <div v-if="!hasResults" class="text-center py-8 text-gray-500">
                <i class="pi pi-chart-bar text-4xl mb-4"></i>
                <p>No test results yet. Run tests from the Endpoints tab.</p>
              </div>
              

 
              <div v-else>
                <!-- Results Table -->
                <Card>
                  <template #title>
                    {{ isQueryActive ? 'Filtered Test Results' : 'Test Results' }}
                    <span v-if="isQueryActive" class="text-sm text-gray-500 ml-2">
                      ({{ filteredTestResults.length }} of {{ allTestResults.length }})
                    </span>
                  </template>
                  <template #content>
                    <div class="space-y-2">
                      <div v-for="data in (isQueryActive ? filteredTestResults : allTestResults)" :key="getResultId(data)" class="border border-gray-200 dark:border-gray-700 rounded-lg">
                        <!-- Main Result Row -->
                        <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer" @click="toggleResultExpansion(getResultId(data))">
                          <div class="flex items-center justify-between">
                            <div class="flex items-center gap-4 flex-1">
                              <!-- Test Name -->
                              <div class="flex-1">
                                <div class="font-medium">{{ data.testCase.name }}</div>
                                <div class="text-sm text-gray-500">{{ data.testCase.description }}</div>
                              </div>
                              
                              <!-- Method -->
                              <span class="px-2 py-1 rounded text-xs font-medium" 
                                    :class="{
                                      'bg-blue-100 text-blue-800': data.testCase.method === 'GET',
                                      'bg-green-100 text-green-800': data.testCase.method === 'POST',
                                      'bg-yellow-100 text-yellow-800': data.testCase.method === 'PUT',
                                      'bg-red-100 text-red-800': data.testCase.method === 'DELETE'
                                    }">
                                {{ data.testCase.method }}
                              </span>
                              
                              <!-- Path -->
                              <code class="text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 rounded">{{ data.testCase.path }}</code>
                              
                              <!-- Status -->
                              <div class="flex items-center gap-2">
                                <span :class="getStatusClass(data.success)">{{ getStatusIcon(data.success) }}</span>
                                <span :class="getStatusClass(data.success)">{{ data.status }}</span>
                              </div>
                              
                              <!-- Response Time -->
                              <span class="text-sm">{{ formatResponseTime(data.responseTime) }}</span>
                              
                              <!-- Response Size -->
                              <span class="text-sm text-gray-600 dark:text-gray-400">{{ getResponseSize(data.response) }}</span>
                            </div>
                            
                            <!-- Expand/Collapse Icon -->
                            <Button 
                              :icon="isResultExpanded(getResultId(data)) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
                              size="small"
                              text
                              rounded
                              class="text-gray-500"
                            />
                          </div>
                          
                          <!-- Path Variables Used (if any) -->
                          <div v-if="data.combination && Object.keys(data.combination).length > 0" class="mt-2 text-sm text-gray-600">
                            <span class="font-medium">Variables:</span>
                            <span v-for="(value, key) in data.combination" :key="key" class="ml-2">
                              {{ key }} = "{{ value }}"
                            </span>
                          </div>
                        </div>
                        
                        <!-- Native Caido Request/Response Viewer -->
                        <div v-if="isResultExpanded(getResultId(data))" class="border-t border-gray-200 dark:border-gray-700 h-[600px]">
                          <div class="flex h-full">
                            <!-- Request Editor -->
                            <div class="w-1/2 border-r border-gray-200 dark:border-gray-700">
                              <div class="h-full" :ref="el => setRequestEditorContainer(el, getResultId(data))"></div>
                            </div>
                            <!-- Response Editor -->
                            <div class="w-1/2">
                              <div class="h-full" :ref="el => setResponseEditorContainer(el, getResultId(data))"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>
                </Card>
              </div>
            </div>
                     </TabPanel>
         </TabView>
        </div>
       </div>

      <!-- Variables Sidebar -->
      <div v-if="isSchemaLoaded && (getUniquePathVariables().length > 0 || Object.keys(bodyVariableValues).length > 0)" 
           :class="[
             'w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-lg transition-all duration-300 ease-in-out overflow-y-auto',
             sidebarOpen ? 'translate-x-0' : 'translate-x-full'
           ]">
        <div class="p-4">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">Request Configuration</h3>
            <Button 
              icon="pi pi-times"
              @click="toggleSidebar"
              size="small"
              text
              rounded
            />
          </div>
          
                                <!-- Path Variables Section -->
           <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
             <div class="mb-3">
               <h4 class="text-md font-medium text-gray-700 dark:text-gray-300">Path Variables</h4>
               <p class="text-xs text-gray-500 mt-1">
                 Add multiple values to test different combinations. Each value will be tested separately.
               </p>
             </div>
            
                         <div class="space-y-3">
              
              <div v-for="variable in getUniquePathVariables()" :key="variable" class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {{ variable }}
                  </label>
                  <Button 
                    label="Add Value"
                    icon="pi pi-plus"
                    @click="addPathVariableValue(variable)"
                    size="small"
                    severity="success"
                    class="text-xs px-2 py-1"
                  />
                </div>
                
                <div class="space-y-2">
                  <div v-for="(value, index) in getPathVariableValue(variable)" :key="index" class="flex items-center gap-2">
                    <InputText 
                      v-model="pathVariableValues[variable][index]"
                      :placeholder="`Value ${index + 1} for ${variable}`"
                      class="flex-1"
                    />
                    <Button 
                      v-if="getPathVariableValue(variable).length > 1"
                      label="Remove"
                      icon="pi pi-trash"
                      @click="removePathVariableValue(variable, index)"
                      size="small"
                      severity="danger"
                      class="text-xs px-2 py-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          

          
          <!-- Body Variables Section -->
          <div v-if="Object.keys(bodyVariableValues).length > 0" class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div class="mb-3">
              <h4 class="text-md font-medium text-gray-700 dark:text-gray-300">Body Variables</h4>
              <p class="text-xs text-gray-500 mt-1">
                Customize request body parameters for POST/PUT/PATCH requests.
              </p>
            </div>
            
            <div class="space-y-3">
              <div v-for="(value, key) in bodyVariableValues" :key="key" class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {{ key }}
                  </label>
                </div>
                
                <div class="space-y-2">
                  <InputText 
                    v-model="bodyVariableValues[key]"
                    :placeholder="`Value for ${key}`"
                    class="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
          
          <!-- Debug info -->
          <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div class="mb-3">
              <h4 class="text-md font-medium text-gray-700 dark:text-gray-300">Debug Info</h4>
            </div>
            <div class="text-xs text-gray-500">
              <p>Body Variables Count: {{ Object.keys(bodyVariableValues).length }}</p>
              <p>Body Variables: {{ JSON.stringify(bodyVariableValues) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Make column resizers visible */
:deep(.p-datatable .p-datatable-thead > tr > th) {
  position: relative;
}

:deep(.p-datatable .p-datatable-thead > tr > th .p-column-resizer) {
  position: absolute;
  border-left-color: white !important;
  right: 0;
  top: 0;
  width: 4px;
  height: 100%;
  background-color: #3b82f6 !important;
  cursor: col-resize;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 10;
}

:deep(.p-datatable .p-datatable-thead > tr > th:hover .p-column-resizer) {
  opacity: 1 !important;
  background-color: #3b82f6 !important;
}

:deep(.p-datatable .p-datatable-thead > tr > th .p-column-resizer.p-column-resizer-dragging) {
  opacity: 1 !important;
  background-color: #1d4ed8 !important;
}

:deep(.p-datatable .p-datatable-thead > tr > th .p-column-resizer:hover) {
  background-color: #1d4ed8 !important;
}

/* Fix checkbox visibility */
:deep(.p-checkbox) {
  width: 16px !important;
  height: 16px !important;
  min-width: 16px !important;
  min-height: 16px !important;
}

:deep(.p-checkbox .p-checkbox-box) {
  width: 16px !important;
  height: 16px !important;
  min-width: 16px !important;
  min-height: 16px !important;
}

/* Make response body text selectable */
.select-text {
  user-select: text !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
}

/* Ensure pre tags allow text selection */
pre {
  user-select: text !important;
  -webkit-user-select: text !important;
  -moz-user-select: text !important;
  -ms-user-select: text !important;
}

/* Override PrimeVue default column widths for better resizing */
:deep([data-pc-name="datatable"] [data-pc-section="tablecontainer"] table[data-pc-section="table"] thead[data-pc-section="thead"] tr th:nth-child(2)),
:deep([data-pc-name="datatable"] [data-pc-section="tablecontainer"] table[data-pc-section="table"] tbody[data-pc-section="tbody"] tr td:nth-child(2)),
:deep([data-pc-name="datatable"] [data-pc-section="tablecontainer"] table[data-pc-section="table"] tfoot[data-pc-section="tfoot"] tr td:nth-child(2)) {
  width: 25vw !important;
  max-width: 25vw !important;
  min-width: 200px !important;
}

/* Allow resizing for all columns */
:deep([data-pc-name="datatable"] [data-pc-section="tablecontainer"] table[data-pc-section="table"] thead[data-pc-section="thead"] tr th) {
  min-width: 100px !important;
  max-width: none !important;
}

/* Force path column width */
:deep(.path-column) {
  width: 25vw !important;
  max-width: 25vw !important;
  min-width: 200px !important;
}

:deep(.path-column .p-column-header-content),
:deep(.path-column .p-column-body) {
  width: 25vw !important;
  max-width: 25vw !important;
}
</style>
