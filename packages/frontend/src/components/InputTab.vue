<template>
  <div>
    <div class="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
      <h3 class="font-semibold text-blue-800 dark:text-blue-200 mb-2">Step 1: Input Your Schema</h3>
      <p class="text-sm text-blue-700 dark:text-blue-300">
        Choose between OpenAPI Schema (JSON) or Raw Endpoints format.
      </p>
    </div>
    <div class="space-y-4">
      <div><label class="block text-sm font-medium mb-2">Base URL</label><InputText :modelValue="baseUrl" @update:modelValue="$emit('update:baseUrl', $event)" placeholder="http://localhost:3000" class="w-full" /></div>
      
      <!-- Input Mode Toggle -->
      <div class="flex gap-2 mb-4">
        <Button 
          :label="'OpenAPI Schema'" 
          :severity="inputMode === 'schema' ? 'success' : 'secondary'"
          :disabled="inputMode === 'raw' && rawEndpoints.trim().length > 0"
          @click="$emit('update:inputMode', 'schema')"
          class="flex-1"
          :title="inputMode === 'raw' && rawEndpoints.trim().length > 0 ? 'Clear Raw Endpoints first to switch mode' : ''"
        />
        <Button 
          :label="'Raw'" 
          :severity="inputMode === 'raw' ? 'success' : 'secondary'"
          :disabled="inputMode === 'schema' && schemaText.trim().length > 0"
          @click="$emit('update:inputMode', 'raw')"
          class="flex-1"
          :title="inputMode === 'schema' && schemaText.trim().length > 0 ? 'Clear OpenAPI Schema first to switch mode' : ''"
        />
      </div>

      <!-- OpenAPI Schema Input -->
      <div v-if="inputMode === 'schema'">
        <div><label class="block text-sm font-medium mb-2">OpenAPI Schema (JSON)</label><Textarea :modelValue="schemaText" @update:modelValue="$emit('update:schemaText', $event)" @input="$emit('validate')" placeholder="Paste your OpenAPI schema here..." class="w-full h-64 font-mono text-sm" /></div>
        <div v-if="validationResult">
          <Message :severity="validationResult.valid ? 'success' : 'error'" :closable="false">
            <template #messageicon><i :class="validationResult.valid ? 'pi pi-check' : 'pi pi-exclamation-triangle'"></i></template>
            <div><div class="font-semibold">{{ validationResult.valid ? 'Schema is valid!' : 'Schema validation failed' }}</div><div v-if="validationResult.errors.length > 0" class="mt-2"><div v-for="error in validationResult.errors" :key="error" class="text-sm">• {{ error }}</div></div></div>
          </Message>
        </div>
        <Button label="Load Schema" @click="$emit('loadSchema')" :disabled="!validationResult?.valid" class="w-full mt-4" />
      </div>

      <!-- Raw Endpoints Input -->
      <div v-if="inputMode === 'raw'">
        <div><label class="block text-sm font-medium mb-2">Raw Endpoints</label><Textarea :modelValue="rawEndpoints" @update:modelValue="$emit('update:rawEndpoints', $event)" placeholder="Enter endpoints, one per line.&#10;With method: [PATCH] /api-integrations/{id}&#10;Without method: /api-integrations/{id}" class="w-full h-64 font-mono text-sm" /></div>
        <div class="text-xs text-gray-500 mt-1">
          <p>Format examples:</p>
          <ul class="list-disc list-inside ml-2">
            <li>With method: <code>[PATCH] /api-integrations/{id}</code></li>
            <li>Without method: <code>/api-integrations/{id}</code></li>
          </ul>
        </div>
        <Button label="Load Raw Endpoints" @click="$emit('loadRawEndpoints')" :disabled="!rawEndpoints?.trim()" class="w-full mt-4" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Button from "primevue/button";
import Message from "primevue/message";

defineProps<{
  baseUrl: string;
  schemaText: string;
  validationResult: { valid: boolean; errors: string[] } | null;
  inputMode: 'schema' | 'raw';
  rawEndpoints: string;
}>();

defineEmits<{
  'update:baseUrl': [value: string];
  'update:schemaText': [value: string];
  'update:inputMode': [value: 'schema' | 'raw'];
  'update:rawEndpoints': [value: string];
  'validate': [];
  'loadSchema': [];
  'loadRawEndpoints': [];
}>();
</script>

