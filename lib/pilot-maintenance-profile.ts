import {pilotReviewProfile} from './pilot-review-transport.ts';
import {WorkspaceError} from './workspace-types.ts';
export const PILOT_WORKSPACE_WIRE_BYTES=4*1048576;
// The same four capacity controls and three identity checks remain protected.
// Recompute their forecast using the already proved prices; keep the actual
// public floor at 46,964,736 bytes for both old and newly admitted holds.
export const PILOT_WORKSPACE_ADMISSION_FORECAST_BYTES=42475520;
export function workspaceMaintenanceProfile(){const value=process.env.BAZAAR_PILOT_MAINTENANCE_TRANSPORT;if(value===undefined)return false;if(value!=='workspace-v1'||!pilotReviewProfile())throw new WorkspaceError('PILOT_MAINTENANCE_PROFILE_UNAVAILABLE',503);return true;}
