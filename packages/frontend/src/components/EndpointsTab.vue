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
              <span>Endpoints ({{ displayTestCases.length }})</span>
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
                <div v-for="(testCase, index) in displayTestCases" :key="`${testCase.method || 'NO_METHOD'}-${testCase.path}`" :class="index % 2 === 0 ? 'bg-blue-200 dark:bg-blue-900/40' : 'bg-blue-300 dark:bg-blue-900/50'" :style="index % 2 === 0 ? 'background-color: #2f323a' : 'background-color: #353942'">
                  <div class="px-4 py-3 cursor-pointer" @click="$emit('toggleTestCaseExpansion', testCase)">
                    <div class="grid grid-cols-5 gap-4 items-center">
                      <div><span v-if="testCase.method && testCase.method !== null" class="px-2 py-1 rounded text-xs font-medium" :class="{'bg-blue-100 text-blue-800': testCase.method === 'GET', 'bg-green-100 text-green-800': testCase.method === 'POST', 'bg-yellow-100 text-yellow-800': testCase.method === 'PUT', 'bg-red-100 text-red-800': testCase.method === 'DELETE'}">{{ testCase.method }}</span><span v-else class="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">-</span></div>
                      <div class="col-span-2"><code class="text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 rounded whitespace-normal break-words">{{ testCase.path }}</code></div>
                      <div><div v-if="getTestStatus(testCase)" class="flex items-center gap-2"><span :class="getStatusClass(getTestStatus(testCase)!.success)">{{ getStatusIcon(getTestStatus(testCase)!.success) }}</span><span :class="getStatusClass(getTestStatus(testCase)!.success)">{{ getTestStatus(testCase)!.status }}</span></div><div v-else class="text-gray-400 text-sm">Not tested</div></div>
                      <div class="flex items-center gap-2" @click.stop>
                        <Button v-if="testCase.method && testCase.method !== null" label="Test" size="small" @click="$emit('runSingleTest', testCase)" :loading="isTestRunning(testCase)" :disabled="isTestRunning(testCase) || isLoading" />
                        <Button label="All Methods" size="small" @click="$emit('runAllMethods', testCase)" :loading="isTestRunning(testCase)" :disabled="isTestRunning(testCase) || isLoading" severity="info" />
                        <button 
                          @click="$emit('toggleTestCaseExpansion', testCase)" 
                          :title="isTestCaseExpanded(testCase) ? 'Collapse' : 'Expand'"
                          class="p-1 rounded transition-colors"
                          style="min-width: 24px; min-height: 24px; display: inline-flex; align-items: center; justify-content: center; background-color: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.3);"
                        >
                          <i :class="isTestCaseExpanded(testCase) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="text-xs" style="color: white; font-weight: bold;"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div v-if="isTestCaseExpanded(testCase)" :class="index % 2 === 0 ? 'bg-blue-200 dark:bg-blue-900/40' : 'bg-blue-300 dark:bg-blue-900/50'" :style="index % 2 === 0 ? 'background-color: #2f323a' : 'background-color: #353942'" class="border-t border-gray-200 dark:border-gray-600 px-4 py-4">
                    <div class="space-y-4">
                      <div v-if="testCase.pathVariables && testCase.pathVariables.length > 0">
                        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Path Variables</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div v-for="variable in testCase.pathVariables" :key="variable" class="flex items-center gap-2">
                            <label class="text-sm text-gray-600 dark:text-gray-400 min-w-[100px]">{{ variable }}:</label>
                            <InputText :modelValue="testCasePathVariableValues[getTestCaseId(testCase)]?.[variable] || ''" @update:modelValue="updateTestCasePathVariable(testCase, variable, $event)" :placeholder="`Value for ${variable}`" class="flex-1" size="small" />
                          </div>
                        </div>
                      </div>
                      <div v-if="testCase.parameters && testCase.parameters.filter((p: any) => p.in === 'query').length > 0">
                        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Query Parameters</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div v-for="param in testCase.parameters.filter((p: any) => p.in === 'query')" :key="param.name" class="flex items-center gap-2">
                            <label class="text-sm text-gray-600 dark:text-gray-400 min-w-[100px]">{{ param.name }}:</label>
                            <InputText :modelValue="testCaseQueryParameterValues[getTestCaseId(testCase)]?.[param.name] || ''" @update:modelValue="updateTestCaseQueryParameter(testCase, param.name, $event)" :placeholder="`Value for ${param.name}`" class="flex-1" size="small" />
                          </div>
                        </div>
                      </div>
                      <div v-if="testCase.bodyVariables && Object.keys(testCase.bodyVariables).length > 0">
                        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Body Variables</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div v-for="[key, value] in Object.entries(testCase.bodyVariables)" :key="key" class="flex items-center gap-2">
                            <label class="text-sm text-gray-600 dark:text-gray-400 min-w-[100px]">{{ key }}:</label>
                            <InputText :modelValue="testCaseBodyVariableValues[getTestCaseId(testCase)]?.[key] || ''" @update:modelValue="updateTestCaseBodyVariable(testCase, key, $event)" :placeholder="`Value for ${key}`" class="flex-1" size="small" />
                          </div>
                        </div>
                      </div>
                      <div v-if="(!testCase.pathVariables || testCase.pathVariables.length === 0) && (!testCase.parameters || testCase.parameters.filter((p: any) => p.in === 'query').length === 0) && (!testCase.bodyVariables || Object.keys(testCase.bodyVariables).length === 0)">
                        <p class="text-sm text-gray-500 dark:text-gray-400">No variables to configure for this endpoint.</p>
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
  </div>
</template>

<script setup lang="ts">
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Button from "primevue/button";
import Card from "primevue/card";

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
  testCaseBodyVariableValues: Record<string, Record<string, any>>;
  isTestCaseExpanded: (testCase: any) => boolean;
  isTestRunning: (testCase: any) => boolean;
  getTestStatus: (testCase: any) => { success: boolean; status: number; responseTime: number; error?: string } | null;
  getStatusClass: (success: boolean) => string;
  getStatusIcon: (success: boolean) => string;
  getTestCaseId: (testCase: any) => string;
}>();

const emit = defineEmits<{
  'update:baseUrl': [value: string];
  'update:customHeaders': [value: string];
  'update:useRandomValues': [value: boolean];
  'update:endpointSearchQuery': [value: string];
  'runAllTests': [];
  'stopAllTests': [];
  'toggleTestCaseExpansion': [testCase: any];
  'runSingleTest': [testCase: any];
  'runAllMethods': [testCase: any];
  'clearEndpointSearch': [];
  'updateTestCasePathVariable': [testCase: any, variable: string, value: string];
  'updateTestCaseQueryParameter': [testCase: any, paramName: string, value: string];
  'updateTestCaseBodyVariable': [testCase: any, key: string, value: any];
}>();

const updateTestCasePathVariable = (testCase: any, variable: string, value: string) => {
  emit('updateTestCasePathVariable', testCase, variable, value);
};

const updateTestCaseQueryParameter = (testCase: any, paramName: string, value: string) => {
  emit('updateTestCaseQueryParameter', testCase, paramName, value);
};

const updateTestCaseBodyVariable = (testCase: any, key: string, value: any) => {
  emit('updateTestCaseBodyVariable', testCase, key, value);
};
</script>

