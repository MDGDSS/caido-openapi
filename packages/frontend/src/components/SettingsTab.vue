<template>
  <div class="space-y-4">
    <Card>
      <template #title>Global Test Configuration</template>
      <template #content>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">Number of Workers</label>
            <InputNumber 
              :modelValue="workers" 
              @update:modelValue="$emit('update:workers', $event)" 
              :min="1" 
              :max="10" 
              class="w-full" 
              placeholder="10" 
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Delay Between Requests (ms)</label>
            <InputNumber 
              :modelValue="delayBetweenRequests" 
              @update:modelValue="$emit('update:delayBetweenRequests', $event)" 
              :min="0" 
              :max="10000" 
              class="w-full" 
              placeholder="100" 
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Timeout (ms)</label>
            <InputNumber 
              :modelValue="timeout" 
              @update:modelValue="$emit('update:timeout', $event)" 
              :min="1000" 
              :max="120000" 
              class="w-full" 
              placeholder="30000" 
            />
          </div>
        </div>
        <div class="mt-4 space-y-3">
          <div class="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="allowDelete" 
              :checked="allowDeleteInAllMethods" 
              @change="$emit('update:allowDeleteInAllMethods', ($event.target as HTMLInputElement).checked)" 
              class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2" 
            />
            <label for="allowDelete" class="text-sm font-medium">Allow DELETE in All Methods Test</label>
          </div>
          <p class="text-xs text-gray-500">When enabled, DELETE method will be included when running "All Methods" test. When disabled, DELETE requests will be skipped.</p>
           <!-- TODO le remettre et corriger quand spam-->
          <!-- <div class="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="disableGroupByTags" 
              :checked="disableGroupByTags" 
              @change="$emit('update:disableGroupByTags', ($event.target as HTMLInputElement).checked)" 
              class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2" 
            />
            <label for="disableGroupByTags" class="text-sm font-medium">Disable Group by Tags</label>
          </div>
          <p class="text-xs text-gray-500">When checked, endpoints will not be grouped by tags in the Endpoints tab. By default, endpoints are grouped by their OpenAPI tags.</p> -->
        </div>
      </template>
    </Card>

    <Card>
      <template #title>Default Placeholder Values</template>
      <template #content>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Configure default values used when generating example values for schema properties. These values will be used when no example or default is specified in the schema.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">String</label>
            <InputText 
              :modelValue="defaultPlaceholders.string" 
              @update:modelValue="updatePlaceholder('string', $event)" 
              placeholder="string" 
              class="w-full" 
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Integer</label>
            <InputNumber 
              :modelValue="defaultPlaceholders.integer" 
              @update:modelValue="updatePlaceholder('integer', $event)" 
              placeholder="0" 
              class="w-full" 
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Number</label>
            <InputNumber 
              :modelValue="defaultPlaceholders.number" 
              @update:modelValue="updatePlaceholder('number', $event)" 
              placeholder="0" 
              class="w-full" 
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Boolean</label>
            <div class="flex items-center gap-2">
              <input 
                type="checkbox" 
                :checked="defaultPlaceholders.boolean" 
                @change="updatePlaceholder('boolean', ($event.target as HTMLInputElement).checked)" 
                class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2" 
              />
              <span class="text-sm text-gray-600 dark:text-gray-400">{{ defaultPlaceholders.boolean ? 'true' : 'false' }}</span>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Email</label>
            <InputText 
              :modelValue="defaultPlaceholders.email" 
              @update:modelValue="updatePlaceholder('email', $event)" 
              placeholder="user@example.com" 
              class="w-full" 
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Date</label>
            <InputText 
              :modelValue="defaultPlaceholders.date" 
              @update:modelValue="updatePlaceholder('date', $event)" 
              placeholder="2023-01-01" 
              class="w-full" 
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Date-Time</label>
            <InputText 
              :modelValue="defaultPlaceholders.dateTime" 
              @update:modelValue="updatePlaceholder('dateTime', $event)" 
              placeholder="2023-01-01T00:00:00Z" 
              class="w-full" 
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">UUID</label>
            <InputText 
              :modelValue="defaultPlaceholders.uuid" 
              @update:modelValue="updatePlaceholder('uuid', $event)" 
              placeholder="123e4567-e89b-12d3-a456-426614174000" 
              class="w-full" 
            />
          </div>
        </div>
        <div class="mt-4">
          <Button label="Reset to Defaults" @click="$emit('resetPlaceholders')" severity="secondary" size="small" />
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import Button from "primevue/button";
import Card from "primevue/card";

const props = defineProps<{
  workers: number;
  delayBetweenRequests: number;
  timeout: number;
  allowDeleteInAllMethods: boolean;
  disableGroupByTags: boolean;
  defaultPlaceholders: {
    string: string;
    integer: number;
    number: number;
    boolean: boolean;
    email: string;
    date: string;
    dateTime: string;
    uuid: string;
  };
}>();

const emit = defineEmits<{
  'update:workers': [value: number];
  'update:delayBetweenRequests': [value: number];
  'update:timeout': [value: number];
  'update:allowDeleteInAllMethods': [value: boolean];
  'update:disableGroupByTags': [value: boolean];
  'update:placeholder': [key: string, value: any];
  'resetPlaceholders': [];
}>();

const updatePlaceholder = (key: string, value: any) => {
  emit('update:placeholder', key, value);
};
</script>

