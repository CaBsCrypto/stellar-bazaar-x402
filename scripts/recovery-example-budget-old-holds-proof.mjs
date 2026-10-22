// Pure comparison of root-owned read-only observations. No secret/file/network access.
import {createHash} from 'node:crypto';
const names=['public','authenticated','recovery','background'];
const fail=code=>{throw Error(code);};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...fields].sort().join(',');
const safe=value=>Number.isSafeInteger(value)&&value>=0;
function counter(value){return exact(value,names)&&names.every(name=>safe(value[name]));}
function validate(snapshot){
 if(!exact(snapshot,['version','role','namespaceFingerprint','configurationId','ledgerVersion','observedAt','committedCommands','committedTransferBytes','heldCommands','heldTransferBytes','heldFingerprint','holdCount','readOnly','readRequests'])||snapshot.version!==1||!['production','previous-example-preview'].includes(snapshot.role)||!['namespaceFingerprint','configurationId','heldFingerprint'].every(name=>/^[a-f0-9]{64}$/.test(snapshot[name]??''))||![1,2].includes(snapshot.ledgerVersion)||!Number.isFinite(Date.parse(snapshot.observedAt))||!counter(snapshot.committedCommands)||!counter(snapshot.heldCommands)||!safe(snapshot.committedTransferBytes)||!safe(snapshot.heldTransferBytes)||!safe(snapshot.holdCount)||snapshot.readOnly!==true||snapshot.readRequests!==1)fail('EXACT_READ_ONLY_OLD_LEDGER_OBSERVATION_REQUIRED');
 return snapshot;
}
export function verifyOldExampleHoldPair(before,after){
 validate(before);validate(after);
 if(before.role!==after.role||before.namespaceFingerprint!==after.namespaceFingerprint||before.configurationId!==after.configurationId||before.ledgerVersion!==after.ledgerVersion||Date.parse(after.observedAt)<Date.parse(before.observedAt)||after.heldFingerprint!==before.heldFingerprint||after.heldTransferBytes!==before.heldTransferBytes||after.holdCount!==before.holdCount||names.some(name=>after.heldCommands[name]!==before.heldCommands[name]))fail('OLD_PENDING_HOLD_CHANGED');
 if(after.committedTransferBytes<before.committedTransferBytes||names.some(name=>after.committedCommands[name]<before.committedCommands[name]))fail('OLD_CONSUMPTION_WAS_RESET_OR_REDUCED');
 return {role:before.role,namespaceFingerprint:before.namespaceFingerprint,configurationId:before.configurationId,holdCount:before.holdCount,heldFingerprint:before.heldFingerprint,heldCommands:before.heldCommands,heldTransferBytes:before.heldTransferBytes,holdsConservedExactly:true,consumptionConservedMonotonically:true,committedGrowth:{commands:Object.fromEntries(names.map(name=>[name,after.committedCommands[name]-before.committedCommands[name]])),transferBytes:after.committedTransferBytes-before.committedTransferBytes},beforeSha256:hash(before),afterSha256:hash(after)};
}
export function verifyOldExampleHolds(before,after){
 if(!Array.isArray(before)||!Array.isArray(after)||before.length!==2||after.length!==2)fail('TWO_ROOT_OWNED_OLD_LEDGER_OBSERVATIONS_REQUIRED');
 const roles=['production','previous-example-preview'],pairs=roles.map(role=>{const a=before.filter(row=>row.role===role),b=after.filter(row=>row.role===role);if(a.length!==1||b.length!==1)fail('DISTINCT_OLD_LEDGER_ROLES_REQUIRED');return verifyOldExampleHoldPair(a[0],b[0]);});
 if(pairs[0].namespaceFingerprint===pairs[1].namespaceFingerprint)fail('DISTINCT_OLD_LEDGER_NAMESPACES_REQUIRED');
 return {status:'PASS_ROOT_OBSERVED_OLD_HOLDS_AND_CONSUMPTION_CONSERVED',pairs,networkRequests:0,credentialReads:0,ledgerWrites:0,payments:0,limitations:['This comparator proves preservation only for the supplied root-owned read-only observations. It does not fetch or independently authenticate a ledger.','Monotonic consumption is checked over the short validation interval; a legitimate rolling-window expiry requires a separate review.']};
}
