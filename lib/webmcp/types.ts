export interface WebMCPToolProperty {
  type: "string" | "number" | "boolean" | "object" | "array" | "integer";
  description?: string;
  enum?: string[];
  items?: WebMCPToolProperty;
  properties?: Record<string, WebMCPToolProperty>;
  required?: string[];
  default?: unknown;
}

export interface WebMCPInputSchema {
  type: "object";
  properties?: Record<string, WebMCPToolProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface WebMCPToolExecutionResult {
  type?: "text" | "json" | "image";
  text?: string;
  data?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

export type WebMCPToolExecuteHandler<T = Record<string, unknown>> = (
  input: T
) => Promise<WebMCPToolExecutionResult | unknown> | WebMCPToolExecutionResult | unknown;

export interface WebMCPToolDefinition<T = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema?: WebMCPInputSchema;
  execute: WebMCPToolExecuteHandler<T>;
}

export interface ModelContextRegistry {
  registerTool: (tool: WebMCPToolDefinition) => void;
  unregisterTool?: (name: string) => boolean;
  getTools?: () => WebMCPToolDefinition[];
  provideContext?: (context: { tools?: WebMCPToolDefinition[] }) => void;
}

export interface AgentPolicyConfig {
  enabled: boolean;
  maxBudgetPerCall: number; // e.g. 0.5 USDC
  allowedAssets: string[]; // e.g. ["USDC", "XLM"]
  allowedNetworks: string[]; // e.g. ["stellar:testnet"]
  requireProofOfDelivery: boolean;
}

export interface WebMCPActivityLog {
  id: string;
  timestamp: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  durationMs: number;
  status: "success" | "error";
  error?: string;
  policyCheck?: {
    passed: boolean;
    reason?: string;
  };
}

declare global {
  interface Navigator {
    modelContext?: ModelContextRegistry;
  }
  interface Document {
    modelContext?: ModelContextRegistry;
  }
  interface Window {
    modelContext?: ModelContextRegistry;
    __WEBMCP_EMULATOR__?: {
      tools: Map<string, WebMCPToolDefinition>;
      executeTool: (name: string, input: Record<string, unknown>) => Promise<unknown>;
      listTools: () => Array<{ name: string; description: string; inputSchema?: WebMCPInputSchema }>;
      getActivityLogs: () => WebMCPActivityLog[];
      onActivityLog?: (log: WebMCPActivityLog) => void;
    };
  }
}
