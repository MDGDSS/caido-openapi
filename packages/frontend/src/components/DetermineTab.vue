<template>
  <div class="h-full flex flex-col">
    <div class="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
      <h3 class="font-semibold text-purple-800 dark:text-purple-200 mb-2">Determine HTTP Methods</h3>
      <p class="text-sm text-purple-700 dark:text-purple-300">
        Results from OPTIONS requests. Format: [METHOD] Path (one per line).
      </p>
    </div>
    
    <div class="flex-1 flex flex-col">
      <div class="mb-2 flex items-center justify-between">
        <label class="block text-sm font-medium">Determined Methods</label>
        <div class="flex gap-2">
          <Button 
            label="Copy" 
            icon="pi pi-copy" 
            @click="copyToClipboard" 
            size="small"
            :disabled="!determinedResults"
          />
          <Button 
            label="Clear" 
            icon="pi pi-trash" 
            @click="clearResults" 
            size="small"
            severity="danger"
            :disabled="!determinedResults"
          />
        </div>
      </div>
      <Textarea 
        :modelValue="determinedResults" 
        @update:modelValue="$emit('update:determinedResults', $event)" 
        placeholder="Results will appear here in format:&#10;[GET] /api/users&#10;[POST] /api/users&#10;[PUT] /api/users/{id}&#10;[DELETE] /api/users/{id}"
        class="w-full font-mono text-sm"
        style="min-height: 500px; height: 70vh;"
        :disabled="isDetermining"
      />
      <div v-if="isDetermining" class="mt-2 text-sm text-gray-500 dark:text-gray-400">
        <i class="pi pi-spin pi-spinner mr-2"></i>
        Determining methods for endpoints...
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Textarea from "primevue/textarea";
import Button from "primevue/button";

const props = defineProps<{
  determinedResults: string;
  isDetermining: boolean;
}>();

const emit = defineEmits<{
  'update:determinedResults': [value: string];
  'clearResults': [];
  'copyToClipboard': [];
}>();

const copyToClipboard = () => {
  if (props.determinedResults) {
    navigator.clipboard.writeText(props.determinedResults).then(() => {
      // Optional: show a toast notification
    });
  }
  emit('copyToClipboard');
};

const clearResults = () => {
  emit('clearResults');
};

</script>

