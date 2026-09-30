import { channel } from 'node:diagnostics_channel';
// Test-only listener: never serializes errors, paths, credentials or document bodies.
if(process.env.BAZAAR_WORKSPACE_FILE_DIAGNOSTICS_TEST==='1')channel('bazaar.workspace.file').subscribe(message=>{
  const {phase,code}=message;
  if(typeof phase==='string'&&/^[a-z-]{1,50}$/.test(phase)&&typeof code==='string'&&/^[A-Z]{1,20}$/.test(code))process.stderr.write(JSON.stringify({workspaceFileDiagnostic:{phase,code}})+'\n');
});
