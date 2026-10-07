import { measuredHandler } from '../../../../lib/acceptance-meter.ts';
import { assertMarketEnabled, marketOperator } from '../../../../lib/marketplace.ts';
import { assertWorkspaceRequest, parseWorkspaceBody, workspaceFailure, workspaceHeaders } from '../../../../lib/workspace-http.ts';
import { configuredOperationalBudgetStore, operationalCheckpointSchema, operationalBudgetEnabled } from '../../../../lib/operational-budget.ts';
import { WorkspaceError } from '../../../../lib/workspace-types.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
let operatorMinute = -1, operatorCount = 0;
function authorize(request: Request) {
  assertMarketEnabled(); assertWorkspaceRequest(request); marketOperator(request.headers.get('authorization'));
  if (!operationalBudgetEnabled()) throw new WorkspaceError('OPERATIONAL_BUDGET_DISABLED');
  // A per-process backstop. The project WAF supplies the global, pre-function limit.
  const minute = Math.floor(Date.now() / 60000);
  if (minute < operatorMinute) throw new WorkspaceError('OPERATIONAL_BUDGET_UNAVAILABLE');
  if (minute !== operatorMinute) { operatorMinute = minute; operatorCount = 0; }
  if (operatorCount >= 20) throw new WorkspaceError('OPERATOR_RATE_LIMIT', 429, 60 - Math.floor(Date.now() / 1000) % 60);
  operatorCount++;
}
export const GET = measuredHandler(async (request: Request) => {
  try { authorize(request); return Response.json(await configuredOperationalBudgetStore().read(), { headers: workspaceHeaders }); }
  catch (error) { return workspaceFailure(error); }
}, { budget: false });
export const POST = measuredHandler(async (request: Request) => {
  try { authorize(request); const checkpoint = await parseWorkspaceBody(request, operationalCheckpointSchema, 8192); return Response.json(await configuredOperationalBudgetStore().refresh(checkpoint), { headers: workspaceHeaders }); }
  catch (error) { return workspaceFailure(error); }
}, { budget: false });
