<template>
  <div>
    <div class="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
      <h3 class="font-semibold text-blue-800 dark:text-blue-200 mb-2">Step 1: Input Your Schema</h3>
      <p class="text-sm text-blue-700 dark:text-blue-300">
        Paste your OpenAPI schema (JSON/YAML) or raw endpoints. The application will auto-detect the format.
      </p>
    </div>
    <div class="space-y-4">
      <div><label class="block text-sm font-medium mb-2">Base URL</label><InputText :modelValue="baseUrl" @update:modelValue="$emit('update:baseUrl', $event)" placeholder="http://localhost:3000" class="w-full" /></div>
      
      <!-- Unified Input -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="block text-sm font-medium">Input (JSON, YAML, or Raw Endpoints)</label>
          <Button 
            v-if="schemaTextExcluded" 
            label="Download Schema" 
            icon="pi pi-download" 
            @click="$emit('downloadSchema')" 
            size="small"
            severity="warning"
            :title="'Schema was excluded from session data due to size. Click to download.'"
          />
        </div>
        <div v-if="schemaTextExcluded" class="mb-2">
          <Message severity="warn" :closable="false">
            <template #messageicon><i class="pi pi-exclamation-triangle"></i></template>
            <div>
              <div class="font-semibold">Schema too large</div>
              <div class="text-sm mt-1">The schema was excluded from session data to avoid payload size limits. Use the download button to save it locally.</div>
            </div>
          </Message>
        </div>
        <div class="mb-2">
          <Textarea 
            :modelValue="unifiedInput" 
            @update:modelValue="handleInputUpdate($event)" 
            @input="$emit('validate')" 
            placeholder="Paste your OpenAPI schema (JSON/YAML) or raw endpoints here...&#10;&#10;Examples:&#10;• OpenAPI JSON: {&quot;openapi&quot;: &quot;3.0.0&quot;, ...}&#10;• OpenAPI YAML: openapi: 3.0.0&#10;• Raw with method: [GET] /api/users/{id}&#10;• Raw without method: /api/users/{id}" 
            class="w-full h-64 font-mono text-sm" 
          />
        </div>
        <div v-if="detectedType" class="mb-2">
          <Message :severity="detectedTypeSeverity" :closable="false">
            <template #messageicon><i :class="detectedTypeIcon"></i></template>
            <div class="text-sm">Detected: <strong>{{ detectedType }}</strong></div>
          </Message>
        </div>
        <div v-if="validationResult">
          <Message :severity="validationResult.valid ? 'success' : 'error'" :closable="false">
            <template #messageicon><i :class="validationResult.valid ? 'pi pi-check' : 'pi pi-exclamation-triangle'"></i></template>
            <div><div class="font-semibold">{{ validationResult.valid ? 'Schema is valid!' : 'Schema validation failed' }}</div><div v-if="validationResult.errors.length > 0" class="mt-2"><div v-for="error in validationResult.errors" :key="error" class="text-sm">• {{ error }}</div></div></div>
          </Message>
        </div>
        <Button 
          :label="loadButtonLabel" 
          @click="handleLoad" 
          :disabled="!canLoad" 
          class="w-full mt-4" 
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Button from "primevue/button";
import Message from "primevue/message";

const props = defineProps<{
  baseUrl: string;
  schemaText: string;
  validationResult: { valid: boolean; errors: string[] } | null;
  rawEndpoints: string;
  schemaTextExcluded?: boolean;
}>();

const emit = defineEmits<{
  'update:baseUrl': [value: string];
  'update:schemaText': [value: string];
  'update:rawEndpoints': [value: string];
  'validate': [];
  'loadSchema': [];
  'loadRawEndpoints': [];
  'downloadSchema': [];
}>();

// Unified input value
const unifiedInput = ref('');

// Detected input type
const detectedType = ref<string>('');
const detectedTypeSeverity = computed(() => {
  if (detectedType.value === 'OpenAPI Schema (JSON)' || detectedType.value === 'OpenAPI Schema (YAML)') {
    return 'success';
  } else if (detectedType.value === 'Raw Endpoints') {
    return 'info';
  }
  return 'warn';
});

const detectedTypeIcon = computed(() => {
  if (detectedType.value === 'OpenAPI Schema (JSON)' || detectedType.value === 'OpenAPI Schema (YAML)') {
    return 'pi pi-check-circle';
  } else if (detectedType.value === 'Raw Endpoints') {
    return 'pi pi-info-circle';
  }
  return 'pi pi-question-circle';
});

// Detect input type
const detectInputType = (text: string): string => {
  const trimmed = text.trim();
  
  if (!trimmed) {
    return '';
  }
  
  // Check if it's JSON (starts with { or [)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      // Check if it looks like OpenAPI schema
      if (parsed && typeof parsed === 'object' && (parsed.openapi || parsed.swagger || parsed.paths)) {
        return 'OpenAPI Schema (JSON)';
      }
    } catch {
      // Not valid JSON
    }
  }
  
  // Check if it's YAML (starts with openapi:, swagger:, or ---)
  if (trimmed.startsWith('openapi:') || trimmed.startsWith('swagger:') || trimmed.startsWith('---')) {
    return 'OpenAPI Schema (YAML)';
  }
  
  // Check if it looks like YAML (has colons and newlines, doesn't start with { or [)
  if (trimmed.includes('\n') && trimmed.includes(':') && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    // Try to see if it has OpenAPI-like structure
    if (trimmed.includes('openapi:') || trimmed.includes('swagger:') || trimmed.includes('paths:')) {
      return 'OpenAPI Schema (YAML)';
    }
  }
  
  // Check if it's raw endpoints (lines starting with / or [METHOD] /path)
  const lines = trimmed.split('\n').filter(line => line.trim());
  if (lines.length > 0) {
    const looksLikeEndpoints = lines.every(line => {
      const trimmedLine = line.trim();
      // Check for [METHOD] /path format
      if (/^\[[A-Z]+\]\s+\//.test(trimmedLine)) {
        return true;
      }
      // Check for /path format
      if (trimmedLine.startsWith('/')) {
        return true;
      }
      return false;
    });
    
    if (looksLikeEndpoints) {
      return 'Raw Endpoints';
    }
  }
  
  return 'Unknown format';
};

// Handle input update
const handleInputUpdate = (value: string) => {
  isUpdatingFromProps.value = true;
  
  unifiedInput.value = value;
  
  // Detect type
  detectedType.value = detectInputType(value);
  
  // Update appropriate prop based on detected type
  if (detectedType.value === 'OpenAPI Schema (JSON)' || detectedType.value === 'OpenAPI Schema (YAML)') {
    emit('update:schemaText', value);
    emit('update:rawEndpoints', '');
  } else if (detectedType.value === 'Raw Endpoints') {
    emit('update:rawEndpoints', value);
    emit('update:schemaText', '');
  } else {
    // Try to update both, let validation handle it
    emit('update:schemaText', value);
    emit('update:rawEndpoints', value);
  }
  
  // Reset flag after a short delay to allow reactive updates to complete
  setTimeout(() => {
    isUpdatingFromProps.value = false;
  }, 0);
};

// Load button label and state
const loadButtonLabel = computed(() => {
  if (detectedType.value === 'OpenAPI Schema (JSON)' || detectedType.value === 'OpenAPI Schema (YAML)') {
    return 'Load Schema';
  } else if (detectedType.value === 'Raw Endpoints') {
    return 'Load Raw Endpoints';
  }
  return 'Load';
});

const canLoad = computed(() => {
  if (detectedType.value === 'OpenAPI Schema (JSON)' || detectedType.value === 'OpenAPI Schema (YAML)') {
    return props.validationResult?.valid || false;
  } else if (detectedType.value === 'Raw Endpoints') {
    return unifiedInput.value.trim().length > 0;
  }
  return false;
});

// Handle load button click
const handleLoad = () => {
  if (detectedType.value === 'OpenAPI Schema (JSON)' || detectedType.value === 'OpenAPI Schema (YAML)') {
    emit('loadSchema');
  } else if (detectedType.value === 'Raw Endpoints') {
    emit('loadRawEndpoints');
  }
};

// Track if we're updating from props to prevent circular updates
const isUpdatingFromProps = ref(false);

// Sync unifiedInput with props when they change externally (e.g., when loading a session)
watch([() => props.schemaText, () => props.rawEndpoints], ([schemaTextVal, rawEndpointsVal]: [string, string]) => {
  // Skip if we're in the middle of updating from user input
  if (isUpdatingFromProps.value) return;
  
  // If both props are empty, clear unifiedInput
  const schemaEmpty = !schemaTextVal || schemaTextVal.trim() === '';
  const rawEmpty = !rawEndpointsVal || rawEndpointsVal.trim() === '';
  
  if (schemaEmpty && rawEmpty) {
    if (unifiedInput.value.trim() !== '') {
      unifiedInput.value = '';
      detectedType.value = '';
    }
    return;
  }
  
  // Determine which value to use based on which one has content
  let valueToUse = '';
  if (!schemaEmpty && schemaTextVal) {
    valueToUse = schemaTextVal;
  } else if (!rawEmpty && rawEndpointsVal) {
    valueToUse = rawEndpointsVal;
  }
  
  // Only update if we have a value and it's different from current
  if (valueToUse && (unifiedInput.value === '' || unifiedInput.value !== valueToUse)) {
    unifiedInput.value = valueToUse;
    detectedType.value = detectInputType(valueToUse);
  }
}, { immediate: true });
</script>
