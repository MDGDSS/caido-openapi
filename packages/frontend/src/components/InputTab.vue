<template>
  <div>
    <div class="mb-4 p-4  dark:bg-blue-900/20 rounded-lg">
      <h3 class="font-semibold text-blue-800 dark:text-blue-200 mb-2">Step 1: Input Your Schema</h3>
      <p class="text-sm text-blue-700 dark:text-blue-300">
        Paste your OpenAPI schema (JSON/YAML) or raw endpoints. The application will auto-detect the format. You can also fetch a schema from a URL or upload a file.
      </p>
    </div>
    <div class="space-y-4">
      <div><label class="block text-sm font-medium mb-2">Base URL</label><InputText :modelValue="baseUrl" @update:modelValue="$emit('update:baseUrl', $event)" placeholder="http://localhost:3000" class="w-full" /></div>
      
      <!-- URL Fetch -->
      <div>
        <div class="flex items-center gap-2 mb-2">
          <label class="block text-sm font-medium flex-1">Fetch Schema from URL</label>
          <Button 
            label="Fetch" 
            icon="pi pi-download" 
            @click="handleUrlFetch" 
            size="small"
            severity="secondary"
            :loading="isFetching"
            :disabled="isFetching || !schemaUrl.trim()"
            :title="'Fetch OpenAPI schema from URL (JSON/YAML) for faster processing'"
          />
        </div>
        <InputText 
          v-model="schemaUrl" 
          placeholder="https://api.example.com/openapi.json or https://api.example.com/openapi.yaml" 
          class="w-full"
          @keyup.enter="handleUrlFetch"
        />
      </div>
      
      <!-- Unified Input -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="block text-sm font-medium">Input (JSON, YAML, or Raw Endpoints)</label>
          <div class="flex gap-2">
            <input 
              ref="fileInputRef"
              type="file" 
              accept=".json,.yaml,.yml,.txt" 
              @change="handleFileUpload"
              class="hidden"
            />
            <Button 
              label="Upload File" 
              icon="pi pi-upload" 
              @click="triggerFileUpload"
              size="small"
              severity="secondary"
              :title="'Upload OpenAPI schema file (JSON/YAML) for faster processing'"
            />
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
import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();

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
  'fileUploaded': [schemaText: string, testCases: any[], parsedSchema: any];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const isFetching = ref(false);
const schemaUrl = ref('');

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

// Trigger file input click
const triggerFileUpload = () => {
  fileInputRef.value?.click();
};

// Process fetched/uploaded content (shared logic for file upload and URL fetch)
const processContent = async (content: string) => {
  // First, detect if this is raw endpoints format
  const detected = detectInputType(content);
  
  // If it's raw endpoints, handle it directly without backend processing
  if (detected === 'Raw Endpoints') {
    unifiedInput.value = content;
    detectedType.value = detected;
    emit('update:rawEndpoints', content);
    emit('update:schemaText', '');
    // Trigger load raw endpoints
    emit('loadRawEndpoints');
    return;
  }
  
  // Otherwise, process as OpenAPI schema (JSON/YAML)
  const contentSize = content.length;
  const CHUNK_SIZE = 1000 * 1024; // 1000KB
  
  if (contentSize <= CHUNK_SIZE) {
    // Small enough to send in one call
    const result = await sdk.backend.processUploadedFile(content);
    
    if (result.kind === 'Error') {
      throw new Error(result.error);
    }
    
    // Update the unified input with the processed schema text
    unifiedInput.value = result.value.schemaText;
    detectedType.value = detectInputType(result.value.schemaText);
    
    // Emit the processed data to parent
    emit('update:schemaText', result.value.schemaText);
    emit('fileUploaded', result.value.schemaText, result.value.testCases, result.value.parsedSchema);
  } else {
    // Too large - need to chunk
    const numChunks = Math.ceil(contentSize / CHUNK_SIZE);
    const metadata = { chunks: numChunks, totalLength: contentSize };
    
    // Send chunks sequentially
    for (let i = 0; i < numChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, contentSize);
      const chunk = content.substring(start, end);
      
      // Only pass metadata with the first chunk
      let result;
      if (i === 0) {
        result = await sdk.backend.saveFileUploadChunk(i, chunk, metadata);
      } else {
        result = await sdk.backend.saveFileUploadChunk(i, chunk);
      }
      
      if (result.kind === 'Error') {
        throw new Error(`Failed to upload chunk ${i + 1}/${numChunks}: ${result.error}`);
      }
    }
    
    // Process the reassembled content
    const processResult = await sdk.backend.processUploadedFileChunks();
    
    if (processResult.kind === 'Error') {
      throw new Error(processResult.error);
    }
    
    // Update the unified input with the processed schema text
    unifiedInput.value = processResult.value.schemaText;
    detectedType.value = detectInputType(processResult.value.schemaText);
    
    // Emit the processed data to parent
    emit('update:schemaText', processResult.value.schemaText);
    emit('fileUploaded', processResult.value.schemaText, processResult.value.testCases, processResult.value.parsedSchema);
  }
};

// Handle URL fetch
const handleUrlFetch = async () => {
  const url = schemaUrl.value.trim();
  
  if (!url) {
    alert('Please enter a URL');
    return;
  }
  
  // Basic URL validation
  try {
    new URL(url);
  } catch {
    alert('Please enter a valid URL');
    return;
  }
  
  isFetching.value = true;
  
  try {
    // Fetch the content from URL using backend (bypasses CORS)
    // Use a long timeout (5 minutes = 300000ms) for large schemas
    const result = await sdk.backend.fetchSchemaFromUrl(url, 300000);
    
    if (result.kind === 'Error') {
      throw new Error(result.error);
    }
    
    const content = result.value.content;
    
    if (!content || content.trim().length === 0) {
      throw new Error('The URL returned empty content');
    }
    
    // Process the content the same way as file upload
    await processContent(content);
    
  } catch (error) {
    console.error('URL fetch error:', error);
    alert(`Failed to fetch schema from URL: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    isFetching.value = false;
  }
};

// Handle file upload
const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  
  if (!file) return;
  
  isUploading.value = true;
  
  try {
    // Read file as text
    const fileContent = await file.text();
    
    // Process the content using shared logic
    await processContent(fileContent);
    
  } catch (error) {
    console.error('File upload error:', error);
    alert(`Failed to process file: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    isUploading.value = false;
    // Reset file input
    if (target) {
      target.value = '';
    }
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
