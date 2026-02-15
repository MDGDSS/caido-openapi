<template>
  <div>
    <div v-if="!isSchemaLoaded" class="text-center py-8 text-gray-500">
      <i class="pi pi-list text-4xl mb-4"></i>
      <p>No schema loaded yet. Load a valid schema from the Input tab.</p>
    </div>
    <div v-else>
      <!-- <div class="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
        <h3 class="font-semibold text-green-800 dark:text-green-200 mb-2">Step 2: Configure & Test</h3>
        <p class="text-sm text-green-700 dark:text-green-300">
          Configure your test settings and run tests. You can test individual endpoints or run all tests at once.
        </p>
      </div> -->
          <div class="space-y-4">
            <!-- Test Error Message -->
            <div v-if="testErrorMessage">
              <Message severity="error" :closable="true" @close="$emit('clearTestError')">
                <template #messageicon><i class="pi pi-exclamation-triangle"></i></template>
                <div>
                  <div class="font-semibold">Test Error</div>
                  <div class="mt-1 text-sm">{{ testErrorMessage }}</div>
                </div>
              </Message>
            </div>
            <Card>
              <template #title>Test Configuration</template>
              <template #content>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label class="block text-sm font-medium mb-2">Base URL</label><InputText :modelValue="baseUrl" @update:modelValue="$emit('update:baseUrl', $event)" placeholder="http://localhost:3000" class="w-full" /></div>
                </div>
                <div class="mt-4">
                  <label class="block text-sm font-medium mb-2">Custom Headers</label>
                  <Textarea :modelValue="customHeaders" @update:modelValue="$emit('update:customHeaders', $event)" placeholder="Authorization: Bearer token&#10;X-API-Key: your-api-key&#10;X-Custom-Header: value" class="w-full h-20 text-sm font-mono" rows="3" />
                  <p class="text-xs text-gray-500 mt-1">Enter headers in format: Key: Value (one per line). If you add custom headers, they will replace the default headers completely.</p>
                </div>
                <div class="mt-4 space-y-3">
                  <div class="flex items-center gap-2"><input type="checkbox" id="randomValues" :checked="useRandomValues" @change="$emit('update:useRandomValues', ($event.target as HTMLInputElement).checked)" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2" /><label for="randomValues" class="text-sm font-medium">Use Random Values for Empty Variables</label></div>
                  <p class="text-xs text-gray-500">When enabled, empty path variables will be filled with random strings instead of being left empty.</p>
                </div>
                <div class="mt-4 flex gap-2">
                  <Button label="Test All Endpoints" @click="$emit('runAllTests')" :loading="isLoading" :disabled="isLoading" class="flex-1" />
                  <Button v-if="isLoading || runningTests.size > 0" label="Stop Tests" @click="$emit('stopAllTests')" severity="danger" size="small" />
                  <Button 
                    v-if="isRawMode"
                    :label="isDetermining ? 'Stop Determine' : 'Determine'" 
                    :icon="isDetermining ? 'pi pi-stop' : 'pi pi-search'"
                    @click="isDetermining ? $emit('stopDetermine') : $emit('determineMethods')" 
                    :disabled="!baseUrl?.trim() && !isDetermining"
                    :loading="false"
                    :severity="isDetermining ? 'danger' : 'info'"
                    size="small"
                    :title="isDetermining ? 'Stop determining methods' : 'Send OPTIONS requests to determine HTTP methods for endpoints without methods'"
                  />
                </div>
                <div class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p class="text-sm text-blue-800 dark:text-blue-200">
                    <i class="pi pi-info-circle mr-2"></i>
                    Workers, delay, and timeout settings are now global. Configure them in <strong>Settings</strong> (gear icon in the top bar).
                  </p>
                </div>
              </template>
            </Card>
        <Card>
          <template #title>
            <div class="flex items-center justify-between">
              <span>Endpoints ({{ uniqueEndpointCount }})</span>
              <div class="flex items-center gap-2">
                <InputText :modelValue="endpointSearchQuery" @update:modelValue="$emit('update:endpointSearchQuery', $event)" placeholder="Search endpoints..." class="w-64" size="small" />
                <Button v-if="endpointSearchQuery.trim()" label="Clear" icon="pi pi-times" @click="$emit('clearEndpointSearch')" severity="secondary" size="small" />
              </div>
            </div>
          </template>
          <template #content>
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div class="bg-gray-100 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                <div class="grid grid-cols-5 gap-4 items-center text-sm font-medium text-gray-900 dark:text-gray-100">
                  <div>Method</div><div class="col-span-2">Path</div><div>Status</div><div>Actions</div>
                </div>
              </div>
              <div class="divide-y divide-gray-200 dark:divide-gray-600">
                <template v-for="(item, index) in displayTestCases" :key="item && item.__isGroupHeader ? `group-${item.__groupTag}-${index}` : (item && item.path ? getTestCaseId(item) : `item-${index}`)">
                  <!-- Group Header -->
                  <div v-if="item && item.__isGroupHeader && item.__groupTag" class="bg-gray-100 dark:bg-gray-700 px-4 py-2 border-b-2 border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors" @click="$emit('toggleGroupCollapse', item.__groupTag)">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <i :class="isGroupCollapsed(item.__groupTag) ? 'pi pi-chevron-right' : 'pi pi-chevron-down'" class="text-sm text-gray-600 dark:text-gray-400"></i>
                        <span class="font-semibold text-gray-800 dark:text-gray-200">{{ item.__groupTag }}</span>
                      </div>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ item.__groupCount }} endpoint{{ item.__groupCount !== 1 ? 's' : '' }}</span>
                    </div>
                  </div>
                  <!-- Endpoint Row -->
                  <div v-else-if="item && !item.__isGroupHeader && item.path" :class="index % 2 === 0 ? 'bg-blue-200 dark:bg-blue-900/40' : 'bg-blue-300 dark:bg-blue-900/50'" :style="index % 2 === 0 ? 'background-color: #2f323a' : 'background-color: #353942'">
                    <div class="px-4 py-3 cursor-pointer" @click="$emit('toggleTestCaseExpansion', item)">
                      <div class="grid grid-cols-5 gap-4 items-center">
                        <div>
                          <span v-if="item.hasNoMethod" class="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">NO METHOD</span>
                          <span v-else-if="item.method && item.method !== null" class="px-2 py-1 rounded text-xs font-medium" :class="{'bg-blue-100 text-blue-800': item.method === 'GET', 'bg-green-100 text-green-800': item.method === 'POST', 'bg-yellow-100 text-yellow-800': item.method === 'PUT', 'bg-red-100 text-red-800': item.method === 'DELETE'}">{{ item.method }}</span>
                          <span v-else class="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">-</span>
                        </div>
                        <div class="col-span-2"><code class="text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 rounded whitespace-normal break-words">{{ item.path }}</code></div>
                        <div><div v-if="getTestStatus(item)" class="flex items-center gap-2"><span :class="getStatusClass(getTestStatus(item)!.success)">{{ getStatusIcon(getTestStatus(item)!.success) }}</span><span :class="getStatusClass(getTestStatus(item)!.success)">{{ getTestStatus(item)!.status }}</span></div><div v-else class="text-gray-400 text-sm">Not tested</div></div>
                        <div class="flex items-center gap-2" @click.stop>
                          <Button v-if="!item.hasNoMethod && item.method && item.method !== null" label="Test" size="small" @click="$emit('runSingleTest', item)" :loading="isTestRunning(item)" :disabled="isTestRunning(item) || isLoading" />
                          <Button v-if="item.hasNoMethod" label="All Methods" size="small" @click="$emit('runAllMethods', item)" :loading="isTestRunning(item)" :disabled="isTestRunning(item) || isLoading" severity="info" />
                          <Button v-else-if="!item.hasNoMethod" label="All Methods" size="small" @click="$emit('runAllMethods', item)" :loading="isTestRunning(item)" :disabled="isTestRunning(item) || isLoading" severity="info" />
                          <button 
                            @click="$emit('toggleTestCaseExpansion', item)" 
                            :title="isTestCaseExpanded(item) ? 'Collapse' : 'Expand'"
                            class="p-1 rounded transition-colors"
                            style="min-width: 24px; min-height: 24px; display: inline-flex; align-items: center; justify-content: center; background-color: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.3);"
                          >
                            <i :class="isTestCaseExpanded(item) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="text-xs" style="color: white; font-weight: bold;"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div v-if="!item.__isGroupHeader && isTestCaseExpanded(item)" :class="index % 2 === 0 ? 'bg-blue-200 dark:bg-blue-900/40' : 'bg-blue-300 dark:bg-blue-900/50'" :style="index % 2 === 0 ? 'background-color: #2f323a' : 'background-color: #353942'" class="border-t border-gray-200 dark:border-gray-600 px-4 py-4">
                      <div class="space-y-4">
                        <div v-if="item.pathVariables && item.pathVariables.length > 0">
                          <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Path Variables</h4>
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div v-for="variable in item.pathVariables" :key="variable" class="flex items-center gap-2">
                              <label class="text-sm text-gray-600 dark:text-gray-400 min-w-[100px]">{{ variable }}:</label>
                              <InputText :modelValue="testCasePathVariableValues[getTestCaseId(item)]?.[variable] || ''" @update:modelValue="updateTestCasePathVariable(item, variable, $event)" :placeholder="`Value for ${variable}`" class="flex-1" size="small" />
                            </div>
                          </div>
                        </div>
                        <div v-if="item.parameters && item.parameters.filter((p: any) => p.in === 'query').length > 0">
                          <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Query Parameters</h4>
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div v-for="param in item.parameters.filter((p: any) => p.in === 'query')" :key="param.name" class="flex items-center gap-2">
                              <label class="text-sm text-gray-600 dark:text-gray-400 min-w-[100px]">{{ param.name }}:</label>
                              <InputText :modelValue="testCaseQueryParameterValues[getTestCaseId(item)]?.[param.name] || ''" @update:modelValue="updateTestCaseQueryParameter(item, param.name, $event)" :placeholder="`Value for ${param.name}`" class="flex-1" size="small" />
                            </div>
                          </div>
                        </div>
                        <div v-if="item.parameters && item.parameters.filter((p: any) => p.in === 'header').length > 0">
                          <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Header Parameters</h4>
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div v-for="param in item.parameters.filter((p: any) => p.in === 'header')" :key="param.name" class="flex items-center gap-2">
                              <label class="text-sm text-gray-600 dark:text-gray-400 min-w-[100px]">{{ param.name }}:</label>
                              <InputText :modelValue="testCaseHeaderParameterValues[getTestCaseId(item)]?.[param.name] || ''" @update:modelValue="updateTestCaseHeaderParameter(item, param.name, $event)" :placeholder="`Value for ${param.name}`" class="flex-1" size="small" />
                            </div>
                          </div>
                        </div>
                        <div v-if="item.bodyVariables && Object.keys(item.bodyVariables).length > 0">
                          <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Body Variables</h4>
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div v-for="[key, value] in Object.entries(item.bodyVariables)" :key="key" class="flex items-center gap-2">
                              <label class="text-sm text-gray-600 dark:text-gray-400 min-w-[100px]">{{ key }}:</label>
                              <InputText :modelValue="testCaseBodyVariableValues[getTestCaseId(item)]?.[key] || ''" @update:modelValue="updateTestCaseBodyVariable(item, key, $event)" :placeholder="`Value for ${key}`" class="flex-1" size="small" />
                            </div>
                          </div>
                        </div>
                        <div v-if="(!item.pathVariables || item.pathVariables.length === 0) && (!item.parameters || (item.parameters.filter((p: any) => p.in === 'query').length === 0 && item.parameters.filter((p: any) => p.in === 'header').length === 0)) && (!item.bodyVariables || Object.keys(item.bodyVariables).length === 0)">
                          <p class="text-sm text-gray-500 dark:text-gray-400">No variables to configure for this endpoint.</p>
                        </div>
                        
                        <!-- Request Details Section (cURL and Request URL) -->
                        <div v-if="getTestStatus(item) && item.result" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600" style="user-select: text;">
                          <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Request Details</h4>
                          <div class="space-y-3">
                            <!-- cURL Command -->
                            <div>
                              <span class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">cURL</span>
                              <pre class="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto" style="user-select: text;">{{ generateCurlCommand(item) }}</pre>
                            </div>
                            <!-- Request URL -->
                            <div>
                              <span class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Request URL</span>
                              <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700">
                                <code class="text-xs text-gray-700 dark:text-gray-300" style="user-select: text;">{{ item.result.requestUrl || getRequestUrl(item) }}</code>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <!-- Server Response Section -->
                        <div v-if="getTestStatus(item)" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600" style="user-select: text;">
                          <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Server Response</h4>
                          <div class="space-y-2" style="user-select: text;">
                            <div class="flex items-center gap-2">
                              <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Status:</span>
                              <span :class="getStatusClass(getTestStatus(item)!.success)" class="text-sm font-semibold">{{ getTestStatus(item)!.status }}</span>
                              <span :class="getStatusClass(getTestStatus(item)!.success)">{{ getStatusIcon(getTestStatus(item)!.success) }}</span>
                            </div>
                            <div v-if="getTestStatus(item)!.responseTime" class="flex items-center gap-2">
                              <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Response Time:</span>
                              <span class="text-sm text-gray-700 dark:text-gray-300">{{ formatResponseTime(getTestStatus(item)!.responseTime) }}</span>
                            </div>
                            <div v-if="item.result && item.result.responseHeaders && Object.keys(item.result.responseHeaders).length > 0 && !getTestStatus(item)!.error" class="mt-2">
                              <span class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Response Headers:</span>
                              <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700" style="user-select: text;">
                                <div v-for="(value, key) in item.result.responseHeaders" :key="key" class="text-xs font-mono mb-1" style="user-select: text;">
                                  <span class="text-gray-700 dark:text-gray-300 font-semibold" style="user-select: text;">{{ key }}:</span>
                                  <span class="text-gray-600 dark:text-gray-400 ml-2" style="user-select: text;">{{ value }}</span>
                                </div>
                              </div>
                            </div>
                            <div v-if="getTestStatus(item)!.error" class="mt-2">
                              <span class="text-sm font-medium text-red-600 dark:text-red-400">Error:</span>
                              <p class="text-sm text-red-600 dark:text-red-400 mt-1">{{ getTestStatus(item)!.error }}</p>
                            </div>
                            <div v-if="item.result && item.result.response !== undefined && item.result.response !== null && !getTestStatus(item)!.error" class="mt-2">
                              <span class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">Response Body:</span>
                              <pre class="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto max-h-96 overflow-y-auto" style="user-select: text;">{{ formatResponseBody(item.result.response) }}</pre>
                            </div>
                            <div v-else-if="item.result && !getTestStatus(item)!.error" class="mt-2">
                              <span class="text-sm text-gray-500 dark:text-gray-400">No response body</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Button from "primevue/button";
import Card from "primevue/card";
import Message from "primevue/message";

const props = defineProps<{
  isSchemaLoaded: boolean;
  baseUrl: string;
  customHeaders: string;
  useRandomValues: boolean;
  isLoading: boolean;
  runningTests: Set<string>;
  endpointSearchQuery: string;
  displayTestCases: any[];
  testCasePathVariableValues: Record<string, Record<string, string>>;
  testCaseQueryParameterValues: Record<string, Record<string, string>>;
  testCaseHeaderParameterValues: Record<string, Record<string, string>>;
  testCaseBodyVariableValues: Record<string, Record<string, any>>;
  isTestCaseExpanded: (testCase: any) => boolean;
  isTestRunning: (testCase: any) => boolean;
  getTestStatus: (testCase: any) => { success: boolean; status: number; responseTime: number; error?: string } | null;
  getStatusClass: (success: boolean) => string;
  getStatusIcon: (success: boolean) => string;
  getTestCaseId: (testCase: any) => string;
  formatResponseTime: (time: number) => string;
  testErrorMessage: string | null;
  isRawMode?: boolean;
  isDetermining?: boolean;
  isGroupCollapsed?: (groupTag: string) => boolean;
}>();

const emit = defineEmits<{
  'update:baseUrl': [value: string];
  'update:customHeaders': [value: string];
  'update:useRandomValues': [value: boolean];
  'update:endpointSearchQuery': [value: string];
  'runAllTests': [];
  'stopAllTests': [];
  'toggleTestCaseExpansion': [testCase: any];
  'toggleGroupCollapse': [groupTag: string];
  'runSingleTest': [testCase: any];
  'runAllMethods': [testCase: any];
  'clearEndpointSearch': [];
  'updateTestCasePathVariable': [testCase: any, variable: string, value: string];
  'updateTestCaseQueryParameter': [testCase: any, paramName: string, value: string];
  'updateTestCaseHeaderParameter': [testCase: any, paramName: string, value: string];
  'updateTestCaseBodyVariable': [testCase: any, key: string, value: any];
  'clearTestError': [];
  'determineMethods': [];
  'stopDetermine': [];
}>();

const updateTestCasePathVariable = (testCase: any, variable: string, value: string) => {
  emit('updateTestCasePathVariable', testCase, variable, value);
};

const updateTestCaseQueryParameter = (testCase: any, paramName: string, value: string) => {
  emit('updateTestCaseQueryParameter', testCase, paramName, value);
};

const updateTestCaseHeaderParameter = (testCase: any, paramName: string, value: string) => {
  emit('updateTestCaseHeaderParameter', testCase, paramName, value);
};

const updateTestCaseBodyVariable = (testCase: any, key: string, value: any) => {
  emit('updateTestCaseBodyVariable', testCase, key, value);
};

const formatResponseBody = (response: any): string => {
  if (response === undefined || response === null) {
    return 'No response body';
  }
  
  if (typeof response === 'object') {
    try {
      return JSON.stringify(response, null, 2);
    } catch {
      return String(response);
    }
  }
  
  return String(response);
};

const generateCurlCommand = (testCase: any): string => {
  if (!testCase.result) return '';
  
  const result = testCase.result;
  const method = testCase.method || 'GET';
  const url = result.requestUrl || getRequestUrl(testCase);
  
  if (!url) return '';
  
  let curl = `curl -X '${method}' \\\n  '${url}'`;
  
  // Add headers
  const headers: Record<string, string> = {};
  
  // Add header parameters from test case
  if (testCase.parameters) {
    testCase.parameters.filter((p: any) => p.in === 'header').forEach((param: any) => {
      const value = props.testCaseHeaderParameterValues[props.getTestCaseId(testCase)]?.[param.name];
      if (value) {
        headers[param.name] = value;
      }
    });
  }
  
  // Add custom headers
  if (props.customHeaders) {
    const lines = props.customHeaders.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        if (key && value) {
          headers[key.trim()] = value;
        }
      }
    });
  }
  
  // Add Content-Type if there's a body
  if (result.actualBody && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  }
  
  // Add Accept header if not present
  if (!headers['Accept'] && !headers['accept']) {
    headers['Accept'] = 'application/json';
  }
  
  // Add headers to curl command
  Object.entries(headers).forEach(([key, value]) => {
    curl += ` \\\n  -H '${key}: ${value}'`;
  });
  
  // Add body if present
  if (result.actualBody) {
    const bodyStr = typeof result.actualBody === 'string' 
      ? result.actualBody 
      : JSON.stringify(result.actualBody);
    // Escape single quotes in the body
    curl += ` \\\n  -d '${bodyStr.replace(/'/g, "'\\''")}'`;
  }
  
  return curl;
};

const getRequestUrl = (testCase: any): string => {
  if (testCase.result?.requestUrl) {
    return testCase.result.requestUrl;
  }
  
  let path = testCase.path || '';
  
  // Replace path variables
  if (testCase.pathVariables && props.testCasePathVariableValues[props.getTestCaseId(testCase)]) {
    testCase.pathVariables.forEach((variable: string) => {
      const value = props.testCasePathVariableValues[props.getTestCaseId(testCase)]?.[variable] || `{${variable}}`;
      path = path.replace(`{${variable}}`, value);
    });
  }
  
  // Add query parameters
  const queryParams: string[] = [];
  if (testCase.parameters) {
    testCase.parameters.filter((p: any) => p.in === 'query').forEach((param: any) => {
      const value = props.testCaseQueryParameterValues[props.getTestCaseId(testCase)]?.[param.name];
      if (value) {
        queryParams.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(value)}`);
      }
    });
  }
  
  const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
  const baseUrl = props.baseUrl.endsWith('/') ? props.baseUrl.slice(0, -1) : props.baseUrl;
  const pathWithSlash = path.startsWith('/') ? path : `/${path}`;
  
  return `${baseUrl}${pathWithSlash}${queryString}`;
};

// Helper function to check if a group is collapsed
const isGroupCollapsed = (groupTag: string): boolean => {
  if (props.isGroupCollapsed) {
    return props.isGroupCollapsed(groupTag);
  }
  return false;
};

// Count unique endpoints (excluding group headers and duplicates)
const uniqueEndpointCount = computed(() => {
  const uniqueIds = new Set<string>();
  props.displayTestCases.forEach(item => {
    if (!item.__isGroupHeader && item.path) {
      const id = props.getTestCaseId(item);
      uniqueIds.add(id);
    }
  });
  return uniqueIds.size;
});
</script>

