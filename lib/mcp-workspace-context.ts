import { POST as createWorkspace } from "../app/api/workspaces/route";
import { GET as tasks, POST as claim } from "../app/api/agent-tasks/route";
import { POST as respond } from "../app/api/agent-tasks/[id]/response/route";
import { POST as recordOperation } from "../app/api/operations/route";
import { POST as recordActivity } from "../app/api/activity/route";

// Native handlers remain the sole permission, validation and persistence boundary.
export function workspaceMcpContext(incoming: Request) {
  function request(path: string, body?: unknown) {
    const headers = new Headers();
    for (const name of ["authorization", "origin", "host", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port", "forwarded", "x-vercel-forwarded-for"]) {
      const value = incoming.headers.get(name); if (value !== null) headers.set(name, value);
    }
    const json = body === undefined ? undefined : JSON.stringify(body);
    if (json !== undefined) { headers.set("content-type","application/json"); headers.set("content-length",String(Buffer.byteLength(json))); }
    return new Request(new URL(path,incoming.url), { method: json===undefined ? "GET" : "POST", headers, ...(json===undefined ? {} : {body:json}) });
  }
  async function envelope(response: Response) {
    const wait=response.headers.get("retry-after");
    return {ok:response.ok,status:response.status,body:await response.json(),...(wait&&/^\d+$/.test(wait)?{retryAfter:Number(wait)}:{})};
  }
  return {
    create: async (body: unknown) => envelope(await createWorkspace(request('/api/workspaces',body))),
    listTasks: async () => envelope(await tasks(request('/api/agent-tasks'))),
    claim: async (body: unknown) => envelope(await claim(request('/api/agent-tasks',body))),
    respond: async (taskId: string,body:unknown) => envelope(await respond(request(`/api/agent-tasks/${encodeURIComponent(taskId)}/response`,body),{params:Promise.resolve({id:taskId})})),
    recordOperation: async (body:unknown) => envelope(await recordOperation(request('/api/operations',body))),
    recordActivity: async (body:unknown) => envelope(await recordActivity(request('/api/activity',body))),
  };
}
