import { type Caido } from "@caido/sdk-frontend";
import { type API } from "backend";

export interface FrontendSDK {
  navigation: {
    addPage: (path: string, config: { body: HTMLElement }) => void;
  };
  sidebar: {
    registerItem: (name: string, path: string) => void;
  };
  projects: {
    onCurrentProjectChange: (callback: (event: { projectId: string | undefined }) => void) => { stop: () => void };
  };
  backend: {
    parseOpenAPISchema: (schemaText: string) => Promise<any>;
    generateTestCases: (schema: any) => Promise<any[]>;
    executeTest: (testCase: any, options: any, pathVariableValues?: any) => Promise<any>;
    runAllTests: (schema: any, baseUrl: string, options?: any, pathVariableValues?: any) => Promise<any[]>;
    runSpecificTests: (schema: any, baseUrl: string, testNames: string[]) => Promise<any[]>;
    runSingleTest: (testCase: any, baseUrl: string, options?: any, pathVariableValues?: any, bodyVariableValues?: any, queryParameterValues?: any) => Promise<any>;
    validateSchema: (schemaText: string) => Promise<{ valid: boolean; errors: string[] }>;
    getSchemaInfo: (schemaText: string) => Promise<{ title: string; version: string; description?: string; pathCount: number; methodCount: number }>;
    testHttpRequest: (url: string) => Promise<{ success: boolean; status: number; response: string }>;
    openTestResultInCaido: (testResult: any, baseUrl: string) => Promise<void>;
    setEnvironmentVariable: (options: { name: string; value: string; secret?: boolean; global?: boolean }) => Promise<{ success: boolean; value?: string; error?: string }>;
    // Database storage functions
    saveSessionsToDb: (projectId: string, sessions: any[]) => Promise<{ kind: "Error"; error: string } | { kind: "Ok"; value: undefined }>;
    loadSessionsFromDb: (projectId: string) => Promise<{ kind: "Error"; error: string } | { kind: "Ok"; value: any[] }>;
    saveTestResultsToDb: (testResults: any) => Promise<{ kind: "Error"; error: string } | { kind: "Ok"; value: undefined }>;
    loadTestResultsFromDb: () => Promise<{ kind: "Error"; error: string } | { kind: "Ok"; value: any }>;
    saveGlobalSettingsToDb: (settings: any) => Promise<{ kind: "Error"; error: string } | { kind: "Ok"; value: undefined }>;
    loadGlobalSettingsFromDb: () => Promise<{ kind: "Error"; error: string } | { kind: "Ok"; value: any }>;
    // logDatabaseContents: () => Promise<{ kind: "Error"; error: string } | { kind: "Ok"; value: undefined }>; // Debug function - commented out
    migrateFromLocalStorage: (localStorageData: { sessions: Record<string, any[]>, testResults: any }) => Promise<{ kind: "Error"; error: string } | { kind: "Ok"; value: { sessionsMigrated: number; testResultsMigrated: boolean } }>;
    getAllSessionProjectKeys: () => Promise<{ kind: "Error"; error: string } | { kind: "Ok"; value: string[] }>;
    isMigrationCompleted: () => Promise<{ kind: "Error"; error: string } | { kind: "Ok"; value: boolean }>;
    // Session management
    createSession: (name: string, schema: any, configuration: any) => Promise<any>;
    getSession: (id: string) => Promise<any>;
    getAllSessions: () => Promise<any[]>;
    updateSession: (id: string, updates: any) => Promise<any>;
    deleteSession: (id: string) => Promise<boolean>;
    updateSessionTestCases: (id: string, testCases: any[]) => Promise<boolean>;
    updateSessionResults: (id: string, results: any[]) => Promise<boolean>;
    updateSessionConfiguration: (id: string, configuration: any) => Promise<boolean>;
  };
}

export interface Session {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  schema: any;
  testCases: any[];
  testResults: any[];
  configuration: {
    baseUrl: string;
    workers: number;
    delayBetweenRequests: number;
    timeout: number;
    customHeaders: string;
    useRandomValues: boolean;
    pathVariableValues: Record<string, string[]>;
  };
}

export interface SessionSummary {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  testCaseCount: number;
  resultCount: number;
  lastTestRun?: Date;
}
