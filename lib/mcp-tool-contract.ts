// Public contract; safe to import from docs, tests and server code.
export const MCP_VERSION = "0.8.0";
export const MCP_TOOLS = [
  "get_bazaar_capabilities", "list_services", "search_services", "get_service",
  "list_workflow_bundles", "get_workflow_bundle", "validate_service_card",
  "get_operation_history", "get_bazaar_skills", "submit_provider_request",
  "get_provider_request_status", "create_bazaar_workspace", "list_bazaar_agent_tasks",
  "claim_bazaar_agent_task", "respond_bazaar_agent_task", "record_bazaar_activity",
  "record_bazaar_operation",
  "list_market_services", "submit_market_service", "get_market_submission", "create_market_order", "get_market_order",
  "list_market_orders", "claim_market_order", "deliver_market_order", "fail_market_order", "uncertain_market_order",
] as const;
export const MCP_WRITES = [
  "submit_provider_request", "create_bazaar_workspace", "claim_bazaar_agent_task",
  "respond_bazaar_agent_task", "record_bazaar_activity", "record_bazaar_operation",
  "submit_market_service", "create_market_order", "claim_market_order", "deliver_market_order", "fail_market_order", "uncertain_market_order",
] as const;
export const MCP_MODE = "discovery-and-private-marketplace";
