<template>
  <div class="space-y-4">
    <div v-if="!hasResults" class="text-center py-8 text-gray-500">
      <i class="pi pi-chart-bar text-4xl mb-4"></i>
      <p>No test results yet. Run tests from the Endpoints tab.</p>
    </div>
    <div v-else>
      <Card>
        <template #title>
          <div class="flex items-center justify-between">
            <span>{{ isQueryActive ? 'Filtered Test Results' : 'Test Results' }}<span v-if="isQueryActive" class="text-sm text-gray-500 ml-2">({{ filteredTestResults.length }} of {{ allTestResults.length }})</span></span>
            <Button label="Clear All Results" icon="pi pi-trash" @click="$emit('clearAllResults')" severity="danger" size="small" />
          </div>
        </template>
        <template #content>
          <div class="space-y-2">
            <div v-for="data in (isQueryActive ? filteredTestResults : allTestResults)" :key="getResultId(data)" class="border border-gray-200 dark:border-gray-700 rounded-lg">
              <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer" @click="$emit('toggleResultExpansion', getResultId(data))">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-4 flex-1">
                    <div class="flex-1"><div class="font-medium">{{ data.testCase.name }}</div><div class="text-sm text-gray-500">{{ data.testCase.description }}</div></div>
                    <span class="px-2 py-1 rounded text-xs font-medium" :class="{'bg-blue-100 text-blue-800': data.testCase.method === 'GET', 'bg-green-100 text-green-800': data.testCase.method === 'POST', 'bg-yellow-100 text-yellow-800': data.testCase.method === 'PUT', 'bg-red-100 text-red-800': data.testCase.method === 'DELETE'}">{{ data.testCase.method }}</span>
                    <code class="text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 rounded">{{ data.testCase.path }}</code>
                    <div class="flex items-center gap-2"><span :class="getStatusClass(data.success)">{{ getStatusIcon(data.success) }}</span><span :class="getStatusClass(data.success)">{{ data.status }}</span></div>
                    <span class="text-sm">{{ formatResponseTime(data.responseTime) }}</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ getResponseSize(data.response) }}</span>
                  </div>
                  <Button :icon="isResultExpanded(getResultId(data)) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" size="small" text rounded class="text-gray-500" />
                </div>
                <div v-if="data.combination && Object.keys(data.combination).length > 0" class="mt-2 text-sm text-gray-600"><span class="font-medium">Variables:</span><span v-for="(value, key) in data.combination" :key="key" class="ml-2">{{ key }} = "{{ value }}"</span></div>
              </div>
              <div v-if="isResultExpanded(getResultId(data))" class="border-t border-gray-200 dark:border-gray-700 h-[600px]">
                <div class="flex h-full">
                  <div class="w-1/2 border-r border-gray-200 dark:border-gray-700"><div class="h-full" :ref="el => setRequestEditorContainer(el, getResultId(data))"></div></div>
                  <div class="w-1/2"><div class="h-full" :ref="el => setResponseEditorContainer(el, getResultId(data))"></div></div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from "primevue/button";
import Card from "primevue/card";

defineProps<{
  hasResults: boolean;
  isQueryActive: boolean;
  filteredTestResults: any[];
  allTestResults: any[];
  getResultId: (data: any) => string;
  isResultExpanded: (resultId: string) => boolean;
  getStatusClass: (success: boolean) => string;
  getStatusIcon: (success: boolean) => string;
  formatResponseTime: (time: number) => string;
  getResponseSize: (response: any) => string;
  setRequestEditorContainer: (el: HTMLElement | null, resultId: string) => void;
  setResponseEditorContainer: (el: HTMLElement | null, resultId: string) => void;
}>();

defineEmits<{
  'clearAllResults': [];
  'toggleResultExpansion': [resultId: string];
}>();
</script>

