import { mkdirSync, writeFileSync, realpathSync, existsSync, statSync, lstatSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const repo = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
export function verifyPrivateDirectory(path) {
  if (lstatSync(path).isSymbolicLink() || !statSync(path).isDirectory()) throw new Error('Private directory must not be a link');
  if (process.platform === 'win32') {
    const script = '$ErrorActionPreference="Stop"; $p=$env:BAZAAR_ACL_CHECK_PATH; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $a=Get-Acl -LiteralPath $p; if (!$a.AreAccessRulesProtected) {exit 2}; $r=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])); if ($r.Count -ne 1) {exit 3}; if ($r[0].IdentityReference.Value -ne $sid.Value -or $r[0].AccessControlType -ne "Allow" -or $r[0].IsInherited -or (($r[0].FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl) -or (($r[0].InheritanceFlags -band 3) -ne 3)) {exit 4}';
    execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], {env:{...Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|COMSPEC|PATHEXT)$/i.test(k))),BAZAAR_ACL_CHECK_PATH:path},stdio:'ignore'});
  } else {
    const info=statSync(path);
    if ((info.mode & 0o777) !== 0o700 || info.uid !== process.getuid()) throw new Error('Private directory permissions are not exclusive');
  }
}
export function preparePrivateDirectory(value) {
  const output=resolve(value), parent=realpathSync(dirname(output)), rel=relative(repo,parent);
  if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) throw new Error('Output must be outside the repository');
  if (existsSync(output)) throw new Error('Output already exists; refusing to overwrite');
  mkdirSync(output,{mode:0o700});
  if(process.platform === 'win32') {
    const sid=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{encoding:'utf8'}).trim();
    if(!/^S-1-[0-9-]+$/.test(sid)) throw new Error('Cannot determine operator SID');
    execFileSync('icacls.exe',[output,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`],{stdio:'ignore'});
  }
  verifyPrivateDirectory(output);
  return output;
}
export function savePrivatePair(output,credentials) {
  verifyPrivateDirectory(output);
  const {ownerId,readTokenHash,writeTokenHash}=credentials;
  for(const [name,value] of [['credentials.json',credentials],['account.json',{ownerId,readTokenHash,writeTokenHash}]]) writeFileSync(resolve(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
