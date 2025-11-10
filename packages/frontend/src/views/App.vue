<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";

// Extend window interface for our custom property
declare global {
  interface Window {
    openapiUrlCheckInterval?: NodeJS.Timeout;
  }
}
import InputText from "primevue/inputtext";
// import Textarea from "primevue/textarea";
// import Card from "primevue/card";
// import Message from "primevue/message";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";
// import InputNumber from "primevue/inputnumber";
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";

import { useSDK } from "@/plugins/sdk";
import InputTab from "@/components/InputTab.vue";
import EndpointsTab from "@/components/EndpointsTab.vue";
import DefinitionTab from "@/components/DefinitionTab.vue";
import ResultsTab from "@/components/ResultsTab.vue";
import SettingsTab from "@/components/SettingsTab.vue";

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


// Get project key - check openapi env var first, then use project ID as fallback
const getProjectKey = async (projectId?: string): Promise<string> => {
  // FIRST: Check if openapi environment variable is available
  try {
    const openapiValue = await sdk.env.getVar('openapi');
    if (openapiValue) {
      console.log(`Found 'openapi' env var: ${openapiValue}`);
      return openapiValue;
    }
  } catch (error) {
    console.warn('Failed to get openapi env var:', error);
  }
  
  // SECOND: If no openapi env var, use project ID if provided
  if (projectId) {
    console.log(`No 'openapi' env var found, using project ID as key: ${projectId}`);
    return projectId;
  }
  
  // THIRD: Fallback to 'default' if no project ID available
  console.log(`No 'openapi' env var and no project ID, using 'default' key`);
  return 'default';
};


// Session management
interface OpenAPISession {
  id: string;
  name: string;
  schemaText: string;
  baseUrl: string;
  useRandomValues: boolean;
  useParameterFromDefinition: boolean;
  testResults: any[];
  testCases: any[];
  isSchemaLoaded: boolean;
  isRawMode?: boolean;
  rawEndpoints?: string;
  pathVariableValues: Record<string, string[]>;
  queryParameterValues: Record<string, string[]>;
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

// Global settings (stored in database, not per session)
const workers = ref(10);
const delayBetweenRequests = ref(100);
const timeout = ref(30000);
const allowDeleteInAllMethods = ref(false);
const defaultPlaceholders = ref({
  string: 'string',
  integer: 0,
  number: 0,
  boolean: true,
  email: 'user@example.com',
  date: '2023-01-01',
  dateTime: '2023-01-01T00:00:00Z',
  uuid: '123e4567-e89b-12d3-a456-426614174000'
});
const showSettingsDialog = ref(false);

// Reactive state (now session-specific)
const schemaText = ref("");
const baseUrl = ref("https://google.com");
const useRandomValues = ref(false);
const useParameterFromDefinition = ref(true); // Default to true to use example values
const isLoading = ref(false);
const validationResult = ref<{ valid: boolean; errors: string[] } | null>(null);
const testResults = ref<any[]>([]);
const activeTab = ref(0);
const testCases = ref<any[]>([]);
const isSchemaLoaded = ref(false);
const isRawMode = ref(false); // Track if we're in raw endpoint mode
const inputMode = ref<'schema' | 'raw'>('schema');
const rawEndpoints = ref("");
const pathVariableValues = ref<Record<string, string[]>>({});
const queryParameterValues = ref<Record<string, string[]>>({});
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

const requestEditorContainers = ref<Map<string, HTMLElement>>(new Map());
const responseEditorContainers = ref<Map<string, HTMLElement>>(new Map());

const filteredTestResults = ref<any[]>([]);
const isQueryActive = ref(false);

// Endpoint search functionality
const endpointSearchQuery = ref("");

const parsedSchema = ref<any>(null);

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
    useRandomValues: false,
    useParameterFromDefinition: true,
    testResults: [],
    testCases: [],
    isSchemaLoaded: false,
    pathVariableValues: {},
    queryParameterValues: {},
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
    currentSession.useRandomValues = useRandomValues.value;
    currentSession.useParameterFromDefinition = useParameterFromDefinition.value;
    currentSession.testResults = [...testResults.value];
    currentSession.testCases = [...testCases.value];
    currentSession.isSchemaLoaded = isSchemaLoaded.value;
    currentSession.isRawMode = isRawMode.value;
    currentSession.rawEndpoints = rawEndpoints.value;
    currentSession.pathVariableValues = { ...pathVariableValues.value };
    currentSession.queryParameterValues = { ...queryParameterValues.value };
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
  try {
    console.log(`loadSession called with sessionId: ${sessionId}`);
    console.log(`Available sessions: ${sessions.value.length}`, sessions.value.map(s => ({ id: s.id, name: s.name })));
    
    const session = sessions.value.find(s => s.id === sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found in sessions array!`);
      // Set a default session ID to prevent UI from breaking
      if (sessions.value.length > 0) {
        currentSessionId.value = sessions.value[0].id;
      }
      return;
    }
    
    console.log(`Loading session: ${session.name} (${session.id})`);
    console.log(`Session data:`, {
      hasSchemaText: !!session.schemaText,
      schemaTextLength: session.schemaText?.length || 0,
      hasTestCases: !!session.testCases,
      testCasesCount: Array.isArray(session.testCases) ? session.testCases.length : 0,
      hasTestResults: !!session.testResults,
      testResultsCount: Array.isArray(session.testResults) ? session.testResults.length : 0,
      isSchemaLoaded: session.isSchemaLoaded
    });
    
    // Save current session before switching (only if switching to a different session)
    if (currentSessionId.value && currentSessionId.value !== sessionId) {
      try {
        await saveCurrentSession();
      } catch (saveError) {
        console.error('Error saving current session before switch:', saveError);
        // Continue anyway
      }
    }
    
    // Load new session data with safe defaults
    try {
      schemaText.value = session.schemaText || '';
      baseUrl.value = session.baseUrl || '';
      useRandomValues.value = session.useRandomValues || false;
      useParameterFromDefinition.value = session.useParameterFromDefinition !== undefined ? session.useParameterFromDefinition : true;
      testResults.value = Array.isArray(session.testResults) ? [...session.testResults] : [];
      testCases.value = Array.isArray(session.testCases) ? [...session.testCases] : [];
      isSchemaLoaded.value = session.isSchemaLoaded || false;
      isRawMode.value = session.isRawMode || false;
      rawEndpoints.value = session.rawEndpoints || '';
      inputMode.value = session.isRawMode ? 'raw' : 'schema';
      pathVariableValues.value = session.pathVariableValues && typeof session.pathVariableValues === 'object' ? { ...session.pathVariableValues } : {};
      queryParameterValues.value = session.queryParameterValues && typeof session.queryParameterValues === 'object' ? { ...session.queryParameterValues } : {};
      bodyVariableValues.value = session.bodyVariableValues && typeof session.bodyVariableValues === 'object' ? { ...session.bodyVariableValues } : {};
      customHeaders.value = session.customHeaders || '';
      variablesExpanded.value = session.variablesExpanded || false;
      expandedResults.value = Array.isArray(session.expandedResults) ? new Set(session.expandedResults) : new Set();
      expandedTestCases.value = Array.isArray(session.expandedTestCases) ? new Set(session.expandedTestCases) : new Set();
      requestResponseTab.value = session.requestResponseTab || 'request';
      testCasePathVariableValues.value = session.testCasePathVariableValues && typeof session.testCasePathVariableValues === 'object' ? { ...session.testCasePathVariableValues } : {};
      testCaseQueryParameterValues.value = session.testCaseQueryParameterValues && typeof session.testCaseQueryParameterValues === 'object' ? { ...session.testCaseQueryParameterValues } : {};
      testCaseBodyVariableValues.value = session.testCaseBodyVariableValues && typeof session.testCaseBodyVariableValues === 'object' ? { ...session.testCaseBodyVariableValues } : {};
    } catch (dataError) {
      console.error('Error loading session data:', dataError);
      // Set safe defaults
      schemaText.value = '';
      baseUrl.value = '';
      testResults.value = [];
      testCases.value = [];
      isSchemaLoaded.value = false;
    }
    
    console.log(`Loaded session data:`, {
      schemaTextLength: schemaText.value.length,
      testCasesCount: testCases.value.length,
      testResultsCount: testResults.value.length,
      isSchemaLoaded: isSchemaLoaded.value
    });
    
    // Re-parse schema if it was loaded in this session
    if (session.isSchemaLoaded && schemaText.value) {
      try {
        console.log('Re-parsing schema...');
        const schema = parseOpenAPISchemaLocally(schemaText.value);
        parsedSchema.value = schema;
        console.log('Schema parsed successfully');
      } catch (error) {
        console.error('Failed to re-parse schema when loading session:', error);
        parsedSchema.value = null;
        isSchemaLoaded.value = false;
      }
    } else {
      console.log('Skipping schema re-parse (isSchemaLoaded:', session.isSchemaLoaded, ', schemaText length:', schemaText.value.length, ')');
      parsedSchema.value = null;
    }
    
    currentSessionId.value = sessionId;
    console.log(`Session ${sessionId} loaded successfully. Current session ID: ${currentSessionId.value}`);
  } catch (error) {
    console.error('Critical error in loadSession:', error);
    // Ensure we always have a valid session ID to prevent UI from breaking
    if (sessions.value.length > 0) {
      currentSessionId.value = sessions.value[0].id;
    }
    // Re-throw to let caller handle it
    throw error;
  }
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
    // Check openapi env var first, then use currentProjectId (which should be project ID) as fallback
    let projectKey: string;
    try {
      const openapiValue = await sdk.env.getVar('openapi');
      if (openapiValue) {
        console.log(`Found 'openapi' env var for saving: ${openapiValue}`);
        projectKey = openapiValue;
        currentProjectId.value = projectKey; // Update currentProjectId to match
      } else {
        // If no env var, use currentProjectId (which should be project ID) as fallback
        if (currentProjectId.value && currentProjectId.value !== 'default') {
          projectKey = currentProjectId.value;
          console.log(`No 'openapi' env var found, using currentProjectId as key: ${currentProjectId.value}`);
        } else {
          // Last resort: use 'default' if currentProjectId is not set or is 'default'
          projectKey = 'default';
          console.log(`No 'openapi' env var and no valid currentProjectId, using 'default' key`);
        }
      }
    } catch (error) {
      console.warn('Failed to get openapi env var:', error);
      // Fall back to currentProjectId if available
      if (currentProjectId.value && currentProjectId.value !== 'default') {
        projectKey = currentProjectId.value;
        console.log(`Using currentProjectId as fallback: ${currentProjectId.value}`);
      } else {
        projectKey = 'default';
        console.log(`Using 'default' as fallback`);
      }
    }
    
    // Convert sessions to serializable format
    const sessionsData = sessions.value.map(session => {
      const serializableSession: any = {};
      
      // Copy all properties, handling special cases
      for (const [key, value] of Object.entries(session)) {
        // Skip functions and undefined values
        if (typeof value === 'function' || value === undefined) {
          continue;
        }
        
        // Convert Sets to arrays
        if (value instanceof Set) {
          serializableSession[key] = Array.from(value);
        } else if (value instanceof Map) {
          serializableSession[key] = Array.from(value.entries());
        } else {
          serializableSession[key] = value;
        }
      }
      
      return serializableSession;
    });
    
    // const storageKey = `openapi-sessions-${projectKey}`;
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
    // Check openapi env var first, then use currentProjectId (which should be project ID) as fallback
    let projectKey: string;
    try {
      const openapiValue = await sdk.env.getVar('openapi');
      if (openapiValue) {
        console.log(`Found 'openapi' env var for loading: ${openapiValue}`);
        projectKey = openapiValue;
        currentProjectId.value = projectKey; // Update currentProjectId to match
      } else {
        // If no env var, use currentProjectId (which should be project ID) as fallback
        if (currentProjectId.value && currentProjectId.value !== 'default') {
          projectKey = currentProjectId.value;
          console.log(`No 'openapi' env var found, using currentProjectId as key: ${currentProjectId.value}`);
        } else {
          // Last resort: use 'default' if currentProjectId is not set or is 'default'
          projectKey = 'default';
          console.log(`No 'openapi' env var and no valid currentProjectId, using 'default' key`);
        }
      }
    } catch (error) {
      console.warn('Failed to get openapi env var:', error);
      // Fall back to currentProjectId if available
      if (currentProjectId.value && currentProjectId.value !== 'default') {
        projectKey = currentProjectId.value;
        console.log(`Using currentProjectId as fallback: ${currentProjectId.value}`);
      } else {
        projectKey = 'default';
        console.log(`Using 'default' as fallback`);
      }
    }
    
    const storageKey = `openapi-sessions-${projectKey}`;
    console.log(`Loading sessions for project key: ${projectKey}`);
    
    let sessionsData = null;
    
    // Try to load from Caido database
    try {
      const result = await sdk.backend.loadSessionsFromDb(projectKey);
      if (result.kind === "Ok") {
        sessionsData = result.value;
        console.log(`Loaded ${sessionsData ? (Array.isArray(sessionsData) ? sessionsData.length : 'non-array') : 'null'} sessions from database for project key: ${projectKey}`);
      } else {
        console.warn('Failed to load sessions from database:', result.error);
      }
    } catch (dbError) {
      console.error('Database load failed:', dbError);
    }
    
    // If no sessions found with primary project key, try to find sessions in other project keys
    if ((!sessionsData || !Array.isArray(sessionsData) || sessionsData.length === 0) && sdk.backend.getAllSessionProjectKeys) {
      try {
        console.log('No sessions found with primary project key, searching for sessions in other project keys...');
        const allKeysResult = await sdk.backend.getAllSessionProjectKeys();
        if (allKeysResult.kind === "Ok" && allKeysResult.value && allKeysResult.value.length > 0) {
          console.log(`Found ${allKeysResult.value.length} project keys with sessions:`, allKeysResult.value);
          
          // Try loading from each project key until we find sessions
          for (const otherProjectKey of allKeysResult.value) {
            if (otherProjectKey === projectKey) continue; // Already tried this one
            
            console.log(`Trying to load sessions from project key: ${otherProjectKey}`);
            const otherResult = await sdk.backend.loadSessionsFromDb(otherProjectKey);
            if (otherResult.kind === "Ok" && otherResult.value && Array.isArray(otherResult.value) && otherResult.value.length > 0) {
              console.log(`Found ${otherResult.value.length} sessions in project key: ${otherProjectKey}`);
              sessionsData = otherResult.value;
              // Update currentProjectId to match the project key where we found sessions
              currentProjectId.value = otherProjectKey;
              projectKey = otherProjectKey;
              break;
            }
          }
        }
      } catch (searchError) {
        console.error('Failed to search for sessions in other project keys:', searchError);
      }
    }
    
    // Also check if sessionsData is an object with sessions property
    if (sessionsData && typeof sessionsData === 'object' && !Array.isArray(sessionsData)) {
      if (sessionsData.sessions && Array.isArray(sessionsData.sessions)) {
        sessionsData = sessionsData.sessions;
      } else if (sessionsData.value && Array.isArray(sessionsData.value)) {
        sessionsData = sessionsData.value;
      } else {
        // Try to convert object to array if it has numeric keys
        const keys = Object.keys(sessionsData);
        if (keys.length > 0 && keys.every(k => !isNaN(Number(k)))) {
          sessionsData = Object.values(sessionsData);
        } else {
          console.warn('Sessions data is an object but not in expected format:', sessionsData);
          sessionsData = null;
        }
      }
    }
    
    if (sessionsData && Array.isArray(sessionsData)) {
      console.log(`Processing ${sessionsData.length} sessions...`);
      console.log('First session sample:', sessionsData[0] ? {
        id: sessionsData[0].id,
        name: sessionsData[0].name,
        hasSchemaText: !!sessionsData[0].schemaText,
        hasTestCases: !!sessionsData[0].testCases,
        hasTestResults: !!sessionsData[0].testResults
      } : 'No sessions');
      
      try {
        sessions.value = sessionsData.map(session => {
          try {
            return {
              ...session,
              expandedResults: new Set(session.expandedResults || []),
              expandedTestCases: new Set(session.expandedTestCases || [])
            };
          } catch (mapError) {
            console.error('Error mapping session:', mapError, session);
            // Return a minimal valid session object
            return {
              ...session,
              expandedResults: new Set(),
              expandedTestCases: new Set()
            };
          }
        });
        
        console.log(`Mapped ${sessions.value.length} sessions to reactive state`);
        
        // Initialize session counter for this project based on existing sessions
        if (sessions.value.length > 0) {
          try {
            const maxSessionNumber = Math.max(...sessions.value.map(session => {
              const match = session.name?.match(/Session (\d+)/);
              return match ? parseInt(match[1]) : 0;
            }));
            sessionCounter.value[currentProjectId.value] = maxSessionNumber + 1;
          } catch (counterError) {
            console.error('Error calculating session counter:', counterError);
            sessionCounter.value[currentProjectId.value] = sessions.value.length + 1;
          }
          
          console.log(`Loading first session: ${sessions.value[0].id} (${sessions.value[0].name})`);
          // Load the first session with error handling
          try {
            await loadSession(sessions.value[0].id);
            console.log('Session loaded successfully');
          } catch (loadError) {
            console.error('Error loading session:', loadError);
            // Even if loading fails, ensure we have a valid state
            currentSessionId.value = sessions.value[0].id;
          }
        } else {
          console.log('Sessions array is empty, creating new session');
          // No sessions found, create a new one
          sessionCounter.value[currentProjectId.value] = 1;
          const newSession = createNewSession();
          sessions.value = [newSession];
          try {
            await loadSession(newSession.id);
          } catch (loadError) {
            console.error('Error loading new session:', loadError);
            currentSessionId.value = newSession.id;
          }
        }
      } catch (processingError) {
        console.error('Error processing sessions:', processingError);
        // Fallback: create a new session to ensure UI doesn't break
        try {
          sessionCounter.value[currentProjectId.value] = 1;
          const newSession = createNewSession();
          sessions.value = [newSession];
          currentSessionId.value = newSession.id;
        } catch (fallbackError) {
          console.error('Critical error in fallback session creation:', fallbackError);
        }
      }
    } else {
      console.log(`No valid sessions data found. Type: ${typeof sessionsData}, IsArray: ${Array.isArray(sessionsData)}`);
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
      if (schema.format === 'email') return defaultPlaceholders.value.email;
      if (schema.format === 'date') return defaultPlaceholders.value.date;
      if (schema.format === 'date-time') return defaultPlaceholders.value.dateTime;
      if (schema.format === 'uuid') return defaultPlaceholders.value.uuid;
      return defaultPlaceholders.value.string;
    case 'integer':
      return defaultPlaceholders.value.integer;
    case 'number':
      return defaultPlaceholders.value.number;
    case 'boolean':
      return defaultPlaceholders.value.boolean;
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
      return defaultPlaceholders.value.string;
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

// Parse raw endpoint line
const parseRawEndpoint = (line: string): { method: string | null; path: string } | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  
  // Check for method in brackets: [METHOD] /path
  const methodMatch = trimmed.match(/^\[([A-Z]+)\]\s+(.+)$/);
  if (methodMatch) {
    return {
      method: methodMatch[1].toUpperCase(),
      path: methodMatch[2].trim()
    };
  }
  
  // Check if it starts with / (path only, no method)
  if (trimmed.startsWith('/')) {
    return {
      method: null,
      path: trimmed
    };
  }
  
  return null;
};

// Generate test cases from raw endpoints
const generateTestCasesFromRaw = (rawText: string): any[] => {
  const lines = rawText.split('\n');
  const testCases: any[] = [];
  
  for (const line of lines) {
    const parsed = parseRawEndpoint(line);
    if (!parsed) continue;
    
    const { method, path } = parsed;
    const pathVariables = extractPathVariables(path);
    
    if (method) {
      // With method - create single test case
      testCases.push({
        path,
        method: method,
        name: `${method} ${path}`,
        description: `Test ${method} ${path}`,
        parameters: [],
        requestBody: null,
        expectedStatus: 200,
        pathVariables,
        bodyVariables: {},
        originalPath: path,
        isRaw: true,
        hasMethod: true
      });
    } else {
      // Without method - create test case without method
      testCases.push({
        path,
        method: null,
        name: path,
        description: `Test ${path}`,
        parameters: [],
        requestBody: null,
        expectedStatus: 200,
        pathVariables,
        bodyVariables: {},
        originalPath: path,
        isRaw: true,
        hasMethod: false
      });
    }
  }
  
  return testCases;
};

const loadSchema = async () => {
  if (!schemaText.value.trim()) {
    return;
  }

  try {
    isRawMode.value = false;
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
        if (testCase.pathVariables && Array.isArray(testCase.pathVariables)) {
          testCase.pathVariables.forEach((variable: string) => {
            if (variable && typeof variable === 'string') {
              allPathVariables.add(variable);
            }
          });
        }
      });
      
      // Initialize path variable values
      pathVariableValues.value = {};
      allPathVariables.forEach(variable => {
        pathVariableValues.value[variable] = [''];
      });
      
      // Initialize query parameter values
      const allQueryParameters = new Set<string>();
      cases.forEach(testCase => {
        if (testCase.parameters && Array.isArray(testCase.parameters)) {
          testCase.parameters.forEach((param: any) => {
            if (param.in === 'query' && param.name && typeof param.name === 'string') {
              allQueryParameters.add(param.name);
            }
          });
        }
      });
      
      queryParameterValues.value = {};
      allQueryParameters.forEach(param => {
        queryParameterValues.value[param] = [''];
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

const loadRawEndpoints = async () => {
  if (!rawEndpoints.value.trim()) {
    return;
  }

  try {
    isRawMode.value = true;
    parsedSchema.value = null; // No schema in raw mode
    
    // Generate test cases from raw endpoints
    const cases = generateTestCasesFromRaw(rawEndpoints.value);
    testCases.value = cases;
    isSchemaLoaded.value = true;
    activeTab.value = 1; // Switch to test cases tab
    
    // Auto-save session after loading raw endpoints
    await saveCurrentSession();
    
    // Initialize path variables
    const allPathVariables = new Set<string>();
    cases.forEach(testCase => {
      if (testCase.pathVariables && Array.isArray(testCase.pathVariables)) {
        testCase.pathVariables.forEach((variable: string) => {
          if (variable && typeof variable === 'string') {
            allPathVariables.add(variable);
          }
        });
      }
    });
    
    // Initialize path variable values
    pathVariableValues.value = {};
    allPathVariables.forEach(variable => {
      pathVariableValues.value[variable] = [''];
    });
    
    // No query parameters or body variables in raw mode
    queryParameterValues.value = {};
    bodyVariableValues.value = {};
    
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
    });
  } catch (error) {
    console.error("Failed to load raw endpoints:", error);
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

const runAllMethods = async (testCase: any) => {
  if (!baseUrl.value.trim()) {
    return;
  }

  // Define all HTTP methods to test
  // "All Methods" should test all methods on the selected endpoint, even if no method is specified
  const allMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'];
  
  // Filter out DELETE if not allowed
  const methodsToTest = allowDeleteInAllMethods.value 
    ? allMethods 
    : allMethods.filter(m => m !== 'DELETE');

  // Mark all methods as running
  methodsToTest.forEach(method => {
    const testName = `${method} ${testCase.path}`;
    runningTests.value.add(testName);
  });

  try {
    const options = {
      workers: 1,
      delayBetweenRequests: 0,
      timeout: timeout.value,
      headers: parseCustomHeaders(),
      useParameterFromDefinition: useParameterFromDefinition.value
    };

    // Run each method using the CURRENT test case's variable values
    // This ensures all methods are tested with the same variable values
    // and doesn't affect other test cases on the same endpoint with different values
    for (const method of methodsToTest) {
      if (stopTestRequested.value) break;

      // Always create a new test case entry for this method using the current test case's values
      // Use a unique name to avoid conflicts with existing test cases
      const originalTestCaseId = getTestCaseId(testCase);
      const methodTestCase = {
        ...testCase,
        method: method,
        name: `${method} ${testCase.path} [${originalTestCaseId}]`,
        originalMethod: testCase.method, // Keep original for reference
        originalTestCaseId: originalTestCaseId // Track which test case triggered this
      };

      // Get body and query variables from the ORIGINAL test case (current endpoint's values)
      // This ensures all methods use the same variable values
      const bodyVars = getTestCaseBodyVariables(testCase);
      const queryVars = getTestCaseQueryParameters(testCase);
      
      // Get path variables from the original test case
      const pathVars: Record<string, string> = {};
      const testCaseId = getTestCaseId(testCase);
      if (testCase.pathVariables) {
        testCase.pathVariables.forEach((variable: string) => {
          // Use test case specific values if available, otherwise use global values
          const testCaseValues = testCasePathVariableValues.value[testCaseId]?.[variable];
          if (testCaseValues !== undefined && testCaseValues !== '') {
            pathVars[variable] = testCaseValues;
          } else if (pathVariableValues.value[variable] && pathVariableValues.value[variable].length > 0) {
            pathVars[variable] = pathVariableValues.value[variable][0];
          }
        });
      }

      // Run the test
      const result = await sdk.backend.runSingleTest(
        toMinimalTestCase(methodTestCase),
        baseUrl.value,
        options,
        pathVars,
        bodyVars,
        queryVars
      );

      // For raw endpoints, don't create new test case entries - just store results directly
      if (testCase.isRaw) {
        // Add result directly to testResults without creating new test cases
        const testResult = {
          ...result,
          testCase: {
            path: methodTestCase.path,
            method: methodTestCase.method,
            name: methodTestCase.name
          },
          timestamp: new Date().toISOString()
        };
        testResults.value.push(testResult);
      } else {
        // For regular schema endpoints, create/update test case entries
        // Check if this test case already exists (by name)
        const existingIndex = testCases.value.findIndex(tc => tc.name === methodTestCase.name);
        if (existingIndex === -1) {
          // Add new test case
          testCases.value.push(methodTestCase);
        } else {
          // Update existing test case
          methodTestCase.name = testCases.value[existingIndex].name; // Keep original name
          testCases.value[existingIndex] = methodTestCase;
        }

        // Update the test case result
        updateTestCaseResult(methodTestCase, result);
      }

      // Add delay between requests if specified
      if (delayBetweenRequests.value > 0 && methodsToTest.indexOf(method) < methodsToTest.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests.value));
      }
    }

    // Save session after all methods are tested
    await saveCurrentSession();
  } catch (error) {
    console.error("All methods test execution failed:", error);
  } finally {
    // Remove all method test names from running tests
    methodsToTest.forEach(method => {
      const testName = `${method} ${testCase.path}`;
      runningTests.value.delete(testName);
    });
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
  const { status, response, error, responseHeaders, responseRaw } = testResult;
  
  // If we have raw response text, use it directly (includes headers)
  if (responseRaw) {
    return responseRaw;
  }
  
  // Otherwise, construct from available data
  let responseText = `HTTP/1.1 ${status}${status === 404 ? ' Not Found' : status === 200 ? ' OK' : ''}\r\n`;
  
  // Use actual response headers if available
  if (responseHeaders && Object.keys(responseHeaders).length > 0) {
    Object.entries(responseHeaders).forEach(([key, value]) => {
      responseText += `${key}: ${value}\r\n`;
    });
  } else {
    // Fallback to default headers only if no actual headers are available
    responseText += `Content-Type: ${typeof response === 'object' ? 'application/json' : 'text/html; charset=UTF-8'}\r\n`;
    responseText += `Content-Length: ${getResponseLength(response)}\r\n`;
    responseText += `Date: ${new Date().toUTCString()}\r\n`;
  }
  
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

const getPathVariableValue = (variable: string) => {
  return pathVariableValues.value[variable] || [''];
};

const getQueryParameterValue = (param: string) => {
  return queryParameterValues.value[param] || [''];
};

const addPathVariableValue = (variable: string) => {
  if (!pathVariableValues.value[variable]) {
    pathVariableValues.value[variable] = [''];
  } else {
    pathVariableValues.value[variable].push('');
  }
};

const addQueryParameterValue = (param: string) => {
  if (!queryParameterValues.value[param]) {
    queryParameterValues.value[param] = [''];
  } else {
    queryParameterValues.value[param].push('');
  }
};

const removeQueryParameterValue = (param: string, index: number) => {
  if (queryParameterValues.value[param] && queryParameterValues.value[param].length > 1) {
    queryParameterValues.value[param].splice(index, 1);
  }
};

const handleQueryParameterPaste = (param: string, event: ClipboardEvent) => {
  const pastedText = event.clipboardData?.getData('text') || '';
  const lines = parseMultiLineInput(pastedText);
  
  if (lines.length > 1) {
    event.preventDefault();
    
    if (!queryParameterValues.value[param]) {
      queryParameterValues.value[param] = [];
    }
    
    queryParameterValues.value[param].push(...lines);
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
  // Check if this specific test case is running
  if (runningTests.value.has(testCase.name)) {
    return true;
  }
  // Also check if any method variant of this path is running (for "All Methods" button)
  const allMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'];
  return allMethods.some(method => {
    const testName = `${method} ${testCase.path}`;
    return runningTests.value.has(testName);
  });
};


const getUniquePathVariables = () => {
  const variables = new Set<string>();
  testCases.value.forEach(testCase => {
    if (testCase.pathVariables && Array.isArray(testCase.pathVariables)) {
      testCase.pathVariables.forEach((variable: string) => {
        if (variable && typeof variable === 'string') {
          variables.add(variable);
        }
      });
    }
  });
  return Array.from(variables).sort((a, b) => a.localeCompare(b));
};

const getUniqueQueryParameters = () => {
  const params = new Set<string>();
  testCases.value.forEach(testCase => {
    if (testCase.parameters && Array.isArray(testCase.parameters)) {
      testCase.parameters.forEach((param: any) => {
        if (param.in === 'query' && param.name && typeof param.name === 'string') {
          params.add(param.name);
        }
      });
    }
  });
  return Array.from(params).sort((a, b) => a.localeCompare(b));
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
  // Handle null/undefined methods for raw endpoints
  const method = testCase.method || 'NO_METHOD';
  return `${method}-${testCase.path}`;
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
  
  // Override with global query parameter values (sidebar values) as fallback
  if (testCase.parameters) {
    testCase.parameters.forEach((param: any) => {
      if (param.in === 'query' && param.name) {
        // Check global query parameter values if test case specific value is not set
        if (!testCaseQueryParameterValues.value[testCaseId]?.[param.name]) {
          const globalValues = queryParameterValues.value[param.name];
          if (globalValues && globalValues.length > 0 && globalValues[0].trim() !== '') {
            queryVars[param.name] = globalValues[0];
          }
        }
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
watch([schemaText, baseUrl, workers, delayBetweenRequests, timeout, useRandomValues, useParameterFromDefinition, pathVariableValues, queryParameterValues, bodyVariableValues, customHeaders, testCases, testResults], () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    await saveCurrentSession();
  }, 1000); // Debounce: save 1 second after last change
}, { deep: true });

// Load results and sessions on mount
let projectChangeHandler: { stop: () => void } | null = null;

onMounted(async () => {
  // Check migration status on mount
  await checkMigrationStatus();
  
  // Handle project change
  const handleProjectChange = async (event: { projectId: string | undefined }) => {
    try {
      console.log('Project change event received, projectId:', event.projectId);
      
      // FIRST: Check if openapi environment variable is available for the new project
      // If not available, use project ID from the event as the session key
      let newProjectKey: string;
      try {
        const openapiValue = await sdk.env.getVar('openapi');
        if (openapiValue) {
          console.log(`Found 'openapi' env var for new project: ${openapiValue}`);
          newProjectKey = openapiValue;
        } else {
          // If no env var, use project ID from event as fallback
          if (event.projectId) {
            newProjectKey = event.projectId;
            console.log(`No 'openapi' env var found, using project ID as key: ${event.projectId}`);
          } else {
            // Last resort: use 'default' if no project ID available
            newProjectKey = 'default';
            console.log(`No 'openapi' env var and no project ID, using 'default' key`);
          }
        }
      } catch (error) {
        console.warn('Failed to get openapi env var:', error);
        // Fall back to project ID from event if available
        if (event.projectId) {
          newProjectKey = event.projectId;
          console.log(`Using project ID as fallback: ${event.projectId}`);
        } else {
          newProjectKey = 'default';
          console.log(`Using 'default' as fallback`);
        }
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
  
  // Wait for the project change event to fire to get the initial project ID
  // This ensures we have the actual project ID from the event
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // If currentProjectId is still not set (event didn't fire or didn't have projectId),
  // try to get project key using getProjectKey (which checks openapi env var first)
  if (!currentProjectId.value || currentProjectId.value === 'default') {
    const initialProjectKey = await getProjectKey();
    currentProjectId.value = initialProjectKey;
  }
  
  // Load global settings first
  try {
    await loadGlobalSettings();
  } catch (error) {
    console.error('Error loading global settings:', error);
    // Continue anyway
  }
  
  // Load sessions from storage (using the project key determined above)
  try {
    await loadSessionsFromStorage();
  } catch (error) {
    console.error('Error loading sessions from storage:', error);
    // Ensure we have at least one session to prevent UI from breaking
    if (!sessions.value || sessions.value.length === 0) {
      try {
        const newSession = createNewSession();
        sessions.value = [newSession];
        currentSessionId.value = newSession.id;
      } catch (fallbackError) {
        console.error('Critical error creating fallback session:', fallbackError);
      }
    }
  }
  
  // Then load results (this will be session-specific)
  try {
    loadResultsFromStorage();
  } catch (error) {
    console.error('Error loading results from storage:', error);
    // Continue anyway
  }
  
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


//###################################
// debug db
//###################################
const showDatabaseContents = async () => {
  try {
   await sdk.backend.logDatabaseContents();
  } catch (error) {
    console.error('Error showing database contents:', error);
  }
};

//###################################
// Global Settings Management
//###################################
const loadGlobalSettings = async () => {
  try {
    const result = await sdk.backend.loadGlobalSettingsFromDb();
    if (result.kind === "Ok") {
      const settings = result.value;
      if (settings.workers !== undefined) workers.value = settings.workers;
      if (settings.delayBetweenRequests !== undefined) delayBetweenRequests.value = settings.delayBetweenRequests;
      if (settings.timeout !== undefined) timeout.value = settings.timeout;
      if (settings.allowDeleteInAllMethods !== undefined) allowDeleteInAllMethods.value = settings.allowDeleteInAllMethods;
      if (settings.defaultPlaceholders) {
        defaultPlaceholders.value = { ...defaultPlaceholders.value, ...settings.defaultPlaceholders };
      }
    }
  } catch (error) {
    console.error('Failed to load global settings:', error);
  }
};

const saveGlobalSettings = async () => {
  try {
    const settings = {
      workers: workers.value,
      delayBetweenRequests: delayBetweenRequests.value,
      timeout: timeout.value,
      allowDeleteInAllMethods: allowDeleteInAllMethods.value,
      defaultPlaceholders: defaultPlaceholders.value
    };
    const result = await sdk.backend.saveGlobalSettingsToDb(settings);
    if (result.kind === "Error") {
      console.error('Failed to save global settings:', result.error);
    }
  } catch (error) {
    console.error('Failed to save global settings:', error);
  }
};

const updatePlaceholder = (key: string, value: any) => {
  if (key in defaultPlaceholders.value) {
    (defaultPlaceholders.value as any)[key] = value;
    saveGlobalSettings();
  }
};

const resetPlaceholders = () => {
  defaultPlaceholders.value = {
    string: 'string',
    integer: 0,
    number: 0,
    boolean: true,
    email: 'user@example.com',
    date: '2023-01-01',
    dateTime: '2023-01-01T00:00:00Z',
    uuid: '123e4567-e89b-12d3-a456-426614174000'
  };
  saveGlobalSettings();
};


//###################################
// Global Settings Management
//###################################


//###################################
// debug db
//###################################

//###################################
// Migration function
//###################################
const migrateLocalStorageToDb = async () => {
  try {
    const sessionsData: Record<string, any[]> = {};
    let testResultsData: any = null;
    const migratedProjectKeys: string[] = [];
    
    // Collect all session data from localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('openapi-sessions-')) {
          const value = localStorage.getItem(key);
          if (value) {
            try {
              const parsed = JSON.parse(value);
              if (Array.isArray(parsed) && parsed.length > 0) {
                sessionsData[key] = parsed;
                // Extract project key from localStorage key (format: openapi-sessions-{projectKey})
                const projectKey = key.replace('openapi-sessions-', '');
                if (projectKey && !migratedProjectKeys.includes(projectKey)) {
                  migratedProjectKeys.push(projectKey);
                }
              }
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
      console.log(`Migrated project keys: ${migratedProjectKeys.join(', ')}`);
      
      // After migration, try to load sessions using the current project key logic
      // If that fails, try loading from the first migrated project key
      let loaded = false;
      
      try {
        await loadSessionsFromStorage();
        // Check if we actually loaded any sessions
        if (sessions.value && sessions.value.length > 0) {
          loaded = true;
          console.log('Successfully loaded sessions after migration using current project key');
        }
      } catch (loadError) {
        console.error('Failed to load sessions with current project key:', loadError);
      }
      
      // If we didn't load any sessions, try loading from the first migrated project key
      if (!loaded && migratedProjectKeys.length > 0) {
        console.log(`Trying to load sessions from first migrated project key: ${migratedProjectKeys[0]}`);
        try {
          const loadResult = await sdk.backend.loadSessionsFromDb(migratedProjectKeys[0]);
          if (loadResult.kind === "Ok" && loadResult.value && Array.isArray(loadResult.value) && loadResult.value.length > 0) {
            // Update currentProjectId to match the migrated project key
            currentProjectId.value = migratedProjectKeys[0];
            // Load the sessions
            sessions.value = loadResult.value.map(session => ({
              ...session,
              expandedResults: new Set(session.expandedResults || []),
              expandedTestCases: new Set(session.expandedTestCases || [])
            }));
            // Load the first session
            if (sessions.value.length > 0) {
              await loadSession(sessions.value[0].id);
              loaded = true;
              console.log(`Successfully loaded ${sessions.value.length} sessions from migrated project key: ${migratedProjectKeys[0]}`);
            }
          }
        } catch (fallbackError) {
          console.error('Failed to load sessions from migrated project key:', fallbackError);
        }
      }
      
      // If still no sessions loaded, create a new one
      if (!loaded) {
        console.log('No sessions found after migration, creating new session');
        const newSession = createNewSession();
        sessions.value = [newSession];
        await loadSession(newSession.id);
      }
      
      // Reload test results from database after migration
      await loadResultsFromStorage();
      
      // Update migration status check - hide the button now
      await checkMigrationStatus();
      
      alert(`Migration complete!\n${result.value.sessionsMigrated} sessions migrated\nTest results: ${result.value.testResultsMigrated ? 'Migrated' : 'Not found'}`);
    } else {
      console.error('Migration failed:', result.error);
      alert(`Migration failed: ${result.error}`);
    }
  } catch (error) {
    console.error('Migration error:', error);
    alert(`Migration error: ${error instanceof Error ? error.message : String(error)}`);
    // Even if migration fails, try to ensure UI doesn't break
    try {
      await loadSessionsFromStorage();
    } catch (loadError) {
      console.error('Failed to reload sessions after migration error:', loadError);
      // Create a new session as last resort
      const newSession = createNewSession();
      sessions.value = [newSession];
      await loadSession(newSession.id);
    }
  }
};

// Check if localStorage has data to migrate
const hasLocalStorageData = ref(false);

// Check migration status on mount
const checkMigrationStatus = async () => {
  try {
    console.log('Checking migration status...');
    
    // Check if the function exists and is callable (in case extension needs reload)
    // Use try-catch to safely check if the function exists
    let hasMigrationFunction = false;
    try {
      // Use optional chaining and safe property access
      if (sdk?.backend && 'isMigrationCompleted' in sdk.backend) {
        const func = (sdk.backend as any).isMigrationCompleted;
        hasMigrationFunction = typeof func === 'function';
      }
    } catch (checkError) {
      console.warn('Error checking if isMigrationCompleted exists:', checkError);
      hasMigrationFunction = false;
    }
    
    if (!hasMigrationFunction) {
      console.warn('isMigrationCompleted function not available, using workaround');
      // Workaround: Check if sessions exist in database (if they do, migration likely completed)
      try {
        // Try to get project keys - if this works and we have sessions in DB, migration likely done
        if (sdk.backend.getAllSessionProjectKeys && typeof sdk.backend.getAllSessionProjectKeys === 'function') {
          const keysResult = await sdk.backend.getAllSessionProjectKeys();
          if (keysResult.kind === "Ok" && keysResult.value && keysResult.value.length > 0) {
            // We have sessions in database, check if we can load them
            // If we can load sessions, assume migration was done
            const projectKey = await getProjectKey();
            if (sdk.backend.loadSessionsFromDb && typeof sdk.backend.loadSessionsFromDb === 'function') {
              const sessionsResult = await sdk.backend.loadSessionsFromDb(projectKey);
              if (sessionsResult.kind === "Ok" && sessionsResult.value && sessionsResult.value.length > 0) {
                console.log('Found sessions in database, assuming migration completed');
                hasLocalStorageData.value = false;
                return;
              }
            }
          }
        }
        // No sessions in DB, check localStorage
        const hasData = localStorage.getItem('openapi-testing-results') !== null;
        hasLocalStorageData.value = hasData;
        return;
      } catch (workaroundError) {
        console.error('Workaround check failed:', workaroundError);
        // Final fallback: check localStorage only
        try {
          const hasData = localStorage.getItem('openapi-testing-results') !== null;
          hasLocalStorageData.value = hasData;
        } catch {
          hasLocalStorageData.value = false;
        }
        return;
      }
    }
    
    // Function is available, use it
    try {
      const migrationCheck = await sdk.backend.isMigrationCompleted();
      console.log('Migration check result:', migrationCheck);
      
      if (migrationCheck.kind === "Ok" && migrationCheck.value === true) {
        // Migration already done, don't show button even if localStorage has data
        console.log('Migration already completed, hiding button');
        hasLocalStorageData.value = false;
        return;
      }
      
      // Migration not done, check if localStorage has data
      try {
        const hasData = localStorage.getItem('openapi-testing-results') !== null;
        console.log('Migration not completed, localStorage has data:', hasData);
        hasLocalStorageData.value = hasData;
      } catch {
        hasLocalStorageData.value = false;
      }
    } catch (funcError) {
      console.error('Error calling isMigrationCompleted:', funcError);
      // Fallback to workaround
      try {
        if (sdk.backend.getAllSessionProjectKeys && typeof sdk.backend.getAllSessionProjectKeys === 'function') {
          const keysResult = await sdk.backend.getAllSessionProjectKeys();
          if (keysResult.kind === "Ok" && keysResult.value && keysResult.value.length > 0) {
            const projectKey = await getProjectKey();
            if (sdk.backend.loadSessionsFromDb && typeof sdk.backend.loadSessionsFromDb === 'function') {
              const sessionsResult = await sdk.backend.loadSessionsFromDb(projectKey);
              if (sessionsResult.kind === "Ok" && sessionsResult.value && sessionsResult.value.length > 0) {
                console.log('Found sessions in database, assuming migration completed');
                hasLocalStorageData.value = false;
                return;
              }
            }
          }
        }
        const hasData = localStorage.getItem('openapi-testing-results') !== null;
        hasLocalStorageData.value = hasData;
      } catch {
        hasLocalStorageData.value = false;
      }
    }
  } catch (error) {
    console.error('Failed to check migration status:', error);
    // Final fallback: check localStorage directly
    try {
      const hasData = localStorage.getItem('openapi-testing-results') !== null;
      hasLocalStorageData.value = hasData;
    } catch {
      hasLocalStorageData.value = false;
    }
  }
};

//###################################
// Migration function
//###################################

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
        <!-- <button @click="showDatabaseContents" class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-md border border-blue-200 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-700 transition-colors duration-200 cursor-pointer" title="Show database contents in Caido console">
          <i class="pi pi-list text-sm"></i>Show DB Contents
        </button> -->
        <button @click="showSettingsDialog = true" class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-purple-600 hover:text-purple-700 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-md border border-purple-200 dark:border-purple-800 hover:border-purple-300 dark:hover:border-purple-700 transition-colors duration-200 cursor-pointer" title="Open Settings">
          <i class="pi pi-cog text-sm"></i>Settings
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
              <InputTab 
                :baseUrl="baseUrl"
                :schemaText="schemaText"
                :validationResult="validationResult"
                :inputMode="inputMode"
                :rawEndpoints="rawEndpoints"
                @update:baseUrl="baseUrl = $event"
                @update:schemaText="schemaText = $event"
                @update:inputMode="inputMode = $event"
                @update:rawEndpoints="rawEndpoints = $event"
                @validate="validateSchema"
                @loadSchema="loadSchema"
                @loadRawEndpoints="loadRawEndpoints"
              />
            </TabPanel>
            <TabPanel header="Endpoints">
              <EndpointsTab
                :isSchemaLoaded="isSchemaLoaded"
                :baseUrl="baseUrl"
                :customHeaders="customHeaders"
                :useRandomValues="useRandomValues"
                :isLoading="isLoading"
                :runningTests="runningTests"
                :endpointSearchQuery="endpointSearchQuery"
                :displayTestCases="displayTestCases"
                :testCasePathVariableValues="testCasePathVariableValues"
                :testCaseQueryParameterValues="testCaseQueryParameterValues"
                :testCaseBodyVariableValues="testCaseBodyVariableValues"
                :isTestCaseExpanded="isTestCaseExpanded"
                :isTestRunning="isTestRunning"
                :getTestStatus="getTestStatus"
                :getStatusClass="getStatusClass"
                :getStatusIcon="getStatusIcon"
                :getTestCaseId="getTestCaseId"
                @update:baseUrl="baseUrl = $event"
                @update:customHeaders="customHeaders = $event"
                @update:useRandomValues="useRandomValues = $event"
                @update:endpointSearchQuery="endpointSearchQuery = $event"
                @runAllTests="runAllTests"
                @stopAllTests="stopAllTests"
                @toggleTestCaseExpansion="toggleTestCaseExpansion"
                @runSingleTest="runSingleTest"
                @runAllMethods="runAllMethods"
                @clearEndpointSearch="clearEndpointSearch"
                @updateTestCasePathVariable="(tc, v, val) => { if (!testCasePathVariableValues[getTestCaseId(tc)]) testCasePathVariableValues[getTestCaseId(tc)] = {}; testCasePathVariableValues[getTestCaseId(tc)][v] = val; }"
                @updateTestCaseQueryParameter="(tc, p, val) => { if (!testCaseQueryParameterValues[getTestCaseId(tc)]) testCaseQueryParameterValues[getTestCaseId(tc)] = {}; testCaseQueryParameterValues[getTestCaseId(tc)][p] = val; }"
                @updateTestCaseBodyVariable="(tc, k, val) => { if (!testCaseBodyVariableValues[getTestCaseId(tc)]) testCaseBodyVariableValues[getTestCaseId(tc)] = {}; testCaseBodyVariableValues[getTestCaseId(tc)][k] = val; }"
              />
            </TabPanel>
            <TabPanel v-if="!isRawMode" header="Definition">
              <DefinitionTab
                :parsedSchema="parsedSchema"
                :formatSchemaType="formatSchemaType"
                :formatExampleValue="formatExampleValue"
                :getMethodColor="getMethodColor"
                :isPathExpanded="isPathExpanded"
                :isComponentExpanded="isComponentExpanded"
                @togglePathExpansion="togglePathExpansion"
                @toggleComponentExpansion="toggleComponentExpansion"
              />
            </TabPanel>
            <TabPanel header="Results">
              <ResultsTab
                :hasResults="hasResults"
                :isQueryActive="isQueryActive"
                :filteredTestResults="filteredTestResults"
                :allTestResults="allTestResults"
                :getResultId="getResultId"
                :isResultExpanded="isResultExpanded"
                :getStatusClass="getStatusClass"
                :getStatusIcon="getStatusIcon"
                :formatResponseTime="formatResponseTime"
                :getResponseSize="getResponseSize"
                :setRequestEditorContainer="setRequestEditorContainer"
                :setResponseEditorContainer="setResponseEditorContainer"
                @clearAllResults="clearAllResults"
                @toggleResultExpansion="toggleResultExpansion"
              />
            </TabPanel>
          </TabView>
        </div>
      </div>
      <div v-if="isSchemaLoaded && (getUniquePathVariables().length > 0 || getUniqueQueryParameters().length > 0 || Object.keys(bodyVariableValues).length > 0)" :class="['w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-lg transition-all duration-300 ease-in-out overflow-y-auto', sidebarOpen ? 'translate-x-0' : 'translate-x-full']">
        <div class="p-4">
          <div class="mb-4"><h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">Global Variables</h3></div>
          <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div class="mb-3"><h4 class="text-md font-medium text-gray-700 dark:text-gray-300">Path Variables</h4><p class="text-xs text-gray-500 mt-1">Add multiple values to test different combinations. Each value will be tested separately.</p></div>
            <div class="space-y-3">
              <div v-for="variable in getUniquePathVariables()" :key="variable" class="space-y-2">
                <div class="flex items-center justify-between"><label class="block text-sm font-medium text-gray-700 dark:text-gray-300">{{ variable }}</label><Button label="Add Value" icon="pi pi-plus" @click="addPathVariableValue(variable)" size="small" severity="success" class="text-xs px-2 py-1" /></div>
                <div class="space-y-2">
                  <div v-for="(value, index) in getPathVariableValue(variable)" :key="index" class="flex items-center gap-2">
                    <InputText :modelValue="(pathVariableValues[variable] && pathVariableValues[variable][index]) || ''" @update:modelValue="(val) => { if (!pathVariableValues[variable]) pathVariableValues[variable] = []; pathVariableValues[variable][index] = val; }" :placeholder="`Value ${index + 1} for ${variable}`" class="flex-1" @paste="handlePathVariablePaste(variable, $event)" />
                    <Button v-if="getPathVariableValue(variable).length > 1" label="Remove" icon="pi pi-trash" @click="removePathVariableValue(variable, index)" size="small" severity="danger" class="text-xs px-2 py-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="getUniqueQueryParameters().length > 0" class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div class="mb-3"><h4 class="text-md font-medium text-gray-700 dark:text-gray-300">Query Parameters</h4><p class="text-xs text-gray-500 mt-1">Add multiple values to test different combinations. Each value will be tested separately.</p></div>
            <div class="space-y-3">
              <div v-for="param in getUniqueQueryParameters()" :key="param" class="space-y-2">
                <div class="flex items-center justify-between"><label class="block text-sm font-medium text-gray-700 dark:text-gray-300">{{ param }}</label><Button label="Add Value" icon="pi pi-plus" @click="addQueryParameterValue(param)" size="small" severity="success" class="text-xs px-2 py-1" /></div>
                <div class="space-y-2">
                  <div v-for="(value, index) in getQueryParameterValue(param)" :key="index" class="flex items-center gap-2">
                    <InputText :modelValue="(queryParameterValues[param] && queryParameterValues[param][index]) || ''" @update:modelValue="(val) => { if (!queryParameterValues[param]) queryParameterValues[param] = []; queryParameterValues[param][index] = val; }" :placeholder="`Value ${index + 1} for ${param}`" class="flex-1" @paste="handleQueryParameterPaste(param, $event)" />
                    <Button v-if="getQueryParameterValue(param).length > 1" label="Remove" icon="pi pi-trash" @click="removeQueryParameterValue(param, index)" size="small" severity="danger" class="text-xs px-2 py-1" />
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
                    <InputText :modelValue="(bodyVariableValues[key] && bodyVariableValues[key][index]) || ''" @update:modelValue="(val) => { if (!bodyVariableValues[key]) bodyVariableValues[key] = []; bodyVariableValues[key][index] = val; }" :placeholder="`Value ${index + 1} for ${key}`" class="flex-1" @paste="handleBodyVariablePaste(key, $event)" />
                    <Button v-if="getBodyVariableValue(key).length > 1" label="Remove" icon="pi pi-trash" @click="removeBodyVariableValue(key, index)" size="small" severity="danger" class="text-xs px-2 py-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Settings Dialog -->
    <Dialog v-model:visible="showSettingsDialog" modal header="Settings" :style="{ width: '800px' }" :draggable="false">
      <SettingsTab
        :workers="workers"
        :delayBetweenRequests="delayBetweenRequests"
        :timeout="timeout"
        :allowDeleteInAllMethods="allowDeleteInAllMethods"
        :defaultPlaceholders="defaultPlaceholders"
        @update:workers="(v) => { workers = v; saveGlobalSettings(); }"
        @update:delayBetweenRequests="(v) => { delayBetweenRequests = v; saveGlobalSettings(); }"
        @update:timeout="(v) => { timeout = v; saveGlobalSettings(); }"
        @update:allowDeleteInAllMethods="(v) => { allowDeleteInAllMethods = v; saveGlobalSettings(); }"
        @update:placeholder="updatePlaceholder"
        @resetPlaceholders="resetPlaceholders"
      />
    </Dialog>
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
