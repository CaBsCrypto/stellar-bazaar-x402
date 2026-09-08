export const historyConnection = {
  version: "bazaar.history-connection/v1",
  humanView: "/history",
  eventsEndpoint: "/api/activity",
  purchasesEndpoint: "/api/operations",
  guide: "/HISTORY_CONNECTION.md",
  instructions: [
    "The operator assigns separate read and write access for one owner. Keep credentials out of prompts and tool arguments.",
    "Configure the buyer client with history.writeToken, agentId, taskId, taskTitle and includeResult:true to preserve supported results for the human.",
    "Use a new taskId for each task. Call finishTask() only after all its operations finish. Use the same taskId for browser and external activity when they belong to the same task.",
    "A native browser can connect privately at /history using its write access. Private tools bypass the public emulator. External execution must use the integrated client or report events and purchases via authenticated HTTP.",
    "Discovery alone does not enable payments or automatically record external actions. Browser tools perform only their existing bounded reference/recovery behavior.",
    "Keep eventId and clientOperationId stable when retrying journal writes. Never repeat a payment because history is unavailable.",
    "Payment reports are not independent ledger verification. A transfer alone cannot recover a purchased result. No human approval per purchase is introduced.",
  ],
};
