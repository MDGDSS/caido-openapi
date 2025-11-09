<script setup lang="ts">
import Button from "primevue/button";

// Extend window interface for our custom property
declare global {
  interface Window {
    openapiUrlCheckInterval?: NodeJS.Timeout;
  }
}
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Card from "primevue/card";
import Message from "primevue/message";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";
import InputNumber from "primevue/inputnumber";
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";

import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();

// GitHub star button function
const openGitHubInBrowser = () => {
  try {
    if (window.__CAIDO_DESKTOP__ && window.__CAIDO_DESKTOP__.openInBrowser) {
      window.__CAIDO_DESKTOP__.openInBrowser('https://github.com/MDGDSS/caido-openapi');
    } else {
      // Fallback to regular window.open if Caido desktop API is not available
      window.open('https://github.com/MDGDSS/caido-openapi', '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    console.warn('Failed to open GitHub link:', error);
    // Fallback to regular window.open
    window.open('https://github.com/MDGDSS/caido-openapi', '_blank', 'noopener,noreferrer');
  }
};

// Check if localStorage has data to migrate
const hasLocalStorageData = computed(() => {
  try {
    return localStorage.getItem('openapi-testing-results') !== null;
  } catch {
    return false;
  }
});

// Get project key - use project ID if available, otherwise use openapi env var, otherwise 'default'
const getProjectKey = async (projectId?: string): Promise<string> => {
  // First, try to use the provided project ID
  if (projectId) {
    console.log(`Using project ID as key: ${projectId}`);
    return projectId;
  }
  
  // Second, try to get project ID from current project
  try {
    // Try to get current project ID from the SDK if available
    // Note: This might not be directly available, so we'll rely on the project change event
  } catch (error) {
    console.warn('Failed to get project ID:', error);
  }
  
  // Third, try openapi environment variable
  try {
    const openapiValue = await sdk.env.getVar('openapi');
    if (openapiValue) {
      console.log(`Found 'openapi' env var: ${openapiValue}`);
      return openapiValue;
    }
  } catch (error) {
    console.warn('Failed to get openapi env var:', error);
  }
  
  // Fallback to 'default' if nothing found
  return 'default';
};

// Show database contents
const showDatabaseContents = async () => {
  try {
    const result = await sdk.backend.logDatabaseContents();

  } catch (error) {
    console.error('Error showing database contents:', error);
    alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Migration function
const migrateLocalStorageToDb = async () => {
  try {
    const sessionsData: Record<string, any[]> = {};
    let testResultsData: any = null;
    
    // Collect all session data from localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('openapi-sessions-')) {
          const value = localStorage.getItem(key);
          if (value) {
            try {
              sessionsData[key] = JSON.parse(value);
            } catch (parseError) {
              console.error(`Failed to parse localStorage key ${key}:`, parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error reading sessions from localStorage:', error);
    }
    
    // Get test results from localStorage
    try {
      const testResultsStr = localStorage.getItem('openapi-testing-results');
      if (testResultsStr) {
        testResultsData = JSON.parse(testResultsStr);
      }
    } catch (error) {
      console.error('Error reading test results from localStorage:', error);
    }
    
    // Migrate to database (no environment variable migration needed)
    const result = await sdk.backend.migrateFromLocalStorage({
      sessions: sessionsData,
      testResults: testResultsData
    });
    
    if (result.kind === "Ok") {
      console.log(`Migration successful: ${result.value.sessionsMigrated} sessions, test results: ${result.value.testResultsMigrated ? 'yes' : 'no'}`);
      // Reload sessions from database after migration
      await loadSessionsFromStorage();
      // Reload test results from database after migration
      await loadResultsFromStorage();
      alert(`Migration complete!\n${result.value.sessionsMigrated} sessions migrated\nTest results: ${result.value.testResultsMigrated ? 'Migrated' : 'Not found'}`);
    } else {
      console.error('Migration failed:', result.error);
      alert(`Migration failed: ${result.error}`);
    }
  } catch (error) {
    console.error('Migration error:', error);
    alert(`Migration error: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Session management
interface OpenAPISession {
  id: string;
  name: string;
  schemaText: string;
  baseUrl: string;
  workers: number;
  delayBetweenRequests: number;
  timeout: number;
  useRandomValues: boolean;
  useParameterFromDefinition: boolean;
  testResults: any[];
  testCases: any[];
  isSchemaLoaded: boolean;
  pathVariableValues: Record<string, string[]>;
  bodyVariableValues: Record<string, string[]>;
  customHeaders: string;
  variablesExpanded: boolean;
  expandedResults: Set<string>;
  expandedTestCases: Set<string>;
  requestResponseTab: string;
  testCasePathVariableValues: Record<string, Record<string, string>>;
  testCaseQueryParameterValues: Record<string, Record<string, string>>;
  testCaseBodyVariableValues: Record<string, Record<string, any>>;
  createdAt: string;
  lastModified: string;
}

// Session state
const sessions = ref<OpenAPISession[]>([]);
const currentSessionId = ref<string | null>(null);
const sessionCounter = ref<Record<string, number>>({});
const currentProjectId = ref<string>('default');
const editingSessionId = ref<string | null>(null);
const editingSessionName = ref<string>('');

// Reactive state (now session-specific)
const schemaText = ref("");
const baseUrl = ref("https://google.com");
const workers = ref(10);
const delayBetweenRequests = ref(0);
const timeout = ref(30000);
const useRandomValues = ref(false);
const useParameterFromDefinition = ref(true); // Default to true to use example values
const isLoading = ref(false);
const validationResult = ref<{ valid: boolean; errors: string[] } | null>(null);
const testResults = ref<any[]>([]);
const activeTab = ref(0);
const testCases = ref<any[]>([]);
const isSchemaLoaded = ref(false);
const pathVariableValues = ref<Record<string, string[]>>({});
const bodyVariableValues = ref<Record<string, string[]>>({});
const runningTests = ref<Set<string>>(new Set());
const sidebarOpen = ref(true);
const customHeaders = ref("");
const variablesExpanded = ref(true);
const stopTestRequested = ref(false);
const expandedResults = ref<Set<string>>(new Set());
const expandedTestCases = ref<Set<string>>(new Set());
const requestResponseTab = ref('request');
// Test case specific variable values (these are overridden by sidebar values)
const testCasePathVariableValues = ref<Record<string, Record<string, string>>>({});
const testCaseQueryParameterValues = ref<Record<string, Record<string, string>>>({});
const testCaseBodyVariableValues = ref<Record<string, Record<string, any>>>({});
const requestEditor = ref<any>(null);
const responseEditor = ref<any>(null);
const currentExpandedId = ref<string | null>(null);
const requestEditorContainers = ref<Map<string, HTMLElement>>(new Map());
const responseEditorContainers = ref<Map<string, HTMLElement>>(new Map());

// HTTPQL state
const httpqlQuery = ref("");
const httpqlResults = ref("");
const isHttpqlRunning = ref(false);
const filteredTestResults = ref<any[]>([]);
const isQueryActive = ref(false);

// Endpoint search functionality
const endpointSearchQuery = ref("");
const filteredTestCases = ref<any[]>([]);
// Schema definition viewer state
const parsedSchema = ref<any>(null);
const selectedPath = ref("");
const selectedMethod = ref("");
const expandedPaths = ref<Set<string>>(new Set());
const expandedComponents = ref<Set<string>>(new Set());


// Validate schema locally
const validateSchema = async () => {
  try {
    if (!schemaText.value.trim()) {
      validationResult.value = null;
      return;
    }
    
    const result = await sdk.backend.validateSchema(schemaText.value);
    validationResult.value = result;
  } catch (error) {
    validationResult.value = {
      valid: false,
      errors: [`Validation error: ${error.message}`]
    };
  }
};

// Session management functions
const createNewSession = (): OpenAPISession => {
  const sessionId = `session-${Date.now()}`;
  
  // Initialize counter for this project if it doesn't exist
  if (!sessionCounter.value[currentProjectId.value]) {
    sessionCounter.value[currentProjectId.value] = 1;
  }
  
  const sessionName = `Session ${sessionCounter.value[currentProjectId.value]}`;
  sessionCounter.value[currentProjectId.value]++;
  
  const newSession: OpenAPISession = {
    id: sessionId,
    name: sessionName,
    schemaText: "",
    baseUrl: "http://localhost:3000",
    workers: 10,
    delayBetweenRequests: 0,
    timeout: 30000,
    useRandomValues: false,
    useParameterFromDefinition: true,
    testResults: [],
    testCases: [],
    isSchemaLoaded: false,
    pathVariableValues: {},
    bodyVariableValues: {},
    customHeaders: "",
    variablesExpanded: true,
    expandedResults: new Set(),
    expandedTestCases: new Set(),
    requestResponseTab: 'request',
    testCasePathVariableValues: {},
    testCaseQueryParameterValues: {},
    testCaseBodyVariableValues: {},
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString()
  };
  
  return newSession;
};

const saveCurrentSession = async () => {
  if (!currentSessionId.value) return;
  
  const currentSession = sessions.value.find(s => s.id === currentSessionId.value);
  if (currentSession) {
    
    // Convert Sets to Arrays for storage
    currentSession.schemaText = schemaText.value;
    currentSession.baseUrl = baseUrl.value;
    currentSession.workers = workers.value;
    currentSession.delayBetweenRequests = delayBetweenRequests.value;
    currentSession.timeout = timeout.value;
    currentSession.useRandomValues = useRandomValues.value;
    currentSession.useParameterFromDefinition = useParameterFromDefinition.value;
    currentSession.testResults = [...testResults.value];
    currentSession.testCases = [...testCases.value];
    currentSession.isSchemaLoaded = isSchemaLoaded.value;
    currentSession.pathVariableValues = { ...pathVariableValues.value };
    currentSession.bodyVariableValues = { ...bodyVariableValues.value };
    currentSession.customHeaders = customHeaders.value;
    currentSession.variablesExpanded = variablesExpanded.value;
    currentSession.expandedResults = new Set(expandedResults.value);
    currentSession.expandedTestCases = new Set(expandedTestCases.value);
    currentSession.requestResponseTab = requestResponseTab.value;
    currentSession.testCasePathVariableValues = { ...testCasePathVariableValues.value };
    currentSession.testCaseQueryParameterValues = { ...testCaseQueryParameterValues.value };
    currentSession.testCaseBodyVariableValues = { ...testCaseBodyVariableValues.value };
    currentSession.lastModified = new Date().toISOString();
    
    // Save to Caido project storage
    await saveSessionsToStorage();
  }
};

const loadSession = async (sessionId: string) => {
  const session = sessions.value.find(s => s.id === sessionId);
  if (!session) return;
  
  // Save current session before switching (only if switching to a different session)
  if (currentSessionId.value && currentSessionId.value !== sessionId) {
    await saveCurrentSession();
  }
  
  // Load new session data
  schemaText.value = session.schemaText || '';
  baseUrl.value = session.baseUrl || '';
  workers.value = session.workers || 10;
  delayBetweenRequests.value = session.delayBetweenRequests || 100;
  timeout.value = session.timeout || 30000;
  useRandomValues.value = session.useRandomValues || false;
  useParameterFromDefinition.value = session.useParameterFromDefinition !== undefined ? session.useParameterFromDefinition : true;
  testResults.value = [...(session.testResults || [])];
  testCases.value = [...(session.testCases || [])];
  isSchemaLoaded.value = session.isSchemaLoaded || false;
  pathVariableValues.value = { ...(session.pathVariableValues || {}) };
  bodyVariableValues.value = { ...(session.bodyVariableValues || {}) };
  customHeaders.value = session.customHeaders || '';
  variablesExpanded.value = session.variablesExpanded || false;
  expandedResults.value = new Set(session.expandedResults || []);
  expandedTestCases.value = new Set(session.expandedTestCases || []);
  requestResponseTab.value = session.requestResponseTab || 'request';
  testCasePathVariableValues.value = { ...(session.testCasePathVariableValues || {}) };
  testCaseQueryParameterValues.value = { ...(session.testCaseQueryParameterValues || {}) };
  testCaseBodyVariableValues.value = { ...(session.testCaseBodyVariableValues || {}) };
  
  // Re-parse schema if it was loaded in this session
  if (session.isSchemaLoaded && schemaText.value) {
    try {
      const schema = parseOpenAPISchemaLocally(schemaText.value);
      parsedSchema.value = schema;
    } catch (error) {
      console.error('Failed to re-parse schema when loading session:', error);
      parsedSchema.value = null;
      isSchemaLoaded.value = false;
    }
  } else {
    parsedSchema.value = null;
  }
  
  currentSessionId.value = sessionId;
  
};

const deleteSession = async (sessionId: string) => {
  const sessionIndex = sessions.value.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) return;
  
  // If deleting current session, switch to another one
  if (currentSessionId.value === sessionId) {
    if (sessions.value.length > 1) {
      const nextSession = sessions.value[sessionIndex === 0 ? 1 : sessionIndex - 1];
      await loadSession(nextSession.id);
    } else {
      // Create a new session if this was the last one
      const newSession = createNewSession();
      sessions.value = [newSession];
      await loadSession(newSession.id);
    }
  }
  
  sessions.value.splice(sessionIndex, 1);
  await saveSessionsToStorage();
};

const handleAddSession = async () => {
  if (currentSessionId.value) await saveCurrentSession();

  const newSession = createNewSession();
  sessions.value.push(newSession);
  await loadSession(newSession.id);
  await saveSessionsToStorage();
};

const startRenameSession = (sessionId: string) => {
  const session = sessions.value.find(s => s.id === sessionId);
  if (session) {
    editingSessionId.value = sessionId;
    editingSessionName.value = session.name;
    // Focus the input after the next tick to ensure it's rendered
    nextTick(() => {
      // Use a more reliable way to find the input by looking for the editing session
      const input = document.querySelector(`input[data-session-id="${sessionId}"]`) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }
};

const cancelRenameSession = () => {
  editingSessionId.value = null;
  editingSessionName.value = '';
};

const saveRenameSession = async (sessionId: string) => {
  const session = sessions.value.find(s => s.id === sessionId);
  if (session && editingSessionName.value.trim()) {
    session.name = editingSessionName.value.trim();
    session.lastModified = new Date().toISOString();
    await saveSessionsToStorage();
  }
  editingSessionId.value = null;
  editingSessionName.value = '';
};

const handleRenameKeydown = async (event: KeyboardEvent, sessionId: string) => {
  if (event.key === 'Enter') {
    await saveRenameSession(sessionId);
  } else if (event.key === 'Escape') {
    cancelRenameSession();
  }
};

const saveSessionsToStorage = async () => {
  try {
    // ALWAYS check openapi env var first - this is the key we use in the database
    let projectKey: string;
    try {
      const openapiValue = await sdk.env.getVar('openapi');
      if (openapiValue) {
        console.log(`Found 'openapi' env var for saving: ${openapiValue}`);
        projectKey = openapiValue;
        currentProjectId.value = projectKey; // Update currentProjectId to match
      } else {
        // If no env var, always use 'default' - DO NOT use currentProjectId to avoid random keys
        projectKey = 'default';
        console.log(`No 'openapi' env var found, using 'default' key`);
      }
    } catch (error) {
      console.warn('Failed to get openapi env var:', error);
      // Always fall back to 'default', never use currentProjectId
      projectKey = 'default';
    }
    
    const sessionsData = sessions.value.map(session => ({
      ...session,
      expandedResults: Array.from(session.expandedResults),
      expandedTestCases: Array.from(session.expandedTestCases)
    }));
    
    const storageKey = `openapi-sessions-${projectKey}`;
    console.log(`Saving sessions for project key: ${projectKey}`);
    
    // Save to Caido database
    try {
      const result = await sdk.backend.saveSessionsToDb(projectKey, sessionsData);
      if (result.kind === "Error") {
        console.error('Failed to save sessions to database:', result.error);
      } else {
        // Log database contents after save
        await sdk.backend.logDatabaseContents();
      }
    } catch (dbError) {
      console.error('Database save failed:', dbError);
    }
    
    // Keep localStorage code for later migration (commented out but preserved)
    // TODO: Remove localStorage code after migration button is implemented
    /*
    // Try Caido storage first, then always save to localStorage as backup
    try {
      await sdk.storage.set(storageKey, sessionsData);
    } catch (storageError) {
      console.warn('Caido storage failed:', storageError);
    }
    
    // Always save to localStorage as backup
    try {
      localStorage.setItem(storageKey, JSON.stringify(sessionsData));
    } catch (localStorageError) {
      console.error('localStorage save failed:', localStorageError);
    }
    */
  } catch (error) {
    console.error('Failed to save sessions:', error);
  }
};

const loadSessionsFromStorage = async () => {
  try {
    // ALWAYS check openapi env var first - this is the key we use in the database
    let projectKey: string;
    try {
      const openapiValue = await sdk.env.getVar('openapi');
      if (openapiValue) {
        console.log(`Found 'openapi' env var for loading: ${openapiValue}`);
        projectKey = openapiValue;
        currentProjectId.value = projectKey; // Update currentProjectId to match
      } else {
        // If no env var, always use 'default' - DO NOT use currentProjectId to avoid random keys
        projectKey = 'default';
        console.log(`No 'openapi' env var found, using 'default' key`);
      }
    } catch (error) {
      console.warn('Failed to get openapi env var:', error);
      // Always fall back to 'default', never use currentProjectId
      projectKey = 'default';
    }
    
    const storageKey = `openapi-sessions-${projectKey}`;
    console.log(`Loading sessions for project key: ${projectKey}`);
    
    let sessionsData = null;
    
    // Try to load from Caido database
    try {
      const result = await sdk.backend.loadSessionsFromDb(projectKey);
      if (result.kind === "Ok") {
        sessionsData = result.value;
      } else {
        console.warn('Failed to load sessions from database:', result.error);
      }
    } catch (dbError) {
      console.error('Database load failed:', dbError);
    }
    
    // Keep localStorage code for later migration (commented out but preserved)
    // TODO: Remove localStorage code after migration button is implemented
    /*
    // Try both Caido storage and localStorage, prefer the one with valid data
    let caidoData = null;
    let localData = null;
    
    // Try Caido storage
    try {
      caidoData = await sdk.storage.get(storageKey);
      
      // Security check: if the data is just the storage key or empty, treat as no data
      if (caidoData === storageKey || caidoData === null || caidoData === undefined || caidoData === '') {
        caidoData = null;
      }
    } catch (storageError) {
      console.warn('Caido storage failed:', storageError);
      caidoData = null;
    }
    
    // Try localStorage
    try {
      const localDataString = localStorage.getItem(storageKey);
      if (localDataString) {
        localData = JSON.parse(localDataString);
      }
    } catch (parseError) {
      console.error('Failed to parse localStorage data:', parseError);
      localData = null;
    }
    
    // Choose the best data source
    if (caidoData && Array.isArray(caidoData) && caidoData.length > 0) {
      sessionsData = caidoData;
    } else if (localData && Array.isArray(localData) && localData.length > 0) {
      sessionsData = localData;
    } else {
      sessionsData = null;
    }
    */
    
    // Also check if sessionsData is an object with sessions property
    if (sessionsData && typeof sessionsData === 'object' && sessionsData.sessions) {
      sessionsData = sessionsData.sessions;
    }
    
    if (sessionsData && Array.isArray(sessionsData)) {
      
      sessions.value = sessionsData.map(session => ({
        ...session,
        expandedResults: new Set(session.expandedResults || []),
        expandedTestCases: new Set(session.expandedTestCases || [])
      }));
      
      // Initialize session counter for this project based on existing sessions
      if (sessions.value.length > 0) {
        const maxSessionNumber = Math.max(...sessions.value.map(session => {
          const match = session.name.match(/Session (\d+)/);
          return match ? parseInt(match[1]) : 0;
        }));
        sessionCounter.value[currentProjectId.value] = maxSessionNumber + 1;
        
        
        // Load the first session
        await loadSession(sessions.value[0].id);
      } else {
        // No sessions found, create a new one
        sessionCounter.value[currentProjectId.value] = 1;
        const newSession = createNewSession();
        sessions.value = [newSession];
        await loadSession(newSession.id);
      }
    } else {
      // No sessions found, create a new one
      sessionCounter.value[currentProjectId.value] = 1;
      const newSession = createNewSession();
      sessions.value = [newSession];
      await loadSession(newSession.id);
    }
  } catch (error) {
    console.error('Failed to load sessions:', error);
    // Create a new session as fallback
    const newSession = createNewSession();
    sessions.value = [newSession];
    await loadSession(newSession.id);
  }
};


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

// Filtered test cases based on search query
const displayTestCases = computed(() => {
  if (!endpointSearchQuery.value.trim()) {
    return testCases.value;
  }
  const query = endpointSearchQuery.value.toLowerCase();
  return testCases.value.filter(tc => 
    tc.path.toLowerCase().includes(query) ||
    tc.method.toLowerCase().includes(query) ||
    (tc.name && tc.name.toLowerCase().includes(query)) ||
    (tc.description && tc.description.toLowerCase().includes(query))
  );
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
  // Sort by creation date (newest first)
  return results.sort((a, b) => {
    const timestampA = a.timestamp || 0;
    const timestampB = b.timestamp || 0;
    return timestampB - timestampA; // Newest first
  });
});

// Sorted body variables for alphabetical display
const sortedBodyVariables = computed(() => {
  const entries = Object.entries(bodyVariableValues.value);
  return entries.sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
});

// Frontend schema parsing and test case generation functions to avoid RPC payload size issues
const parseOpenAPISchemaLocally = (schemaText: string): any => {
  try {
    const schema = JSON.parse(schemaText);
    return schema;
  } catch (error) {
    throw new Error(`Failed to parse OpenAPI schema: ${error}`);
  }
};

const extractPathVariables = (path: string): string[] => {
  const pathVariableRegex = /\{([^}]+)\}/g;
  const variables: string[] = [];
  let match;
  
  while ((match = pathVariableRegex.exec(path)) !== null) {
    if (match[1]) {
      variables.push(match[1]);
    }
  }
  
  return variables;
};

const getExpectedStatus = (operation: any): number => {
  if (operation.responses) {
    const statusCodes = Object.keys(operation.responses);
    for (const code of statusCodes) {
      if (code.startsWith('2')) return parseInt(code);
    }
    return parseInt(statusCodes[0]) || 200;
  }
  return 200;
};

const generateExampleValue = (schema: any, depth: number = 0, parsedSchema?: any): any => {
  if (depth > 3) return null; // Prevent infinite recursion
  
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  
  const type = schema.type || 'string';
  
  switch (type) {
    case 'string':
      if (schema.enum && schema.enum.length > 0) return schema.enum[0];
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'date') return '2023-01-01';
      if (schema.format === 'date-time') return '2023-01-01T00:00:00Z';
      if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
      return 'string';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    case 'array':
      if (schema.items) {
        const itemValue = generateExampleValue(schema.items, depth + 1, parsedSchema);
        return itemValue !== null ? [itemValue] : [];
      }
      return [];
    case 'object':
      if (schema.properties) {
        const obj: any = {};
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          const value = generateExampleValue(propSchema as any, depth + 1, parsedSchema);
          if (value !== null) obj[propName] = value;
        }
        return obj;
      }
      return {};
    default:
      return 'string';
  }
};

const extractBodyVariables = (schema: any, parsedSchema: any): Record<string, any> => {
  const variables: Record<string, any> = {};
  
  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    const refSchema = parsedSchema.definitions?.[refName] || parsedSchema.components?.schemas?.[refName];
    if (refSchema && refSchema.properties) {
      for (const [propName, propSchema] of Object.entries(refSchema.properties)) {
        variables[propName] = generateExampleValue(propSchema as any, 0, parsedSchema);
      }
    }
    return variables;
  }
  
  // Handle direct properties
  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      variables[propName] = generateExampleValue(propSchema as any, 0, parsedSchema);
    }
  }
  
  return variables;
};

const generateTestCasesLocally = (schema: any): any[] => {
  const testCases: any[] = [];
  
  for (const [path, methods] of Object.entries(schema.paths)) {
    for (const [method, operation] of Object.entries(methods as any)) {
      if (method.toLowerCase() === 'get' || method.toLowerCase() === 'post' || 
          method.toLowerCase() === 'put' || method.toLowerCase() === 'delete' || method.toLowerCase() === 'patch') {
        
        // Extract path variables from the path
        const pathVariables = extractPathVariables(path);
        
        // Extract body parameters for Swagger 2.0
        let bodyParameter = null;
        let bodyVariables: Record<string, any> = {};
        
        if (operation.parameters) {
          for (const param of operation.parameters) {
            if (param.in === 'body' && param.schema) {
              bodyParameter = param.schema;
              // Extract body variables from schema
              bodyVariables = extractBodyVariables(param.schema, schema);
              break;
            }
          }
        }
        
        // For OpenAPI 3.x requestBody
        if (operation.requestBody?.content) {
          const content = operation.requestBody.content;
          const mediaType = Object.keys(content)[0] || 'application/json';
          const requestBodySchema = content[mediaType]?.schema;
          if (requestBodySchema) {
            bodyVariables = extractBodyVariables(requestBodySchema, schema);
          }
        }
        
        const testCase = {
          path,
          method: method.toUpperCase(),
          name: `${method.toUpperCase()} ${path}`,
          description: operation.summary || operation.description || `Test ${method.toUpperCase()} ${path}`,
          parameters: operation.parameters || [],
          requestBody: operation.requestBody || bodyParameter,
          expectedStatus: getExpectedStatus(operation),
          pathVariables,
          bodyVariables,
          originalPath: path
        };
        
        testCases.push(testCase);
      }
    }
  }
  
  return testCases;
};

// Frontend schema validation function
const validateSchemaLocally = (schemaText: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  try {
    const schema = JSON.parse(schemaText);
    
    // Check for OpenAPI or Swagger version field
    if (!schema.openapi && !schema.swagger) {
      errors.push("Missing 'openapi' or 'swagger' version field");
    }
    
    // Additional validation
    if (schema.paths) {
      for (const [path, methods] of Object.entries(schema.paths)) {
        if (typeof methods !== 'object' || methods === null) {
          errors.push(`Invalid path definition for '${path}'`);
          continue;
        }
        
        for (const [method, operation] of Object.entries(methods)) {
          if (typeof operation !== 'object' || operation === null) {
            errors.push(`Invalid operation definition for ${method.toUpperCase()} ${path}`);
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Invalid JSON: ${error}`]
    };
  }
};



const loadSchema = async () => {
  if (!schemaText.value.trim()) {
    return;
  }

  try {
    // First validate the schema locally to avoid RPC payload size issues
    validationResult.value = validateSchemaLocally(schemaText.value);
    
    if (validationResult.value.valid) {
      // Parse the schema locally to avoid RPC payload size issues
      const schema = parseOpenAPISchemaLocally(schemaText.value);
      
      // Store parsed schema for definition viewer
      parsedSchema.value = schema;
      
      // Generate test cases locally to avoid RPC payload size issues
      const cases = generateTestCasesLocally(schema);
      testCases.value = cases;
      isSchemaLoaded.value = true;
      activeTab.value = 1; // Switch to test cases tab
      
      // Auto-save session after loading schema
      await saveCurrentSession();
      
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
      
      // Initialize body variable values
      bodyVariableValues.value = {};
      cases.forEach(testCase => {
        if (testCase.bodyVariables) {
          Object.entries(testCase.bodyVariables).forEach(([key, value]) => {
            bodyVariableValues.value[key] = [String(value)];
          });
        }
      });
      
      // Initialize test case specific variable values
      testCasePathVariableValues.value = {};
      testCaseQueryParameterValues.value = {};
      testCaseBodyVariableValues.value = {};
      
      cases.forEach(testCase => {
        const testCaseId = getTestCaseId(testCase);
        
        // Initialize path variables
        if (testCase.pathVariables) {
          testCasePathVariableValues.value[testCaseId] = {};
          testCase.pathVariables.forEach((variable: string) => {
            testCasePathVariableValues.value[testCaseId][variable] = '';
          });
        }
        
        // Initialize query parameters
        if (testCase.parameters) {
          testCaseQueryParameterValues.value[testCaseId] = {};
          testCase.parameters.forEach((param: any) => {
            if (param.in === 'query' && param.name) {
              testCaseQueryParameterValues.value[testCaseId][param.name] = '';
            }
          });
        }
        
        // Initialize body variables
        if (testCase.bodyVariables) {
          testCaseBodyVariableValues.value[testCaseId] = {};
          Object.entries(testCase.bodyVariables).forEach(([key, value]) => {
            testCaseBodyVariableValues.value[testCaseId][key] = '';
          });
        }
      });
      

    }
  } catch (error) {
    console.error("Failed to load schema:", error);
    validationResult.value = { valid: false, errors: [error instanceof Error ? error.message : "Failed to load schema"] };
  }
};

const attachRequestContextMenu = (container: HTMLElement, testResult: any) => {
  const menuId = `ctx-${getResultId(testResult)}`;
  let menu = container.querySelector(`#${menuId}`) as HTMLElement | null;
  if (!menu) {
    menu = document.createElement('div');
    menu.id = menuId;
    menu.style.position = 'fixed';
    menu.style.zIndex = '9999';
    menu.style.display = 'none';
    menu.style.minWidth = '160px';
    menu.style.background = 'var(--p-surface-0, #fff)';
    menu.style.border = '1px solid var(--p-surface-300, #e5e7eb)';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)';
    menu.innerHTML = `
      <div style="padding:8px 10px; cursor:pointer; font-size: 13px;" data-action="replay">Send to Replay</div>
      <div style="padding:8px 10px; cursor:pointer; font-size: 13px;" data-action="repeater">Send to Repeater</div>
    `;
    document.body.appendChild(menu);

    const hideMenu = () => (menu!.style.display = 'none');
    document.addEventListener('click', hideMenu);
    document.addEventListener('scroll', hideMenu, true);

    menu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute('data-action');
      if (action === 'replay') {
        try { sdk.shortcuts.sendToReplay(); } catch (_) {}
      } else if (action === 'repeater') {
        try { sdk.shortcuts.sendToRepeater(); } catch (_) {}
      }
      hideMenu();
    });

    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      menu!.style.display = 'block';
      menu!.style.left = `${e.clientX}px`;
      menu!.style.top = `${e.clientY}px`;
    });
  }
};


const toMinimalTestCase = (tc: any) => ({
  path: tc.path,
  method: tc.method,
  name: tc.name,
  description: tc.description,
  parameters: tc.parameters || [],
  expectedStatus: tc.expectedStatus,
  pathVariables: tc.pathVariables || [],
  bodyVariables: tc.bodyVariables || {},
  originalPath: tc.originalPath || tc.path
});

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
      headers: parseCustomHeaders(),
      // Do not include parsedSchema in options to avoid very large RPC payloads
      useParameterFromDefinition: useParameterFromDefinition.value
    };
    
    // Get all test cases locally to avoid RPC payload size issues
    const schema = parseOpenAPISchemaLocally(schemaText.value);
    const testCases = generateTestCasesLocally(schema);
    
    // Use filtered test cases if search is active
    const testCasesToRun = endpointSearchQuery.value.trim() ? displayTestCases.value : testCases;
    
    // Process each test case individually to show incremental results
    for (const testCase of testCasesToRun) {
      if (stopTestRequested.value) break;
      
      // Generate combinations for this test case
      const pathVariableCombinations = generatePathVariableCombinations(testCase);
      const bodyVariableCombinations = generateBodyVariableCombinations(testCase);
      
      // If no combinations for either, run single test
      if (pathVariableCombinations.length === 0 && bodyVariableCombinations.length === 0) {
        const bodyVars = getTestCaseBodyVariables(testCase);
        const queryVars = getTestCaseQueryParameters(testCase);
        const result = await sdk.backend.runSingleTest(toMinimalTestCase(testCase), baseUrl.value, options, {}, bodyVars, queryVars);
        updateTestCaseResult(testCase, result);
      } else {
        // Generate all combinations of path and body variables
        const allCombinations: Array<{pathVars: any, bodyVars: any}> = [];
        
        if (pathVariableCombinations.length === 0) {
          // Only body variable combinations
          bodyVariableCombinations.forEach(bodyVars => {
            allCombinations.push({ pathVars: {}, bodyVars });
          });
        } else if (bodyVariableCombinations.length === 0) {
          // Only path variable combinations
          pathVariableCombinations.forEach(pathVars => {
            allCombinations.push({ pathVars, bodyVars: getTestCaseBodyVariables(testCase) });
          });
        } else {
          // Both path and body variable combinations
          pathVariableCombinations.forEach(pathVars => {
            bodyVariableCombinations.forEach(bodyVars => {
              allCombinations.push({ pathVars, bodyVars });
            });
          });
        }
        
        // Run test for each combination
        for (let i = 0; i < allCombinations.length; i++) {
          const { pathVars, bodyVars } = allCombinations[i];
          if (stopTestRequested.value) break;
          
          const queryVars = getTestCaseQueryParameters(testCase);
          const result = await sdk.backend.runSingleTest(toMinimalTestCase(testCase), baseUrl.value, options, pathVars, bodyVars, queryVars);
          updateTestCaseResult(testCase, result, pathVars);
          
          // Add delay between requests if specified
          if (delayBetweenRequests.value > 0 && i < allCombinations.length - 1) {
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
    // Save session after tests complete
    await saveCurrentSession();
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
      headers: parseCustomHeaders(),
      // Do not include parsedSchema in options to avoid very large RPC payloads
      useParameterFromDefinition: useParameterFromDefinition.value
    };
    
    // Get all combinations of path variable values
    const pathVariableCombinations = generatePathVariableCombinations(testCase);
    // Generate body variable combinations
    const bodyVariableCombinations = generateBodyVariableCombinations(testCase);
    
    // If no combinations for either, run single test
    if (pathVariableCombinations.length === 0 && bodyVariableCombinations.length === 0) {
      const bodyVars = getTestCaseBodyVariables(testCase);
      const queryVars = getTestCaseQueryParameters(testCase);
      const result = await sdk.backend.runSingleTest(toMinimalTestCase(testCase), baseUrl.value, options, {}, bodyVars, queryVars);
      updateTestCaseResult(testCase, result);
    } else {
      // Generate all combinations of path and body variables
      const allCombinations: Array<{pathVars: any, bodyVars: any}> = [];
      
      if (pathVariableCombinations.length === 0) {
        // Only body variable combinations
        bodyVariableCombinations.forEach(bodyVars => {
          allCombinations.push({ pathVars: {}, bodyVars });
        });
      } else if (bodyVariableCombinations.length === 0) {
        // Only path variable combinations
        pathVariableCombinations.forEach(pathVars => {
          allCombinations.push({ pathVars, bodyVars: getTestCaseBodyVariables(testCase) });
        });
      } else {
        // Both path and body variable combinations
        pathVariableCombinations.forEach(pathVars => {
          bodyVariableCombinations.forEach(bodyVars => {
            allCombinations.push({ pathVars, bodyVars });
          });
        });
      }
      
      // Run test for each combination
      for (let i = 0; i < allCombinations.length; i++) {
        const { pathVars, bodyVars } = allCombinations[i];
        if (stopTestRequested.value) break;
        
        const queryVars = getTestCaseQueryParameters(testCase);
        const result = await sdk.backend.runSingleTest(toMinimalTestCase(testCase), baseUrl.value, options, pathVars, bodyVars, queryVars);
        updateTestCaseResult(testCase, result, pathVars);
        
        // Add delay between requests if specified
        if (delayBetweenRequests.value > 0 && i < allCombinations.length - 1) {
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
    // Save session after test completes
    await saveCurrentSession();
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
  const testCaseId = getTestCaseId(testCase);
  
  // Get all values for each variable - local test case values are primary, sidebar values are fallback
  for (const variable of variables) {
    let values: string[] = [];
    
    // First check test case specific values (primary)
    if (testCasePathVariableValues.value[testCaseId]?.[variable]) {
      const testCaseValue = testCasePathVariableValues.value[testCaseId][variable].trim();
      if (testCaseValue !== '') {
        values = [testCaseValue];
      }
    }
    
    // If no test case values, check sidebar values (fallback)
    if (values.length === 0 && pathVariableValues.value[variable] && pathVariableValues.value[variable].length > 0) {
      values = pathVariableValues.value[variable].filter(v => v.trim() !== '');
    }
    
    if (values.length === 0) {
      if (useRandomValues.value) {
        // Use random string for empty variables when random values is enabled
        valuesPerVariable.push([generateRandomString()]);
      } else {
        // If no values provided, use empty string
        valuesPerVariable.push(['']);
      }
    } else {
      valuesPerVariable.push(values);
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
  return success ? "" : "";
};

const getStatusClass = (success: boolean) => {
  return success ? "text-green-600" : "text-red-600";
};

const formatResponseTime = (time: number) => {
  return `${time}ms`;
};

const getResponseSize = (response: any) => {
  try {
    const length = getResponseLength(response);
    if (typeof length === 'string') {
      return length; // Return error message as is
    }
    
    if (length === 0) {
      return '0 bytes';
    } else if (length < 1024) {
      return `${length} bytes`;
    } else if (length < 1024 * 1024) {
      return `${(length / 1024).toFixed(1)} KB`;
    } else {
      return `${(length / (1024 * 1024)).toFixed(1)} MB`;
    }
  } catch (error) {
    return 'Error calculating size';
  }
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

const getHostFromUrl = (url: string): string => {
  try {
    // Remove protocol if present
    const urlWithoutProtocol = url.replace(/^https?:\/\//, '');
    // Get everything before the first slash or colon
    const host = urlWithoutProtocol.split(/[/:]/)[0];
    return host || 'localhost';
  } catch (error) {
    return 'localhost';
  }
};

const setRequestEditorContainer = (el: HTMLElement | null, resultId: string) => {
  if (el) {
    requestEditorContainers.value.set(resultId, el);
  }
};

const setResponseEditorContainer = (el: HTMLElement | null, resultId: string) => {
  if (el) {
    responseEditorContainers.value.set(resultId, el);
  }
};

const createNativeCaidoEditors = (testResult: any) => {
  try {
    const resultId = getResultId(testResult);
    
    // Get the containers for this specific result
    const requestContainer = requestEditorContainers.value.get(resultId);
    const responseContainer = responseEditorContainers.value.get(resultId);
    
    // Wait a bit for containers to be available
    if (!requestContainer || !responseContainer) {
      setTimeout(() => createNativeCaidoEditors(testResult), 100);
      return;
    }
    
    // Ensure containers are empty before creating new editors
    requestContainer.innerHTML = '';
    responseContainer.innerHTML = '';

    // Create request editor
    if (requestContainer) {
      requestContainer.classList.add('request-editor-container');
      try { requestContainer.setAttribute('data-result-id', resultId); } catch (_) {}
      const requestContent = formatRequestForCaido(testResult);
      
      try {
        // Try different possible SDK method names
        let requestEditorInstance;
        if (sdk.ui.httpRequestEditor) {
          requestEditorInstance = sdk.ui.httpRequestEditor();
        } else if (sdk.ui.createHttpRequestEditor) {
          requestEditorInstance = sdk.ui.createHttpRequestEditor();
        } else if (sdk.ui.requestEditor) {
          requestEditorInstance = sdk.ui.requestEditor();
        } else {
          return;
        }
        
        const requestElement = requestEditorInstance.getElement();
        requestContainer.appendChild(requestElement);
        
        // Set request content with delay to ensure editor is ready
        setTimeout(() => {
          try {
            const requestView = requestEditorInstance?.getEditorView();
            if (requestView) {
              requestView.dispatch({
                changes: {
                  from: 0,
                  to: requestView.state.doc.length,
                  insert: requestContent,
                },
              });
            }
          } catch (e) {
            // Silent fail
          }
          // Attach contextual menu to request container after content is set
          try {
            attachRequestContextMenu(requestContainer, testResult);
          } catch (_) {}
        }, 200);
      } catch (e) {
        // Silent fail
      }
    }

    // Create response editor
    if (responseContainer) {
      responseContainer.classList.add('response-editor-container');
      const responseContent = formatResponseForCaido(testResult);
      
      try {
        // Try different possible SDK method names
        let responseEditorInstance;
        if (sdk.ui.httpResponseEditor) {
          responseEditorInstance = sdk.ui.httpResponseEditor();
        } else if (sdk.ui.createHttpResponseEditor) {
          responseEditorInstance = sdk.ui.createHttpResponseEditor();
        } else if (sdk.ui.responseEditor) {
          responseEditorInstance = sdk.ui.responseEditor();
        } else {
          return;
        }
        
        const responseElement = responseEditorInstance.getElement();
        responseContainer.appendChild(responseElement);
        
        // Set response content with delay to ensure editor is ready
        setTimeout(() => {
          try {
            const responseView = responseEditorInstance?.getEditorView();
            if (responseView) {
              responseView.dispatch({
                changes: {
                  from: 0,
                  to: responseView.state.doc.length,
                  insert: responseContent,
                },
              });
            }
          } catch (e) {
            // Silent fail
          }
        }, 200);
      } catch (e) {
        // Silent fail
      }
    }
  } catch (error) {
    console.error('Failed to create native Caido editors:', error);
  }
};

// Global context menu for request editor (capture phase) to avoid editors eating the event
let requestCtxMenuEl: HTMLElement | null = null;
const setupGlobalRequestContextMenu = () => {
  if (requestCtxMenuEl) return;
  const menu = document.createElement('div');
  requestCtxMenuEl = menu;
  menu.id = 'openapi-request-context-menu';
  Object.assign(menu.style, {
    position: 'fixed', zIndex: '9999', display: 'none', minWidth: '160px',
    background: 'var(--p-surface-0, #fff)', border: '1px solid var(--p-surface-300, #e5e7eb)',
    borderRadius: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)'
  } as CSSStyleDeclaration);
  menu.innerHTML = `
    <div style="padding:8px 10px; cursor:pointer; font-size: 13px;" data-action="replay">Send to Replay</div>
  `;
  document.body.appendChild(menu);

  const hideMenu = () => { if (menu) menu.style.display = 'none'; };
  document.addEventListener('click', hideMenu, true);
  document.addEventListener('scroll', hideMenu, true);

  menu.addEventListener('click', () => {
    hideMenu();
  });

  document.addEventListener('contextmenu', (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const container = target.closest('.request-editor-container') as HTMLElement | null;
    if (!container) return;
    e.preventDefault();
    e.stopPropagation();
    // Theme-aware colors to avoid white-on-white
    try {
      const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
      menu.style.background = isDark ? 'var(--p-surface-900, #111827)' : 'var(--p-surface-0, #ffffff)';
      menu.style.borderColor = isDark ? 'var(--p-surface-700, #374151)' : 'var(--p-surface-300, #e5e7eb)';
      menu.style.color = isDark ? 'var(--p-surface-200, #e5e7eb)' : 'var(--p-surface-900, #111827)';
      Array.from(menu.children).forEach((child: any) => {
        child.style.color = menu.style.color;
      });
    } catch (_) {}
    menu.style.display = 'block';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    // Stash the current expanded result id so actions know which to send
    const rid = container.getAttribute('data-result-id') || '';
    menu.setAttribute('data-result-id', rid);
  }, true);



  menu.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const action = target.getAttribute('data-action');
    const rid = menu.getAttribute('data-result-id') || '';
    let testResult = allTestResults.value.find(r => getResultId(r) === rid)
      || testResults.value.find(r => getResultId(r) === rid)
      || filteredTestResults.value.find(r => getResultId(r) === rid);
    // Focus the editor to make Caido shortcuts work reliably
    try {
      const focusable = document.querySelector(`.request-editor-container[data-result-id="${rid}"] .cm-content, .request-editor-container[data-result-id="${rid}"] textarea`) as HTMLElement | null;
      if (focusable && typeof (focusable as any).focus === 'function') (focusable as any).focus();
    } catch (_) {}
    try {
      if (action === 'replay') {
        // Ensure a collection exists with normalized base url as name, get its id
        const baseRaw = baseUrl.value?.trim() || '';
        const baseTrimmed = baseRaw.replace(/\/+$/, '');
        let collectionName = baseTrimmed;
        try {
          const u = new URL(baseTrimmed);
          const path = (u.pathname || '').replace(/\/+$/, '');
          collectionName = `${u.host}${path}` || u.host;
        } catch (_) {}
        let collectionId: string | undefined = undefined;
        try {
          const collections = await (sdk as any).replay.getCollections();
          const existing = Array.isArray(collections)
            ? collections.find((c: any) => ((c?.name || '').trim() === collectionName))
            : undefined;
          if (existing && existing.id) {
            collectionId = String(existing.id);
          } else {
            const created = await (sdk as any).replay.createCollection(collectionName);
            if (created && created.id) collectionId = String(created.id);
          }
        } catch (_) {}

        // Build source for session: prefer saved request ID, otherwise construct a RequestSpec
        let source: any = testResult?.requestId;
        if (!source) {
          try {
            const url = testResult?.requestUrl || `${baseTrimmed}${testResult?.requestPath || testResult?.testCase?.path || ''}`;
            const SpecCtor = (window as any).RequestSpec;
            if (SpecCtor) {
              const spec = new SpecCtor(url);
              if (testResult?.testCase?.method) spec.setMethod(testResult.testCase.method);
              if (testResult?.requestPath) spec.setPath(testResult.requestPath);
              if (testResult?.requestQuery) spec.setQuery(testResult.requestQuery);
              if (testResult?.actualBody) {
                try { spec.setBody(JSON.stringify(testResult.actualBody)); } catch (_) {}
              }
              source = spec;
            }
          } catch (_) {}
        }

        // Create Replay session via backend (Workflow SDK) so it works reliably in plugins
        try {
          const result = await (sdk as any).backend.sendResultToReplay(
            { ...testResult, requestId: testResult?.requestId },
            collectionName,
            collectionId
          );
          const sessionId = result?.sessionId;
          if (result?.success && sessionId) {
            (sdk as any).replay?.openTab?.(sessionId);
          }
        } catch (_) {}
      }
    } catch (_) {}
  });
};

const formatRequestForCaido = (testResult: any): string => {
  const { testCase, combination, requestPath, requestQuery, requestRaw } = testResult;

  // Prefer the exact raw request from backend if available
  if (requestRaw && typeof requestRaw === 'string' && requestRaw.trim().length > 0) {
    return requestRaw;
  }
  
  // Prefer the actual path/query used by the backend if provided
  let finalPath = requestPath || testCase.path;
  if (!requestPath && combination && Object.keys(combination).length > 0) {
    Object.entries(combination).forEach(([key, value]) => {
      finalPath = finalPath.replace(`{${key}}`, value);
    });
  }
  const query = requestQuery ? `?${requestQuery}` : '';
  
  let request = `${testCase.method} ${finalPath}${query} HTTP/1.1\r\n`;
  request += `Host: ${getHostFromUrl(baseUrl.value)}\r\n`;
  request += `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`;
  request += `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8\r\n`;
  request += `Accept-Language: en-US,en;q=0.9\r\n`;
  request += `Accept-Encoding: gzip, deflate, br\r\n`;
  request += `Connection: keep-alive\r\n`;
  request += `Upgrade-Insecure-Requests: 1\r\n`;
  
  request += '\r\n';
  
  // Add request body only when one was actually sent, or when method typically has a body
  let bodyToShow: any | undefined = undefined;
    if (testResult && testResult.actualBody) {
      bodyToShow = testResult.actualBody;
  } else if ((testCase.method === 'POST' || testCase.method === 'PUT' || testCase.method === 'PATCH') && testCase.bodyVariables && Object.keys(testCase.bodyVariables).length > 0) {
      bodyToShow = testCase.bodyVariables;
    }
    
  if (bodyToShow !== undefined) {
    request += JSON.stringify(bodyToShow, null, 2);
  }
  
  return request;
};

const formatResponseForCaido = (testResult: any): string => {
  const { status, response, error } = testResult;
  
  let responseText = `HTTP/1.1 ${status}\r\n`;
  responseText += `Content-Type: application/json\r\n`;
  responseText += `Content-Length: ${getResponseLength(response)}\r\n`;
  responseText += `Date: ${new Date().toUTCString()}\r\n`;
  responseText += `Server: nginx/1.18.0\r\n`;
  responseText += `Access-Control-Allow-Origin: *\r\n`;
  responseText += `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n`;
  responseText += `Access-Control-Allow-Headers: Content-Type, Authorization\r\n`;
  responseText += '\r\n';
  
  if (error) {
    responseText += `Error: ${error}`;
  } else if (response !== undefined && response !== null) {
    if (typeof response === 'object') {
      responseText += JSON.stringify(response, null, 2);
    } else {
      responseText += String(response);
    }
  } else {
    responseText += 'No response body';
  }
  
  return responseText;
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

const addBodyVariableValue = (variable: string) => {
  if (!bodyVariableValues.value[variable]) {
    bodyVariableValues.value[variable] = [''];
  } else {
    bodyVariableValues.value[variable].push('');
  }
};

const removeBodyVariableValue = (variable: string, index: number) => {
  if (bodyVariableValues.value[variable] && bodyVariableValues.value[variable].length > 1) {
    bodyVariableValues.value[variable].splice(index, 1);
  }
};

const getBodyVariableValue = (variable: string): string[] => {
  return bodyVariableValues.value[variable] || [''];
};

// Helper function to parse multi-line input
const parseMultiLineInput = (input: string): string[] => {
  return input
    .split('\n')
    .map(line => String(line).trim())
    .filter(line => line.length > 0);
};

// Handle multi-line paste for path variables
const handlePathVariablePaste = (variable: string, event: ClipboardEvent) => {
  const pastedText = event.clipboardData?.getData('text') || '';
  const lines = parseMultiLineInput(pastedText);
  
  if (lines.length > 1) {
    event.preventDefault(); // Prevent default paste behavior
    
    // Initialize if not exists
    if (!pathVariableValues.value[variable]) {
      pathVariableValues.value[variable] = [];
    }
    
    // Add all lines as separate values
    pathVariableValues.value[variable].push(...lines);
  }
};

// Handle multi-line paste for body variables
const handleBodyVariablePaste = (key: string, event: ClipboardEvent) => {
  const pastedText = event.clipboardData?.getData('text') || '';
  const lines = parseMultiLineInput(pastedText);
  
  if (lines.length > 1) {
    event.preventDefault(); // Prevent default paste behavior
    
    // Initialize if not exists
    if (!bodyVariableValues.value[key]) {
      bodyVariableValues.value[key] = [];
    }
    
    // Add all lines as separate values
    bodyVariableValues.value[key].push(...lines);
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


const getUniquePathVariables = () => {
  const variables = new Set<string>();
  testCases.value.forEach(testCase => {
    if (testCase.pathVariables) {
      testCase.pathVariables.forEach((variable: string) => {
        variables.add(variable);
      });
    }
  });
  return Array.from(variables).sort((a, b) => a.localeCompare(b));
};


const toggleResultExpansion = (resultId: string) => {
  if (expandedResults.value.has(resultId)) {
    // If clicking on already expanded result, close it
    expandedResults.value.delete(resultId);
  } else {
    // If expanding a new result, close all others first (only one expanded at a time)
    expandedResults.value.clear();
    expandedResults.value.add(resultId);
  }
};

const isResultExpanded = (resultId: string) => {
  return expandedResults.value.has(resultId);
};

const toggleTestCaseExpansion = (testCase: any) => {
  const testCaseId = `${testCase.method}-${testCase.path}`;
  if (expandedTestCases.value.has(testCaseId)) {
    expandedTestCases.value.delete(testCaseId);
  } else {
    expandedTestCases.value.add(testCaseId);
  }
};

const isTestCaseExpanded = (testCase: any) => {
  const testCaseId = `${testCase.method}-${testCase.path}`;
  return expandedTestCases.value.has(testCaseId);
};

// Functions to get variable values with sidebar override
const getTestCaseId = (testCase: any) => {
  return `${testCase.method}-${testCase.path}`;
};

const getTestCasePathVariableValue = (testCase: any, variable: string) => {
  const testCaseId = getTestCaseId(testCase);
  // Test case specific values are primary, sidebar values are fallback
  const testCaseValue = testCasePathVariableValues.value[testCaseId]?.[variable] || '';
  if (testCaseValue.trim() !== '') {
    return testCaseValue;
  }
  // Return sidebar value as fallback
  return pathVariableValues.value[variable]?.[0] || '';
};

const getTestCaseQueryParameterValue = (testCase: any, paramName: string) => {
  const testCaseId = getTestCaseId(testCase);
  return testCaseQueryParameterValues.value[testCaseId]?.[paramName] || '';
};

const getTestCaseBodyVariableValue = (testCase: any, key: string) => {
  const testCaseId = getTestCaseId(testCase);
  // Test case specific values are primary, sidebar values are fallback
  const testCaseValue = testCaseBodyVariableValues.value[testCaseId]?.[key];
  if (testCaseValue !== undefined && testCaseValue !== '') {
    return testCaseValue;
  }
  // Return sidebar value as fallback (first value from array)
  if (bodyVariableValues.value[key] && bodyVariableValues.value[key].length > 0) {
    return bodyVariableValues.value[key][0];
  }
  // Return default value from test case
  return testCase.bodyVariables[key] || '';
};

const getTestCaseBodyVariables = (testCase: any) => {
  const testCaseId = getTestCaseId(testCase);
  const bodyVars: Record<string, any> = {};
  
  // Start with test case default body variables
  if (testCase.bodyVariables) {
    Object.assign(bodyVars, testCase.bodyVariables);
  }
  
  // Override with sidebar values (fallback) - use first value from array
  Object.entries(bodyVariableValues.value).forEach(([key, values]) => {
    if (values && values.length > 0 && values[0] !== '') {
      bodyVars[key] = values[0];
    }
  });
  
  // Override with test case specific values (highest priority)
  if (testCaseBodyVariableValues.value[testCaseId]) {
    Object.entries(testCaseBodyVariableValues.value[testCaseId]).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        bodyVars[key] = value;
      }
    });
  }
  
  return bodyVars;
};

// Generate all possible combinations of body variables
const generateBodyVariableCombinations = (testCase: any) => {
  const testCaseId = getTestCaseId(testCase);
  const combinations: Record<string, any>[] = [];
  
  // Get all body variables that have multiple values
  const bodyVarsWithMultipleValues: Record<string, string[]> = {};
  
  // Check sidebar values
  Object.entries(bodyVariableValues.value).forEach(([key, values]) => {
    const validValues = values.filter(v => v && typeof v === 'string' && v.trim() !== '');
    if (validValues.length > 1) {
      bodyVarsWithMultipleValues[key] = validValues;
    }
  });
  
  // Check test case specific values
  if (testCaseBodyVariableValues.value[testCaseId]) {
    Object.entries(testCaseBodyVariableValues.value[testCaseId]).forEach(([key, values]) => {
      if (Array.isArray(values)) {
        const validValues = values.filter(v => v && typeof v === 'string' && v.trim() !== '');
        if (validValues.length > 1) {
          bodyVarsWithMultipleValues[key] = validValues;
        }
      }
    });
  }
  
  // If no multiple values, return single combination
  if (Object.keys(bodyVarsWithMultipleValues).length === 0) {
    return [getTestCaseBodyVariables(testCase)];
  }
  
  // Generate all combinations
  const keys = Object.keys(bodyVarsWithMultipleValues);
  const values = Object.values(bodyVarsWithMultipleValues);
  
  // Generate cartesian product
  const generateCombinations = (index: number, currentCombination: Record<string, any>) => {
    if (index === keys.length) {
      // Add default values for other body variables
      const finalCombination = { ...getTestCaseBodyVariables(testCase), ...currentCombination };
      combinations.push(finalCombination);
      return;
    }
    
    const key = keys[index];
    const keyValues = values[index];
    
    for (const value of keyValues) {
      generateCombinations(index + 1, { ...currentCombination, [key]: value });
    }
  };
  
  generateCombinations(0, {});
  return combinations;
};

const getTestCaseQueryParameters = (testCase: any) => {
  const testCaseId = getTestCaseId(testCase);
  const queryVars: Record<string, string> = {};
  
  // Start with default query parameters from schema
  if (testCase.parameters) {
    testCase.parameters.forEach((param: any) => {
      if (param.in === 'query' && param.name) {
        // Use example or default value from schema
        let defaultValue = '';
        if (param.example !== undefined) {
          defaultValue = String(param.example);
        } else if (param.schema?.example !== undefined) {
          defaultValue = String(param.schema.example);
        } else if (param.schema?.default !== undefined) {
          defaultValue = String(param.schema.default);
        }
        queryVars[param.name] = defaultValue;
      }
    });
  }
  
  // Override with test case specific values (highest priority)
  if (testCaseQueryParameterValues.value[testCaseId]) {
    Object.entries(testCaseQueryParameterValues.value[testCaseId]).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        queryVars[key] = value;
      }
    });
  }
  
  return queryVars;
};

const getResultId = (data: any) => {
  // Create a unique ID for each result
  const baseId = `${data.testCase.name}-${data.testCase.method}-${data.testCase.path}`;
  let resultId = baseId;
  
  if (data.combination) {
    const combinationStr = Object.entries(data.combination)
      .map(([key, value]) => `${key}=${value}`)
      .join('-');
    resultId = `${baseId}-${combinationStr}`;
  }
  
  // Add timestamp to make each execution unique
  if (data.timestamp) {
    resultId = `${resultId}-${data.timestamp}`;
  } else {
    // Fallback: use current timestamp if not available
    resultId = `${resultId}-${Date.now()}`;
  }
  
  return resultId;
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

const runHttpqlQuery = async () => {
  if (!httpqlQuery.value.trim()) {
    return;
  }

  isHttpqlRunning.value = true;
  httpqlResults.value = "";

  try {
    // Try to use GraphQL to query HTTP data (alternative to HTTPQL)
    if (sdk.graphql && typeof sdk.graphql.query === 'function') {
      try {
        // Try to query HTTP history data using GraphQL
        const query = `
          query {
            httpHistory {
              requests {
                id
                method
                url
                statusCode
                responseTime
                timestamp
              }
            }
          }
        `;
        const result = await sdk.graphql.query(query);
        httpqlResults.value = JSON.stringify(result, null, 2);
      } catch (graphqlError) {
        // If GraphQL doesn't work, try to filter the results based on the HTTPQL-like query
        await filterTestResultsByQuery();
      }
    } else {
      // Fallback: filter test results based on the query
      await filterTestResultsByQuery();
    }
  } catch (error) {
    httpqlResults.value = `Error running query: ${error instanceof Error ? error.message : String(error)}\n\nQuery: ${httpqlQuery.value}`;
  } finally {
    isHttpqlRunning.value = false;
  }
}; 

const filterTestResultsByQuery = async () => {
  const query = httpqlQuery.value.toLowerCase();
  
  // Simple query parser for common HTTPQL-like patterns
  if (query.includes('resp.code') || query.includes('status')) {
    // Filter by status code
    const statusMatch = query.match(/(?:resp\.code|status)\s*\.?\s*(?:eq|==|=)?\s*:?\s*(\d+)/);
    if (statusMatch) {
      const targetStatus = parseInt(statusMatch[1]);
      const filteredResults = allTestResults.value.filter(result => result.status === targetStatus);
      filteredTestResults.value = filteredResults;
      isQueryActive.value = true;
      httpqlResults.value = `Filtered results for status code ${targetStatus} (${filteredResults.length} results)`;
    } else {
      httpqlResults.value = `Query pattern recognized but no status code found.\n\nQuery: ${httpqlQuery.value}\n\nTry: resp.code.eq:200 or status:200`;
      isQueryActive.value = false;
    }
  } else if (query.includes('method')) {
    // Filter by HTTP method
    const methodMatch = query.match(/method\s*\.?\s*(?:eq|==|=)?\s*:?\s*(get|post|put|delete|patch)/i);
    if (methodMatch) {
      const targetMethod = methodMatch[1].toUpperCase();
      const filteredResults = allTestResults.value.filter(result => result.testCase.method === targetMethod);
      filteredTestResults.value = filteredResults;
      isQueryActive.value = true;
      httpqlResults.value = `Filtered results for method ${targetMethod} (${filteredResults.length} results)`;
    } else {
      httpqlResults.value = `Query pattern recognized but no method found.\n\nQuery: ${httpqlQuery.value}\n\nTry: method.eq:GET or method:POST`;
      isQueryActive.value = false;
    }
  } else if (query.includes('url') || query.includes('path')) {
    // Filter by URL/path
    const urlMatch = query.match(/(?:url|path)\s*\.?\s*(?:eq|==|=)?\s*:?\s*["']?([^"']+)["']?/);
    if (urlMatch) {
      const targetPath = urlMatch[1];
      const filteredResults = allTestResults.value.filter(result => 
        result.testCase.path.toLowerCase().includes(targetPath.toLowerCase())
      );
      filteredTestResults.value = filteredResults;
      isQueryActive.value = true;
      httpqlResults.value = `Filtered results for path containing "${targetPath}" (${filteredResults.length} results)`;
    } else {
      httpqlResults.value = `Query pattern recognized but no path found.\n\nQuery: ${httpqlQuery.value}\n\nTry: url.eq:"/users" or path:"/api"`;
      isQueryActive.value = false;
    }
  } else {
    // Show all results if no specific filter is applied
    filteredTestResults.value = allTestResults.value;
    isQueryActive.value = true;
    httpqlResults.value = `Showing all test results (${allTestResults.value.length} results)`;
  }
};

const clearQuery = () => {
  httpqlQuery.value = "";
  httpqlResults.value = "";
  filteredTestResults.value = [];
  isQueryActive.value = false;
};

const clearAllResults = () => {
  testResults.value = [];
  testCases.value.forEach(tc => {
    tc.result = null;
    tc.results = [];
  });
  expandedResults.value.clear();
};

const clearEndpointSearch = () => {
  endpointSearchQuery.value = "";
};



// Schema definition viewer helper functions
const togglePathExpansion = (path: string) => {
  if (expandedPaths.value.has(path)) {
    expandedPaths.value.delete(path);
  } else {
    expandedPaths.value.add(path);
  }
};

const toggleComponentExpansion = (componentName: string) => {
  if (expandedComponents.value.has(componentName)) {
    expandedComponents.value.delete(componentName);
  } else {
    expandedComponents.value.add(componentName);
  }
};

const isPathExpanded = (path: string) => {
  return expandedPaths.value.has(path);
};

const isComponentExpanded = (componentName: string) => {
  return expandedComponents.value.has(componentName);
};

const getMethodColor = (method: string) => {
  const colors = {
    get: 'bg-green-500 text-white dark:bg-green-600 dark:text-green-100',
    post: 'bg-blue-500 text-white dark:bg-blue-600 dark:text-blue-100',
    put: 'bg-orange-500 text-white dark:bg-orange-600 dark:text-orange-100',
    delete: 'bg-red-500 text-white dark:bg-red-600 dark:text-red-100',
    patch: 'bg-purple-500 text-white dark:bg-purple-600 dark:text-purple-100'
  };
  return colors[method.toLowerCase() as keyof typeof colors] || 'bg-gray-500 text-white dark:bg-gray-600 dark:text-gray-100';
};

const formatSchemaType = (schema: any) => {
  if (!schema) return 'any';
  
  // Handle $ref (schema references)
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    return `ref: ${refName}`;
  }
  
  // Handle basic types
  if (schema.type) {
    let typeStr = schema.type;
    
    // Add format if available
    if (schema.format) {
      typeStr += ` (${schema.format})`;
    }
    
    // Add array information
    if (schema.type === 'array' && schema.items) {
      const itemType = formatSchemaType(schema.items);
      typeStr = `array of ${itemType}`;
    }
    
    // Add object information
    if (schema.type === 'object') {
      if (schema.properties) {
        const propCount = Object.keys(schema.properties).length;
        typeStr = `object (${propCount} properties)`;
      } else if (schema.additionalProperties) {
        typeStr = `object with additional properties`;
      }
    }
    
    return typeStr;
  }
  
  // Handle complex schemas
  if (schema.oneOf) return 'oneOf';
  if (schema.allOf) return 'allOf';
  if (schema.anyOf) return 'anyOf';
  if (schema.not) return 'not';
  
  // Handle enums
  if (schema.enum) {
    return `enum (${schema.enum.length} values)`;
  }
  
  // Default fallback
  return 'object';
};




// Format example value as JSON string
const formatExampleValue = (schema: any): string => {
  try {
    const example = generateExampleValue(schema);
    return JSON.stringify(example, null, 2);
  } catch (error) {
    return '{}';
  }
};

// Watch for expanded results to create native Caido editors
watch(expandedResults, (newExpanded) => {
  
  // Clear all container contents to ensure clean state
  for (const container of requestEditorContainers.value.values()) {
    container.innerHTML = '';
  }
  for (const container of responseEditorContainers.value.values()) {
    container.innerHTML = '';
  }
  
  if (newExpanded.size > 0) {
    // Since only one result can be expanded at a time, get the first (and only) one
    const expandedId = Array.from(newExpanded)[0];
    
    // Find the test result in all available arrays
    

    
    // Try to find the result in allTestResults, testResults, and filteredTestResults
    let testResult = allTestResults.value.find(result => getResultId(result) === expandedId);
    if (!testResult) {
      testResult = testResults.value.find(result => getResultId(result) === expandedId);
    }
    if (!testResult) {
      testResult = filteredTestResults.value.find(result => getResultId(result) === expandedId);
    }
    
    if (testResult) {
      // Use nextTick to ensure DOM is updated, then create editors
      nextTick(() => {
        setTimeout(() => {
          createNativeCaidoEditors(testResult);
        }, 100); // Increased delay to ensure DOM is fully ready
      });
    }
  }
}, { deep: true });

// Add keyboard shortcuts for Repeater and Replay
const setupKeyboardShortcuts = () => {
  const handleKeyDown = (event: KeyboardEvent) => {
    // Only handle shortcuts when on the Results tab
    if (activeTab.value !== 3) return; // Results tab is index 3
    
    // Check if the event target is within a request or response editor
    const target = event.target as HTMLElement;
    const isInEditor = target.closest('.request-editor-container') || target.closest('.response-editor-container');
    
    if (!isInEditor) return; // Only work when clicking on editors
    
    // Ctrl+R or Cmd+R to send to Repeater
    if ((event.ctrlKey || event.metaKey) && event.key === 'r' && !event.shiftKey) {
      event.preventDefault();
      sendToRepeater();
    }
    
    // Ctrl+Shift+R or Cmd+Shift+R to send to Replay
    if ((event.ctrlKey || event.metaKey) && event.key === 'R' && event.shiftKey) {
      event.preventDefault();
      sendToReplay();
    }
  };
  
  document.addEventListener('keydown', handleKeyDown);
  
  // Cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
};


// Send current expanded result to Replay
const sendToReplay = () => {
  const expandedId = Array.from(expandedResults.value)[0];
  if (!expandedId) {
    return;
  }
  
  let testResult = allTestResults.value.find(result => getResultId(result) === expandedId);
  if (!testResult) {
    testResult = testResults.value.find(result => getResultId(result) === expandedId);
  }
  if (!testResult) {
    testResult = filteredTestResults.value.find(result => getResultId(result) === expandedId);
  }
  
  if (testResult) {
    try {
      sdk.shortcuts.sendToReplay();
    } catch (error) {
      // Silent fail
    }
  }
};

// Setup keyboard shortcuts when component mounts
onMounted(() => {
  const cleanup = setupKeyboardShortcuts();
  // Setup a global right-click menu on request editors
  setupGlobalRequestContextMenu();
  // Re-render editors for expanded results after navigation/visibility changes
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      // Recreate editors for all expanded results
      Array.from(expandedResults.value).forEach((id) => {
        let testResult = allTestResults.value.find(result => getResultId(result) === id)
          || testResults.value.find(result => getResultId(result) === id)
          || filteredTestResults.value.find(result => getResultId(result) === id);
        if (testResult) {
          setTimeout(() => createNativeCaidoEditors(testResult), 50);
        }
      });
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);
  
  // Cleanup on unmount
  onUnmounted(() => {
    cleanup();
    document.removeEventListener('visibilitychange', handleVisibility);
  });
});

// Persist results in database to prevent loss when switching tabs
const saveResultsToStorage = async () => {
  try {
    const dataToSave = {
      allTestResults: allTestResults.value,
      testResults: testResults.value,
      filteredTestResults: filteredTestResults.value,
      timestamp: Date.now()
    };
    
    // Save to Caido database
    try {
      const result = await sdk.backend.saveTestResultsToDb(dataToSave);
      if (result.kind === "Error") {
        console.error('Failed to save test results to database:', result.error);
      } else {
        // Log database contents after save
        await sdk.backend.logDatabaseContents();
      }
    } catch (dbError) {
      console.error('Database save failed:', dbError);
    }
    
    // Keep localStorage code for later migration (commented out but preserved)
    // TODO: Remove localStorage code after migration button is implemented
    /*
    localStorage.setItem('openapi-testing-results', JSON.stringify(dataToSave));
    */
  } catch (error) {
    // Silent fail if database is not available
  }
};

const loadResultsFromStorage = async () => {
  try {
    // Load from Caido database
    try {
      const result = await sdk.backend.loadTestResultsFromDb();
      if (result.kind === "Ok" && result.value) {
        const data = result.value;
        // Only load if data is recent (within last hour)
        if (data.timestamp && (Date.now() - data.timestamp) < 3600000) {
          allTestResults.value = data.allTestResults || [];
          testResults.value = data.testResults || [];
          filteredTestResults.value = data.filteredTestResults || [];
        }
      }
    } catch (dbError) {
      console.error('Database load failed:', dbError);
    }
    
    // Keep localStorage code for later migration (commented out but preserved)
    // TODO: Remove localStorage code after migration button is implemented
    /*
    const saved = localStorage.getItem('openapi-testing-results');
    if (saved) {
      const data = JSON.parse(saved);
      // Only load if data is recent (within last hour)
      if (data.timestamp && (Date.now() - data.timestamp) < 3600000) {
        allTestResults.value = data.allTestResults || [];
        testResults.value = data.testResults || [];
        filteredTestResults.value = data.filteredTestResults || [];
      }
    }
    */
  } catch (error) {
    // Silent fail if database is not available
  }
};



// Save results whenever they change
watch([allTestResults, testResults, filteredTestResults], () => {
  saveResultsToStorage();
}, { deep: true });

// Save session whenever key values change (with debounce to avoid too many saves)
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
watch([schemaText, baseUrl, workers, delayBetweenRequests, timeout, useRandomValues, useParameterFromDefinition, pathVariableValues, bodyVariableValues, customHeaders, testCases, testResults], () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    await saveCurrentSession();
  }, 1000); // Debounce: save 1 second after last change
}, { deep: true });

// Load results and sessions on mount
let projectChangeHandler: { stop: () => void } | null = null;

onMounted(async () => {
  // Handle project change
  const handleProjectChange = async (event: { projectId: string | undefined }) => {
    try {
      console.log('Project change event received, projectId:', event.projectId);
      
      // FIRST: Check if openapi environment variable is available for the new project
      // This is the key we use to store sessions in the database
      // NEVER use project ID (UUID) as a fallback - always use 'default' if env var doesn't exist
      let newProjectKey: string;
      try {
        const openapiValue = await sdk.env.getVar('openapi');
        if (openapiValue) {
          console.log(`Found 'openapi' env var for new project: ${openapiValue}`);
          newProjectKey = openapiValue;
        } else {
          // If no env var, use 'default' - DO NOT use project ID to avoid creating random keys
          newProjectKey = 'default';
          console.log(`No 'openapi' env var found, using 'default' key`);
        }
      } catch (error) {
        console.warn('Failed to get openapi env var:', error);
        // Always fall back to 'default', never use project ID
        newProjectKey = 'default';
        console.log(`Using 'default' as fallback`);
      }
      
      if (newProjectKey !== currentProjectId.value) {
        const oldProjectId = currentProjectId.value;
        console.log('Project changed from', oldProjectId, 'to', newProjectKey);
        
        // IMPORTANT: Save current project's sessions BEFORE switching
        // This ensures we don't lose data when switching projects
        if (sessions.value.length > 0 && oldProjectId && oldProjectId !== 'default') {
          console.log('Saving sessions for old project before switch:', oldProjectId);
          // Save with the old project ID (currentProjectId.value is still oldProjectId at this point)
          await saveSessionsToStorage();
        }
        
        // Now switch to the new project
        currentProjectId.value = newProjectKey;
        console.log('Set currentProjectId to:', newProjectKey);
        
        // Clear current sessions before loading new ones
        sessions.value = [];
        currentSessionId.value = null;
        
        // Load sessions for the new project
        console.log('Loading sessions for new project:', newProjectKey);
        await loadSessionsFromStorage();
      } else {
        console.log('Project key unchanged, no action needed');
      }
    } catch (error) {
      console.error('Failed to handle project change:', error);
    }
  };
  
  // Set up project change listener FIRST, so we can get the initial project ID
  projectChangeHandler = sdk.projects.onCurrentProjectChange(handleProjectChange);
  
  // Initialize with current project
  // Try to get project key - the project change event should fire immediately with current project ID
  // But we'll also try env var as fallback
  const initialProjectKey = await getProjectKey();
  currentProjectId.value = initialProjectKey;
  
  // Wait a bit for the project change event to fire (if it hasn't already)
  // This ensures we get the actual project ID from the event
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Load sessions from storage (using the project ID from the event if it fired)
  await loadSessionsFromStorage();
  
  // Then load results (this will be session-specific)
  loadResultsFromStorage();
  
  // Set up auto-save functionality
  const autoSaveInterval = setInterval(async () => {
    await saveCurrentSession();
  }, 180000); // Auto-save every 3 minutes
  
  // Set up beforeunload event to save on page close
  const handleBeforeUnload = async () => {
    await saveCurrentSession();
  };
  window.addEventListener('beforeunload', handleBeforeUnload);
  
  // Set up visibility change to save when tab becomes hidden
  const handleVisibilityChange = async () => {
    if (document.visibilityState === 'hidden') {
      await saveCurrentSession();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  // Cleanup on unmount
  onUnmounted(async () => {
    clearInterval(autoSaveInterval);
    if (projectChangeHandler) {
      projectChangeHandler.stop(); // Stop listening to project changes
    }
    window.removeEventListener('beforeunload', handleBeforeUnload);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    await saveCurrentSession(); // Final save before unmount
  });
});


</script>

<template>
  <div class="h-full flex flex-col relative overflow-hidden">
    <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div class="flex items-center gap-4">
        <div>
          <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-200">OpenAPI Tester</h1>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Test your OpenAPI schemas with real HTTP requests</p>
        </div>
        <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <div v-for="session in sessions" :key="session.id" :class="['flex items-center gap-2 px-3 py-1 rounded-md transition-all duration-200', currentSessionId === session.id ? 'bg-blue-600 text-white border border-blue-500 shadow-md' : 'bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-500 border border-gray-200 dark:border-gray-500']">
            <div v-if="editingSessionId !== session.id" class="flex items-center gap-2 cursor-pointer flex-1 group" @click="() => loadSession(session.id)" @dblclick="() => startRenameSession(session.id)" title="Click to select, double-click to rename">
              <span class="text-sm font-medium">{{ session.name }}</span>
              <i class="pi pi-pencil text-xs opacity-0 group-hover:opacity-60 transition-opacity ml-1 cursor-pointer hover:opacity-100" :class="currentSessionId === session.id ? 'text-blue-200' : 'text-gray-400'" title="Click to rename" @click.stop="() => startRenameSession(session.id)"></i>
            </div>
            <input v-else v-model="editingSessionName" @blur="() => saveRenameSession(session.id)" @keydown="(e) => handleRenameKeydown(e, session.id)" class="text-sm font-medium bg-transparent border-none outline-none flex-1 min-w-0 px-1 rounded" :class="currentSessionId === session.id ? 'text-white bg-blue-500/20' : 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-500'" :data-session-id="session.id" @click.stop />
            
            <button @click.stop="() => deleteSession(session.id)" class="ml-4 p-1.5 rounded-full border-2 text-white bg-red-500 border-red-500" title="Delete Session">
              <i class="pi pi-times text-sm font-bold"></i>
            </button>
          </div>
          
          <button @click="handleAddSession" class="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500 hover:bg-blue-600 text-white border border-blue-500 hover:border-blue-600 transition-colors text-sm" title="Create New Session">
            <i class="pi pi-plus text-sm"></i><span>Add</span>
          </button>
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        <button v-if="hasLocalStorageData" @click="migrateLocalStorageToDb" class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md border border-green-700 hover:border-green-800 transition-colors duration-200 cursor-pointer" title="Migrate data from localStorage to database">
          <i class="pi pi-database text-sm"></i>Migrate to DB
        </button>
        <button @click="showDatabaseContents" class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md border border-blue-200 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-700 transition-colors duration-200 cursor-pointer" title="Show database contents in Caido console">
          <i class="pi pi-list text-sm"></i>Show DB Contents
        </button>
        <button @click="openGitHubInBrowser" class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md border border-gray-200 dark:border-gray-600 transition-colors duration-200 cursor-pointer">
          <svg class="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>Star on GitHub
        </button>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden">
      <div class="flex-1 overflow-y-auto transition-all duration-300 ease-in-out">
        <div class="p-4">
          <TabView v-model:activeIndex="activeTab" class="h-full">
            <TabPanel header="Input">
            <div class="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h3 class="font-semibold text-blue-800 dark:text-blue-200 mb-2">Step 1: Input Your Schema</h3>
              <p class="text-sm text-blue-700 dark:text-blue-300">
                Paste your OpenAPI schema (JSON format) here. The schema will be validated and test cases will be generated.
              </p>
            </div>
              <div class="space-y-4">
                <div><label class="block text-sm font-medium mb-2">Base URL</label><InputText v-model="baseUrl" placeholder="http://localhost:3000" class="w-full" /></div>
                <div><label class="block text-sm font-medium mb-2">OpenAPI Schema (JSON)</label><Textarea v-model="schemaText" placeholder="Paste your OpenAPI schema here..." class="w-full h-64 font-mono text-sm" @input="validateSchema" /></div>
                <div v-if="validationResult">
                  <Message :severity="validationResult.valid ? 'success' : 'error'" :closable="false">
                    <template #messageicon><i :class="validationResult.valid ? 'pi pi-check' : 'pi pi-exclamation-triangle'"></i></template>
                    <div><div class="font-semibold">{{ validationResult.valid ? 'Schema is valid!' : 'Schema validation failed' }}</div><div v-if="validationResult.errors.length > 0" class="mt-2"><div v-for="error in validationResult.errors" :key="error" class="text-sm">• {{ error }}</div></div></div>
                  </Message>
                </div>
                <Button label="Load Schema" @click="loadSchema" :disabled="!validationResult?.valid" class="w-full" />
              </div>
            </TabPanel>
            <TabPanel header="Endpoints">
            <div v-if="!isSchemaLoaded" class="text-center py-8 text-gray-500">
              <i class="pi pi-list text-4xl mb-4"></i>
              <p>No schema loaded yet. Load a valid schema from the Input tab.</p>
            </div>

            <div v-else>
              <div class="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <h3 class="font-semibold text-green-800 dark:text-green-200 mb-2">Step 2: Configure & Test</h3>
                <p class="text-sm text-green-700 dark:text-green-300">
                  Configure your test settings and run tests. You can test individual endpoints or run all tests at once.
                </p>
              </div>

              <div class="space-y-4">
                <Card>
                  <template #title>Test Configuration</template>
                  <template #content>
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div><label class="block text-sm font-medium mb-2">Base URL</label><InputText v-model="baseUrl" placeholder="http://localhost:3000" class="w-full" /></div>
                      <div><label class="block text-sm font-medium mb-2">Number of Workers</label><InputNumber v-model="workers" :min="1" :max="10" class="w-full" placeholder="1" /></div>
                      <div><label class="block text-sm font-medium mb-2">Delay Between Requests (ms)</label><InputNumber v-model="delayBetweenRequests" :min="0" :max="10000" class="w-full" placeholder="0" /></div>
                      <div><label class="block text-sm font-medium mb-2">Timeout (ms)</label><InputNumber v-model="timeout" :min="1000" :max="120000" class="w-full" placeholder="30000" /></div>
                    </div>
                    <div class="mt-4">
                      <label class="block text-sm font-medium mb-2">Custom Headers</label>
                      <Textarea v-model="customHeaders" placeholder="Authorization: Bearer token&#10;X-API-Key: your-api-key&#10;X-Custom-Header: value" class="w-full h-20 text-sm font-mono" rows="3" />
                      <p class="text-xs text-gray-500 mt-1">Enter headers in format: Key: Value (one per line). If you add custom headers, they will replace the default headers completely.</p>
                    </div>
                    <div class="mt-4 space-y-3">
                      <div class="flex items-center gap-2"><input type="checkbox" id="randomValues" v-model="useRandomValues" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2" /><label for="randomValues" class="text-sm font-medium">Use Random Values for Empty Variables</label></div>
                      <p class="text-xs text-gray-500">When enabled, empty path variables will be filled with random strings instead of being left empty.</p>
                    </div>
                    <div class="mt-4 flex gap-2">
                      <Button label="Test All Endpoints" @click="runAllTests" :loading="isLoading" :disabled="isLoading" class="flex-1" />
                      <Button v-if="isLoading || runningTests.size > 0" label="Stop Tests" @click="stopAllTests" severity="danger" size="small" />
                    </div>
                  </template>
                </Card>
                <Card>
                  <template #title>
                    <div class="flex items-center justify-between">
                      <span>Endpoints ({{ displayTestCases.length }})</span>
                      <div class="flex items-center gap-2">
                        <InputText
                          v-model="endpointSearchQuery"
                          placeholder="Search endpoints..."
                          class="w-64"
                          size="small"
                        />
                        <Button 
                          v-if="endpointSearchQuery.trim()"
                          label="Clear" 
                          icon="pi pi-times"
                          @click="clearEndpointSearch"
                          severity="secondary"
                          size="small"
                        />
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
                        <div v-for="(testCase, index) in displayTestCases" :key="`${testCase.method}-${testCase.path}`" :class="index % 2 === 0 ? 'bg-blue-200 dark:bg-blue-900/40' : 'bg-blue-300 dark:bg-blue-900/50'" :style="index % 2 === 0 ? 'background-color: #2f323a' : 'background-color: #353942'">
                          <div class="px-4 py-3 cursor-pointer" @click="toggleTestCaseExpansion(testCase)">
                            <div class="grid grid-cols-5 gap-4 items-center">
                              <div><span class="px-2 py-1 rounded text-xs font-medium" :class="{'bg-blue-100 text-blue-800': testCase.method === 'GET', 'bg-green-100 text-green-800': testCase.method === 'POST', 'bg-yellow-100 text-yellow-800': testCase.method === 'PUT', 'bg-red-100 text-red-800': testCase.method === 'DELETE'}">{{ testCase.method }}</span></div>
                              <div class="col-span-2"><code class="text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 rounded whitespace-normal break-words">{{ testCase.path }}</code></div>
                              <div><div v-if="getTestStatus(testCase)" class="flex items-center gap-2"><span :class="getStatusClass(getTestStatus(testCase)!.success)">{{ getStatusIcon(getTestStatus(testCase)!.success) }}</span><span :class="getStatusClass(getTestStatus(testCase)!.success)">{{ getTestStatus(testCase)!.status }}</span></div><div v-else class="text-gray-400 text-sm">Not tested</div></div>
                              <div class="flex items-center gap-2" @click.stop>
                                <Button :icon="isTestCaseExpanded(testCase) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" size="small" @click="toggleTestCaseExpansion(testCase)" severity="secondary" text :title="isTestCaseExpanded(testCase) ? 'Collapse' : 'Expand'" />
                                <Button label="Test" size="small" @click="runSingleTest(testCase)" :loading="isTestRunning(testCase)" :disabled="isTestRunning(testCase) || isLoading" />
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
                                    <InputText v-model="testCasePathVariableValues[getTestCaseId(testCase)][variable]" :placeholder="`Value for ${variable}`" class="flex-1" size="small" />
                                  </div>
                                </div>
                              </div>
                              <div v-if="testCase.parameters && testCase.parameters.filter((p: any) => p.in === 'query').length > 0">
                                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Query Parameters</h4>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div v-for="param in testCase.parameters.filter((p: any) => p.in === 'query')" :key="param.name" class="flex items-center gap-2">
                                    <label class="text-sm text-gray-600 dark:text-gray-400 min-w-[100px]">{{ param.name }}:</label>
                                    <InputText v-model="testCaseQueryParameterValues[getTestCaseId(testCase)][param.name]" :placeholder="`Value for ${param.name}`" class="flex-1" size="small" />
                                  </div>
                                </div>
                              </div>
                              <div v-if="testCase.bodyVariables && Object.keys(testCase.bodyVariables).length > 0">
                                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Body Variables</h4>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div v-for="[key, value] in Object.entries(testCase.bodyVariables)" :key="key" class="flex items-center gap-2">
                                    <label class="text-sm text-gray-600 dark:text-gray-400 min-w-[100px]">{{ key }}:</label>
                                    <InputText v-model="testCaseBodyVariableValues[getTestCaseId(testCase)][key]" :placeholder="`Value for ${key}`" class="flex-1" size="small" />
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
          </TabPanel>

            <TabPanel header="Definition">
              <div v-if="!parsedSchema" class="text-center py-8 text-gray-500">
                <i class="pi pi-file-text text-4xl mb-4"></i>
                <p>No schema loaded yet. Load a valid schema from the Input tab to view its definition.</p>
              </div>
              <div v-else class="space-y-6">
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
                        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" @click="togglePathExpansion(path)">
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
                            <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" @click="toggleComponentExpansion(name)">
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
                            <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" @click="toggleComponentExpansion(name)">
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
            </TabPanel>
            <TabPanel header="Results">
              <div class="space-y-4">
                <div v-if="!hasResults" class="text-center py-8 text-gray-500"><i class="pi pi-chart-bar text-4xl mb-4"></i><p>No test results yet. Run tests from the Endpoints tab.</p></div>
                <div v-else>
                  <Card>
                    <template #title>
                      <div class="flex items-center justify-between">
                        <span>{{ isQueryActive ? 'Filtered Test Results' : 'Test Results' }}<span v-if="isQueryActive" class="text-sm text-gray-500 ml-2">({{ filteredTestResults.length }} of {{ allTestResults.length }})</span></span>
                        <Button label="Clear All Results" icon="pi pi-trash" @click="clearAllResults" severity="danger" size="small" />
                      </div>
                    </template>
                    <template #content>
                      <div class="space-y-2">
                        <div v-for="data in (isQueryActive ? filteredTestResults : allTestResults)" :key="getResultId(data)" class="border border-gray-200 dark:border-gray-700 rounded-lg">
                          <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer" @click="toggleResultExpansion(getResultId(data))">
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
            </TabPanel>
          </TabView>
        </div>
      </div>
      <div v-if="isSchemaLoaded && (getUniquePathVariables().length > 0 || Object.keys(bodyVariableValues).length > 0)" :class="['w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-lg transition-all duration-300 ease-in-out overflow-y-auto', sidebarOpen ? 'translate-x-0' : 'translate-x-full']">
        <div class="p-4">
          <div class="mb-4"><h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">Global Variables</h3></div>
          <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div class="mb-3"><h4 class="text-md font-medium text-gray-700 dark:text-gray-300">Path Variables</h4><p class="text-xs text-gray-500 mt-1">Add multiple values to test different combinations. Each value will be tested separately.</p></div>
            <div class="space-y-3">
              <div v-for="variable in getUniquePathVariables()" :key="variable" class="space-y-2">
                <div class="flex items-center justify-between"><label class="block text-sm font-medium text-gray-700 dark:text-gray-300">{{ variable }}</label><Button label="Add Value" icon="pi pi-plus" @click="addPathVariableValue(variable)" size="small" severity="success" class="text-xs px-2 py-1" /></div>
                <div class="space-y-2">
                  <div v-for="(value, index) in getPathVariableValue(variable)" :key="index" class="flex items-center gap-2">
                    <InputText v-model="pathVariableValues[variable][index]" :placeholder="`Value ${index + 1} for ${variable}`" class="flex-1" @paste="handlePathVariablePaste(variable, $event)" />
                    <Button v-if="getPathVariableValue(variable).length > 1" label="Remove" icon="pi pi-trash" @click="removePathVariableValue(variable, index)" size="small" severity="danger" class="text-xs px-2 py-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="Object.keys(bodyVariableValues).length > 0" class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div class="mb-3"><h4 class="text-md font-medium text-gray-700 dark:text-gray-300">Body Variables</h4><p class="text-xs text-gray-500 mt-1">Customize request body parameters for POST/PUT/PATCH requests.</p></div>
            <div class="space-y-3">
              <div v-for="[key, value] in sortedBodyVariables" :key="key" class="space-y-2">
                <div class="flex items-center justify-between"><label class="block text-sm font-medium text-gray-700 dark:text-gray-300">{{ key }}</label><Button label="Add Value" icon="pi pi-plus" @click="addBodyVariableValue(key)" size="small" severity="success" class="text-xs px-2 py-1" /></div>
                <div class="space-y-2">
                  <div v-for="(value, index) in getBodyVariableValue(key)" :key="index" class="flex items-center gap-2">
                    <InputText v-model="bodyVariableValues[key][index]" :placeholder="`Value ${index + 1} for ${key}`" class="flex-1" @paste="handleBodyVariablePaste(key, $event)" />
                    <Button v-if="getBodyVariableValue(key).length > 1" label="Remove" icon="pi pi-trash" @click="removeBodyVariableValue(key, index)" size="small" severity="danger" class="text-xs px-2 py-1" />
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
  border-left-color: white !important;
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

/* Override PrimeVue default column widths for better resizing */
:deep([data-pc-name="datatable"] [data-pc-section="tablecontainer"] table[data-pc-section="table"] thead[data-pc-section="thead"] tr th:nth-child(2)),
:deep([data-pc-name="datatable"] [data-pc-section="tablecontainer"] table[data-pc-section="table"] tbody[data-pc-section="tbody"] tr td:nth-child(2)),
:deep([data-pc-name="datatable"] [data-pc-section="tablecontainer"] table[data-pc-section="table"] tfoot[data-pc-section="tfoot"] tr td:nth-child(2)) {
  width: 25vw !important;
  max-width: 25vw !important;
  min-width: 200px !important;
}

/* Allow resizing for all columns */
:deep([data-pc-name="datatable"] [data-pc-section="tablecontainer"] table[data-pc-section="table"] thead[data-pc-section="thead"] tr th) {
  min-width: 100px !important;
  max-width: none !important;
}

/* Force path column width */
:deep(.path-column) {
  width: 25vw !important;
  max-width: 25vw !important;
  min-width: 200px !important;
}

:deep(.path-column .p-column-header-content),
:deep(.path-column .p-column-body) {
  width: 25vw !important;
  max-width: 25vw !important;
}
</style>
