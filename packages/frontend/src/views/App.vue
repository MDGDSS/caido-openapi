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
import { ref, computed } from "vue";

import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();

// Reactive state
const schemaText = ref("");
const baseUrl = ref("http://localhost:3000");
const workers = ref(10);
const delayBetweenRequests = ref(0);
const timeout = ref(30000);
const useRandomValues = ref(false);
const isLoading = ref(false);
const validationResult = ref<{ valid: boolean; errors: string[] } | null>(null);
const testResults = ref<any[]>([]);
const activeTab = ref(0);
const testCases = ref<any[]>([]);
const isSchemaLoaded = ref(false);
const pathVariableValues = ref<Record<string, string[]>>({});
const runningTests = ref<Set<string>>(new Set());
const sidebarOpen = ref(false);
const customHeaders = ref("");
const variablesExpanded = ref(true);
const stopTestRequested = ref(false);
const expandedResults = ref<Set<string>>(new Set());

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
  return results;
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
      
      console.log(`Loaded schema with ${cases.length} test cases and ${allPathVariables.size} path variables`);
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
      headers: parseCustomHeaders()
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
        const result = await sdk.backend.runSingleTest(testCase, baseUrl.value, options, {});
        testResults.value.push(result);
      } else {
        // Run test for each combination
        for (const combination of variableCombinations) {
          if (stopTestRequested.value) break;
          
          const result = await sdk.backend.runSingleTest(testCase, baseUrl.value, options, combination);
          testResults.value.push(result);
          
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
      headers: parseCustomHeaders()
    };
    
    // Get all combinations of path variable values
    const variableCombinations = generatePathVariableCombinations(testCase);
    
    if (variableCombinations.length === 0) {
      // No path variables or no values, run single test
      const result = await sdk.backend.runSingleTest(testCase, baseUrl.value, options, {});
      updateTestCaseResult(testCase, result);
    } else {
      // Run test for each combination
      for (let i = 0; i < variableCombinations.length; i++) {
        const combination = variableCombinations[i];
        if (stopTestRequested.value) break;
        
        const result = await sdk.backend.runSingleTest(testCase, baseUrl.value, options, combination);
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
    expandedResults.value.delete(resultId);
  } else {
    expandedResults.value.add(resultId);
  }
};

const isResultExpanded = (resultId: string) => {
  return expandedResults.value.has(resultId);
};

const getResultId = (data: any) => {
  // Create a unique ID for each result
  const baseId = `${data.testCase.name}-${data.testCase.method}-${data.testCase.path}`;
  if (data.combination) {
    const combinationStr = Object.entries(data.combination)
      .map(([key, value]) => `${key}=${value}`)
      .join('-');
    return `${baseId}-${combinationStr}`;
  }
  return baseId;
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
          v-if="isSchemaLoaded && getUniquePathVariables().length > 0"
          :label="sidebarOpen ? 'Hide Config' : 'Show Config'"
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
          <TabPanel header="Definition">
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
              <p>No schema loaded yet. Load a valid schema from the Definition tab.</p>
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
                     
                     <div class="mt-4">
                       <div class="flex items-center gap-2">
                         <input 
                           type="checkbox" 
                           id="randomValues"
                           v-model="useRandomValues"
                           class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                         />
                         <label for="randomValues" class="text-sm font-medium">Use Random Values for Empty Variables</label>
                       </div>
                       <p class="text-xs text-gray-500 mt-1">
                         When enabled, empty path variables will be filled with random strings instead of being left empty.
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
                  <template #title>Generated Test Cases ({{ testCases.length }})</template>
                  <template #content>
                                         <DataTable :value="testCases" stripedRows class="w-full" resizableColumns columnResizeMode="expand">
                       <Column field="method" header="Method" sortable resizable>
                         <template #body="{ data }">
                           <div class="flex items-center gap-2">
                             <span class="px-2 py-1 rounded text-xs font-medium" 
                                   :class="{
                                     'bg-blue-100 text-blue-800': data.method === 'GET',
                                     'bg-green-100 text-green-800': data.method === 'POST',
                                     'bg-yellow-100 text-yellow-800': data.method === 'PUT',
                                     'bg-red-100 text-red-800': data.method === 'DELETE'
                                   }">
                               {{ data.method }}
                             </span>
                             <!-- Path Variables Indicator -->
                             <div v-if="hasPathVariables(data)">
                               <span class="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                                 {{ data.pathVariables.length }} variable{{ data.pathVariables.length > 1 ? 's' : '' }}
                               </span>
                             </div>
                           </div>
                         </template>
                       </Column>
                       <Column field="path" header="Path" sortable resizable style="width: 300px">
                         <template #body="{ data }">
                           <code class="text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 rounded">{{ data.path }}</code>
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

          <!-- Test Results Tab -->
          <TabPanel header="Results">
            <div v-if="!hasResults" class="text-center py-8 text-gray-500">
              <i class="pi pi-chart-bar text-4xl mb-4"></i>
              <p>No test results yet. Run tests from the Endpoints tab.</p>
            </div>

            <div v-else>
              <div class="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <h3 class="font-semibold text-purple-800 dark:text-purple-200 mb-2">Step 3: View Results</h3>
                <p class="text-sm text-purple-700 dark:text-purple-300">
                  View detailed test results, response times, and any errors that occurred during testing.
                </p>
              </div>

              <div class="space-y-4">
                <!-- Summary Cards -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card class="text-center">
                    <template #content>
                      <div class="text-2xl font-bold text-blue-600">{{ totalTests }}</div>
                      <div class="text-sm text-gray-600">Total Tests</div>
                    </template>
                  </Card>
                  <Card class="text-center">
                    <template #content>
                      <div class="text-2xl font-bold text-green-600">{{ passedTests }}</div>
                      <div class="text-sm text-gray-600">Passed</div>
                    </template>
                  </Card>
                  <Card class="text-center">
                    <template #content>
                      <div class="text-2xl font-bold text-red-600">{{ failedTests }}</div>
                      <div class="text-sm text-gray-600">Failed</div>
                    </template>
                  </Card>
                </div>

                <!-- Results Table -->
                <Card>
                  <template #title>Test Results</template>
                  <template #content>
                    <div class="space-y-2">
                      <div v-for="data in allTestResults" :key="getResultId(data)" class="border border-gray-200 dark:border-gray-700 rounded-lg">
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
                        
                        <!-- Expandable Details -->
                        <div v-if="isResultExpanded(getResultId(data))" class="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800">
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <!-- Request Details -->
                            <div>
                              <h4 class="font-medium text-gray-800 dark:text-gray-200 mb-2">Request</h4>
                              <div class="space-y-2 text-sm">
                                <div>
                                  <span class="font-medium">URL:</span>
                                  <code class="ml-2 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                    {{ baseUrl }}{{ data.testCase.path }}
                                  </code>
                                </div>
                                <div>
                                  <span class="font-medium">Method:</span>
                                  <span class="ml-2">{{ data.testCase.method }}</span>
                                </div>
                                <div v-if="data.combination && Object.keys(data.combination).length > 0">
                                  <span class="font-medium">Path Variables:</span>
                                  <div class="ml-2 mt-1">
                                    <div v-for="(value, key) in data.combination" :key="key" class="text-xs">
                                      {{ key }}: "{{ value }}"
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            <!-- Response Details -->
                            <div>
                              <h4 class="font-medium text-gray-800 dark:text-gray-200 mb-2">Response</h4>
                              <div class="space-y-2 text-sm">
                                <div>
                                  <span class="font-medium">Status:</span>
                                  <span class="ml-2" :class="getStatusClass(data.success)">{{ data.status || 'N/A' }}</span>
                                </div>
                                <div>
                                  <span class="font-medium">Response Time:</span>
                                  <span class="ml-2">{{ formatResponseTime(data.responseTime) }}</span>
                                </div>
                                <div v-if="data.error">
                                  <span class="font-medium text-red-600">Error:</span>
                                  <span class="ml-2 text-red-600">{{ data.error }}</span>
                                </div>
                                
                                <!-- Remove Debug Info section -->
                                <!-- Only show Response Body if present -->
                                <div v-if="data.response !== undefined && data.response !== null">
                                  <span class="font-medium">Response Body:</span>
                                  <!-- JSON Response with highlighting -->
                                  <pre v-if="isJSONResponse(data.response)" class="mt-2 text-sm bg-gray-900 dark:bg-gray-800 text-gray-100 p-3 rounded overflow-auto max-h-48 font-mono leading-relaxed border border-gray-600 select-text" v-html="formatResponseBodyWithHighlighting(data.response)"></pre>
                                  <!-- XML/Text Response without highlighting -->
                                  <pre v-else class="mt-2 text-sm bg-gray-900 dark:bg-gray-800 text-gray-100 p-3 rounded overflow-auto max-h-48 font-mono leading-relaxed border border-gray-600 select-text">{{ formatResponseBody(data.response) }}</pre>
                                </div>
                                <div v-else>
                                  <span class="font-medium text-gray-500">No response body</span>
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
            </div>
                     </TabPanel>
         </TabView>
        </div>
       </div>

      <!-- Path Variables Sidebar -->
      <div v-if="isSchemaLoaded && getUniquePathVariables().length > 0" 
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
                    icon="pi pi-plus"
                    @click="addPathVariableValue(variable)"
                    size="small"
                    class="bg-white border border-gray-300 text-blue-600 hover:bg-gray-50"
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
                      icon="pi pi-minus"
                      @click="removePathVariableValue(variable, index)"
                      size="small"
                      text
                      rounded
                      class="text-red-600"
                    />
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

<style scoped>
/* Make column resizers visible */
:deep(.p-datatable .p-datatable-thead > tr > th) {
  position: relative;
}

:deep(.p-datatable .p-datatable-thead > tr > th .p-column-resizer) {
  position: absolute;
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
</style>
