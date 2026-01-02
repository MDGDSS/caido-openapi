<template>
  <div>
    <div v-if="!parsedSchema" class="text-center py-8 text-gray-500">
      <i class="pi pi-file-text text-4xl mb-4"></i>
      <p>No schema loaded yet. Load a valid schema from the Input tab to view its definition.</p>
    </div>
    <div v-else class="space-y-6">
      <!-- Toggle Button -->
      <div class="flex justify-end mb-4">
        <Button 
          :label="showRaw ? 'To Definition' : 'To Raw'" 
          :icon="showRaw ? 'pi pi-list' : 'pi pi-code'"
          @click="$emit('toggleRawView')" 
          :severity="showRaw ? 'secondary' : 'info'"
          size="small"
        />
      </div>
      
      <!-- Definition View -->
      <div v-if="!showRaw">
      <Card>
        <template #title><div class="flex items-center gap-2"><i class="pi pi-info-circle text-blue-500"></i>API Information</div></template>
        <template #content>
          <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label><p class="text-sm text-gray-900 dark:text-gray-100">{{ parsedSchema.info?.title || 'N/A' }}</p></div>
              <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Version</label><p class="text-sm text-gray-900 dark:text-gray-100">{{ parsedSchema.info?.version || 'N/A' }}</p></div>
              <div v-if="parsedSchema.info?.description" class="md:col-span-2"><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label><p class="text-sm text-gray-900 dark:text-gray-100">{{ parsedSchema.info.description }}</p></div>
              <div v-if="parsedSchema.info?.contact" class="md:col-span-2"><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact</label><p class="text-sm text-gray-900 dark:text-gray-100">{{ parsedSchema.info.contact.name || '' }} {{ parsedSchema.info.contact.email ? `(${parsedSchema.info.contact.email})` : '' }} {{ parsedSchema.info.contact.url ? `- ${parsedSchema.info.contact.url}` : '' }}</p></div>
              <div v-if="parsedSchema.info?.license" class="md:col-span-2"><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">License</label><p class="text-sm text-gray-900 dark:text-gray-100">{{ parsedSchema.info.license.name }} {{ parsedSchema.info.license.url ? `(${parsedSchema.info.license.url})` : '' }}</p></div>
              <div v-if="parsedSchema.openapi || parsedSchema.swagger"><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">OpenAPI Version</label><p class="text-sm text-gray-900 dark:text-gray-100">{{ parsedSchema.openapi || parsedSchema.swagger }}</p></div>
            </div>
            <div v-if="parsedSchema.servers || parsedSchema.host">
              <h4 class="font-medium text-gray-700 dark:text-gray-300 mb-2">Server Information</h4>
              <div class="space-y-2">
                <div v-if="parsedSchema.host"><span class="font-medium text-gray-600 dark:text-gray-400">Host:</span><code class="ml-2 text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ parsedSchema.host }}</code></div>
                <div v-if="parsedSchema.basePath"><span class="font-medium text-gray-600 dark:text-gray-400">Base Path:</span><code class="ml-2 text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ parsedSchema.basePath }}</code></div>
                <div v-if="parsedSchema.schemes"><span class="font-medium text-gray-600 dark:text-gray-400">Schemes:</span><span class="ml-2 text-sm">{{ parsedSchema.schemes.join(', ') }}</span></div>
                <div v-if="parsedSchema.servers"><span class="font-medium text-gray-600 dark:text-gray-400">Servers:</span><div class="ml-2 space-y-1"><div v-for="(server, index) in parsedSchema.servers" :key="index" class="text-sm"><code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ server.url }}</code><span v-if="server.description" class="ml-2 text-gray-500">- {{ server.description }}</span></div></div></div>
              </div>
            </div>
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
      <Card>
        <template #title><div class="flex items-center gap-2"><i class="pi pi-link text-green-500"></i>API Endpoints ({{ Object.keys(parsedSchema.paths || {}).length }})</div></template>
        <template #content>
          <div class="space-y-4">
            <div v-for="(methods, path) in parsedSchema.paths" :key="path" class="border border-gray-200 dark:border-gray-700 rounded-lg">
              <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" @click="$emit('togglePathExpansion', path)">
                <div class="flex items-center gap-2"><i :class="isPathExpanded(path) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="text-gray-500"></i><span class="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{{ path }}</span></div>
                <div class="flex items-center gap-2"><div class="flex gap-1"><span v-for="method in Object.keys(methods)" :key="method" :class="['px-2 py-1 text-xs font-bold rounded', getMethodColor(method)]">{{ method.toUpperCase() }}</span></div><span class="text-xs text-gray-500">{{ Object.keys(methods).length }} methods</span></div>
              </div>
              <div v-if="isPathExpanded(path)" class="p-4 space-y-4">
                <div v-for="(operation, method) in methods" :key="method" class="border-l-4 border-gray-200 dark:border-gray-600 pl-4">
                  <div class="flex items-center gap-3 mb-3"><span :class="['px-3 py-1 text-sm font-bold rounded shadow-sm', getMethodColor(method)]">{{ method.toUpperCase() }}</span><h4 class="font-medium text-gray-900 dark:text-gray-100">{{ operation.summary || operation.operationId || `${method.toUpperCase()} ${path}` }}</h4></div>
                  <div class="space-y-4 text-sm">
                    <div class="flex items-center gap-4 text-xs">
                      <div v-if="operation.operationId"><span class="font-medium text-gray-600 dark:text-gray-400">Operation ID:</span><code class="ml-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ operation.operationId }}</code></div>
                      <div v-if="operation.tags && operation.tags.length > 0"><span class="font-medium text-gray-600 dark:text-gray-400">Tags:</span><div class="flex flex-wrap gap-1 mt-1"><span v-for="tag in operation.tags" :key="tag" class="px-2 py-1 bg-emerald-500 text-white dark:bg-emerald-600 dark:text-emerald-100 rounded text-xs font-medium">{{ tag }}</span></div></div>
                    </div>
                    <div v-if="operation.description" class="text-gray-600 dark:text-gray-400">{{ operation.description }}</div>
                    <div v-if="operation.consumes || operation.produces" class="flex items-center gap-4 text-xs">
                      <div v-if="operation.consumes"><span class="font-medium text-gray-600 dark:text-gray-400">Consumes:</span><span class="ml-1">{{ operation.consumes.join(', ') }}</span></div>
                      <div v-if="operation.produces"><span class="font-medium text-gray-600 dark:text-gray-400">Produces:</span><span class="ml-1">{{ operation.produces.join(', ') }}</span></div>
                    </div>
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
                          <div v-if="param.description" class="text-gray-600 dark:text-gray-400 text-xs">{{ param.description }}</div>
                          <div v-if="param.in === 'body' && param.schema" class="mt-3">
                            <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                              <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">Request Body Schema:</div>
                              <div class="text-sm font-mono text-gray-900 dark:text-gray-100 mb-2">{{ formatSchemaType(param.schema) }}</div>
                              <div v-if="param.schema.$ref" class="mb-3"><div class="text-xs text-gray-500 dark:text-gray-400 mb-1">References:</div><code class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ param.schema.$ref }}</code></div>
                              <div class="mb-3"><div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Example Value:</div><pre class="text-xs bg-gray-900 dark:bg-gray-700 text-gray-100 p-3 rounded overflow-auto max-h-48 font-mono">{{ formatExampleValue(param.schema) }}</pre></div>
                              <div v-if="param.schema.properties" class="space-y-2"><div class="text-xs text-gray-500 dark:text-gray-400">Properties:</div><div class="space-y-1 pl-2"><div v-for="(prop, propName) in param.schema.properties" :key="propName" class="flex items-center gap-2 text-xs"><span class="font-mono text-gray-700 dark:text-gray-300 font-medium">{{ propName }}</span><span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded font-medium">{{ formatSchemaType(prop) }}</span><span v-if="prop.description" class="text-gray-500">- {{ prop.description }}</span><span v-if="prop.example" class="text-gray-400">(example: {{ prop.example }})</span><span v-if="prop.default" class="text-gray-400">(default: {{ prop.default }})</span></div></div></div>
                              <div v-if="param.schema.additionalProperties" class="mt-2"><div class="text-xs text-gray-500 dark:text-gray-400">Additional Properties:</div><span class="text-xs text-gray-700 dark:text-gray-300">{{ formatSchemaType(param.schema.additionalProperties) }}</span></div>
                            </div>
                          </div>
                          <div v-if="param.in !== 'body' && param.schema && param.schema.properties" class="mt-2"><div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Properties:</div><div class="space-y-1 pl-2"><div v-for="(prop, propName) in param.schema.properties" :key="propName" class="flex items-center gap-2"><span class="font-mono text-gray-700 dark:text-gray-300">{{ propName }}</span><span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded text-xs font-medium">{{ formatSchemaType(prop) }}</span><span v-if="prop.description" class="text-gray-500">- {{ prop.description }}</span></div></div></div>
                        </div>
                      </div>
                    </div>
                    <div v-if="operation.requestBody">
                      <h5 class="font-medium text-gray-700 dark:text-gray-300 mb-2">Request Body</h5>
                      <div class="border border-gray-200 dark:border-gray-600 rounded p-3">
                        <div v-if="operation.requestBody.required !== undefined" class="mb-2"><span v-if="operation.requestBody.required" class="px-2 py-1 bg-red-500 text-white dark:bg-red-600 dark:text-red-100 rounded text-xs font-medium">required</span><span v-else class="px-2 py-1 bg-gray-500 text-white dark:bg-gray-600 dark:text-gray-100 rounded text-xs font-medium">optional</span></div>
                        <div v-if="operation.requestBody.content">
                          <div v-for="(content, mediaType) in operation.requestBody.content" :key="mediaType" class="mb-3">
                            <div class="text-gray-600 dark:text-gray-400 mb-1 font-medium">{{ mediaType }}</div>
                            <div v-if="content.schema" class="bg-gray-50 dark:bg-gray-800 p-3 rounded text-xs font-mono">
                              <div class="text-gray-900 dark:text-gray-100 mb-1">{{ formatSchemaType(content.schema) }}</div>
                              <div v-if="content.schema.$ref" class="mb-2"><div class="text-xs text-gray-500 dark:text-gray-400 mb-1">References:</div><code class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ content.schema.$ref }}</code></div>
                              <div class="mb-2"><div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Example Value:</div><pre class="text-xs bg-gray-900 dark:bg-gray-700 text-gray-100 p-2 rounded overflow-auto max-h-32 font-mono">{{ formatExampleValue(content.schema) }}</pre></div>
                              <div v-if="content.schema.properties" class="space-y-1 pl-2"><div v-for="(prop, propName) in content.schema.properties" :key="propName" class="flex items-center gap-2"><span class="font-mono text-gray-700 dark:text-gray-300">{{ propName }}</span><span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded text-xs font-medium">{{ formatSchemaType(prop) }}</span><span v-if="prop.description" class="text-gray-500">- {{ prop.description }}</span></div></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div v-if="operation.responses">
                      <h5 class="font-medium text-gray-700 dark:text-gray-300 mb-2">Responses</h5>
                      <div class="space-y-3">
                        <div v-for="(response, statusCode) in operation.responses" :key="statusCode" class="border border-gray-200 dark:border-gray-600 rounded p-3">
                          <div class="flex items-center gap-2 mb-2">
                            <span :class="['px-2 py-1 rounded font-medium text-xs', statusCode.startsWith('2') ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : statusCode.startsWith('4') ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : statusCode.startsWith('5') ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200']">{{ statusCode }}</span>
                            <span class="text-gray-600 dark:text-gray-400 font-medium">{{ response.description || 'No description' }}</span>
                          </div>
                          <div v-if="response.content" class="space-y-2"><div v-for="(content, mediaType) in response.content" :key="mediaType"><div class="text-gray-600 dark:text-gray-400 text-xs mb-1">{{ mediaType }}</div><div v-if="content.schema" class="bg-gray-50 dark:bg-gray-800 p-2 rounded text-xs font-mono">{{ formatSchemaType(content.schema) }}</div></div></div>
                          <div v-if="response.schema" class="bg-gray-50 dark:bg-gray-800 p-2 rounded text-xs font-mono">{{ formatSchemaType(response.schema) }}</div>
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
      <Card v-if="parsedSchema.components || parsedSchema.definitions">
        <template #title><div class="flex items-center gap-2"><i class="pi pi-cube text-purple-500"></i>Components & Definitions</div></template>
        <template #content>
          <div class="space-y-6">
            <div v-if="parsedSchema.components?.schemas">
              <h4 class="font-medium text-gray-700 dark:text-gray-300 mb-3">Schemas</h4>
              <div class="space-y-3">
                <div v-for="(schema, name) in parsedSchema.components.schemas" :key="name" class="border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" @click="$emit('toggleComponentExpansion', name)">
                    <div class="flex items-center gap-3"><i :class="isComponentExpanded(name) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="text-gray-500"></i><span class="font-medium text-gray-900 dark:text-gray-100">{{ name }}</span><span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded text-xs font-medium">{{ formatSchemaType(schema) }}</span></div>
                    <div class="flex items-center gap-2 text-xs text-gray-500"><span v-if="schema.properties">{{ Object.keys(schema.properties).length }} properties</span><span v-if="schema.required">{{ schema.required.length }} required</span></div>
                  </div>
                  <div v-if="isComponentExpanded(name)" class="p-4 space-y-4">
                    <div v-if="schema.description" class="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded">{{ schema.description }}</div>
                    <div class="flex items-center gap-4 text-xs">
                      <div v-if="schema.type"><span class="font-medium text-gray-600 dark:text-gray-400">Type:</span><span class="ml-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{{ schema.type }}</span></div>
                      <div v-if="schema.format"><span class="font-medium text-gray-600 dark:text-gray-400">Format:</span><span class="ml-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{{ schema.format }}</span></div>
                      <div v-if="schema.example"><span class="font-medium text-gray-600 dark:text-gray-400">Example:</span><code class="ml-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ schema.example }}</code></div>
                    </div>
                    <div v-if="schema.properties" class="space-y-3">
                      <h5 class="font-medium text-gray-700 dark:text-gray-300">Properties</h5>
                      <div class="space-y-2">
                        <div v-for="(prop, propName) in schema.properties" :key="propName" class="border border-gray-200 dark:border-gray-600 rounded p-3">
                          <div class="flex items-center gap-2 mb-1"><span class="font-medium text-gray-900 dark:text-gray-100">{{ propName }}</span><span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded text-xs font-medium">{{ formatSchemaType(prop) }}</span><span v-if="schema.required && schema.required.includes(propName)" class="px-2 py-1 bg-red-500 text-white dark:bg-red-600 dark:text-red-100 rounded text-xs font-medium">required</span><span v-else class="px-2 py-1 bg-gray-500 text-white dark:bg-gray-600 dark:text-gray-100 rounded text-xs font-medium">optional</span></div>
                          <div v-if="prop.description" class="text-sm text-gray-600 dark:text-gray-400 mb-2">{{ prop.description }}</div>
                          <div class="flex items-center gap-4 text-xs">
                            <div v-if="prop.format"><span class="font-medium text-gray-600 dark:text-gray-400">Format:</span><span class="ml-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{{ prop.format }}</span></div>
                            <div v-if="prop.example"><span class="font-medium text-gray-600 dark:text-gray-400">Example:</span><code class="ml-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ prop.example }}</code></div>
                            <div v-if="prop.default"><span class="font-medium text-gray-600 dark:text-gray-400">Default:</span><code class="ml-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ prop.default }}</code></div>
                          </div>
                          <div v-if="prop.enum" class="mt-2"><div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Enum values:</div><div class="flex flex-wrap gap-1"><span v-for="enumValue in prop.enum" :key="enumValue" class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">{{ enumValue }}</span></div></div>
                        </div>
                      </div>
                    </div>
                    <div v-if="schema.required && schema.required.length > 0" class="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded"><h6 class="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Required Fields</h6><div class="flex flex-wrap gap-2"><span v-for="requiredField in schema.required" :key="requiredField" class="px-2 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded text-xs font-medium">{{ requiredField }}</span></div></div>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="parsedSchema.definitions">
              <h4 class="font-medium text-gray-700 dark:text-gray-300 mb-3">Definitions</h4>
              <div class="space-y-3">
                <div v-for="(schema, name) in parsedSchema.definitions" :key="name" class="border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" @click="$emit('toggleComponentExpansion', name)">
                    <div class="flex items-center gap-3"><i :class="isComponentExpanded(name) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="text-gray-500"></i><span class="font-medium text-gray-900 dark:text-gray-100">{{ name }}</span><span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded text-xs font-medium">{{ formatSchemaType(schema) }}</span></div>
                    <div class="flex items-center gap-2 text-xs text-gray-500"><span v-if="schema.properties">{{ Object.keys(schema.properties).length }} properties</span><span v-if="schema.required">{{ schema.required.length }} required</span></div>
                  </div>
                  <div v-if="isComponentExpanded(name)" class="p-4 space-y-4">
                    <div v-if="schema.description" class="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded">{{ schema.description }}</div>
                    <div class="flex items-center gap-4 text-xs">
                      <div v-if="schema.type"><span class="font-medium text-gray-600 dark:text-gray-400">Type:</span><span class="ml-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{{ schema.type }}</span></div>
                      <div v-if="schema.format"><span class="font-medium text-gray-600 dark:text-gray-400">Format:</span><span class="ml-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{{ schema.format }}</span></div>
                    </div>
                    <div v-if="schema.properties" class="space-y-3">
                      <h5 class="font-medium text-gray-700 dark:text-gray-300">Properties</h5>
                      <div class="space-y-2">
                        <div v-for="(prop, propName) in schema.properties" :key="propName" class="border border-gray-200 dark:border-gray-600 rounded p-3">
                          <div class="flex items-center gap-2 mb-1"><span class="font-medium text-gray-900 dark:text-gray-100">{{ propName }}</span><span class="px-2 py-1 bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100 rounded text-xs font-medium">{{ formatSchemaType(prop) }}</span><span v-if="schema.required && schema.required.includes(propName)" class="px-2 py-1 bg-red-500 text-white dark:bg-red-600 dark:text-red-100 rounded text-xs font-medium">required</span><span v-else class="px-2 py-1 bg-gray-500 text-white dark:bg-gray-600 dark:text-gray-100 rounded text-xs font-medium">optional</span></div>
                          <div v-if="prop.description" class="text-sm text-gray-600 dark:text-gray-400 mb-2">{{ prop.description }}</div>
                          <div class="flex items-center gap-4 text-xs">
                            <div v-if="prop.format"><span class="font-medium text-gray-600 dark:text-gray-400">Format:</span><span class="ml-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">{{ prop.format }}</span></div>
                            <div v-if="prop.example"><span class="font-medium text-gray-600 dark:text-gray-400">Example:</span><code class="ml-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ prop.example }}</code></div>
                            <div v-if="prop.default"><span class="font-medium text-gray-600 dark:text-gray-400">Default:</span><code class="ml-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{{ prop.default }}</code></div>
                          </div>
                          <div v-if="prop.enum" class="mt-2"><div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Enum values:</div><div class="flex flex-wrap gap-1"><span v-for="enumValue in prop.enum" :key="enumValue" class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">{{ enumValue }}</span></div></div>
                        </div>
                      </div>
                    </div>
                    <div v-if="schema.required && schema.required.length > 0" class="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded"><h6 class="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Required Fields</h6><div class="flex flex-wrap gap-2"><span v-for="requiredField in schema.required" :key="requiredField" class="px-2 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded text-xs font-medium">{{ requiredField }}</span></div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </Card>
      </div>
      
      <!-- Raw View -->
      <div v-else class="space-y-4">
        <Card>
          <template #title>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <i class="pi pi-code text-orange-500"></i>
                <span>Raw Endpoints</span>
              </div>
              <Button 
                label="Copy" 
                icon="pi pi-copy" 
                @click="copyRawEndpoints" 
                size="small"
                :disabled="!rawEndpointsText"
              />
            </div>
          </template>
          <template #content>
            <div class="space-y-2">
              <label class="block text-sm font-medium">Endpoints (one per line, with query variables if present)</label>
              <Textarea 
                :modelValue="rawEndpointsText || ''" 
                @update:modelValue="$emit('update:rawEndpointsText', $event)" 
                placeholder="/api/users&#10;/api/users/{id}&#10;/api/orders?status={status}&amp;page={page}"
                class="w-full font-mono text-sm"
                style="min-height: 400px;"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400">
                Format: Path with query variables as {variableName}. Copy and paste these endpoints into the Raw Endpoints tab.
              </p>
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Card from "primevue/card";
import Button from "primevue/button";
import Textarea from "primevue/textarea";

const props = defineProps<{
  parsedSchema: any;
  formatSchemaType: (schema: any) => string;
  formatExampleValue: (schema: any) => string;
  getMethodColor: (method: string) => string;
  isPathExpanded: (path: string) => boolean;
  isComponentExpanded: (componentName: string) => boolean;
  showRaw?: boolean;
  rawEndpointsText?: string;
}>();

const emit = defineEmits<{
  'togglePathExpansion': [path: string];
  'toggleComponentExpansion': [componentName: string];
  'toggleRawView': [];
  'update:rawEndpointsText': [value: string];
}>();

const copyRawEndpoints = () => {
  if (props.rawEndpointsText) {
    navigator.clipboard.writeText(props.rawEndpointsText);
  }
};
</script>

