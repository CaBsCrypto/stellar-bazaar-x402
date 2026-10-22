// Public local snapshot only; preserves every earlier review and receipt.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {verifyPrivateBootstrapArtifactsV4} from './recovery-example-production-private-bootstrap-v4.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
export async function prepareNopermReviewV4(){
 const previousPath='docs/release/recovery-example-private-bootstrap-v4-worker-acl-final-review-2026-10-13.json',previousRaw=await readFile(previousPath),previous=JSON.parse(previousRaw);
 const evidencePath='docs/evidence/recovery-example-private-bootstrap-v4-noperm-local-2026-10-13.json',evidenceRaw=await readFile(evidencePath),evidence=JSON.parse(evidenceRaw);
 if(sha(previousRaw)!=='4723213cfaede35c61721355b06f0b83befc9577cbce378ded84f212ea840016'||evidence.assertions!==294||evidence.results.length!==5||evidence.results.some(r=>!r.status.startsWith('PASS')))throw Error('NOPERM_DELTA_ANTECEDENT_AND_FIVE_REGRESSIONS_REQUIRED');
 const keys=Object.keys(previous.codeSha256),codeSha256=Object.fromEntries(keys.map(path=>[path,evidence.codeSha256[path]]));
 const changed=keys.filter(path=>previous.codeSha256[path]!==codeSha256[path]);if(JSON.stringify(changed)!==JSON.stringify(['scripts/recovery-example-production-private-bootstrap-v4.mjs']))throw Error('NOPERM_DELTA_ONLY_PRIVATE_BINDER_REQUIRED');
 for(const [path,expected]of Object.entries(evidence.codeSha256))if(sha(await readFile(path))!==expected)throw Error('NOPERM_DELTA_CODE_CHANGED');
 const value={...previous,createdAt:new Date().toISOString(),supersedes:previousPath,supersessionReason:'Private isolation proof now requires explicit NOPERM. Authentication failures and generic permission/access errors cannot authorize provider staging.',codeSha256,
 currentProductionBaseline:{source:'3c3fe5ad',deploymentId:'dpl_2kx2wwhZHpXSXeDQc96qCc83H3tY',unchangedByTheseTests:true},preparedProductionSource:previous.finalProductionSource,
 isolationResponseContract:{requiredShape:'Object with only the string error field',requiredPrefix:'NOPERM followed by a word boundary (case-insensitive)',rejected:['WRONGPASS','HTTP401 permission denied','Generic permission denied without NOPERM','Invalid access key without NOPERM'],uncertainBehavior:'Keep encrypted token and intent; no provider staging or automatic retry.'},
 antecedent:{review:previousPath,reviewSha256:sha(previousRaw),localEvidence:previous.evidence.localReceipt,localEvidenceSha256:previous.evidence.sha256,assertions:989,preserved:true},
 evidence:{...previous.evidence,localReceipt:evidencePath,sha256:sha(evidenceRaw),assertions:294,assertionCounting:'294 assertions from the five new private regressions only; antecedent989 and earlier runs are not added.',aclSafetyCases:['NOPERM403 completes the full injected bootstrap/staging','WRONGPASS rejects before staging with no retry','HTTP401 permission denied rejects before staging with no retry','Generic permission denied rejects before staging with no retry','Invalid access key rejects before staging with no retry']}};
 const verification=await verifyPrivateBootstrapArtifactsV4(value),target='docs/release/recovery-example-private-bootstrap-v4-noperm-review-2026-10-13.json';await writeFile(target,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 const lines=[
 '# Delta final: aislamiento exige NOPERM explícito',
 '',
 'La validación privada del proveedor acepta únicamente una respuesta con `error` cuyo código comienza en `NOPERM`. Rechaza `WRONGPASS`, HTTP 401 con permission denied, errores genéricos de permisos y claves de acceso inválidas. Todas esas ramas se detienen antes de staging y conservan el token cifrado y el intento, sin reintentar.',
 '',
 '**294 controles actuales PASS**, obtenidos en cinco regresiones privadas: un recorrido completo con NOPERM válido y cuatro errores rechazados. Se conservan la revisión 472 y sus 989 controles como antecedentes; no se suman ni se presentan como pruebas nuevas. Las funciones nativas son reales, pero las respuestas Redis/CLI y la encriptación de fixture siguen siendo sintéticas. Estos controles no acreditan ACL ni accesos reales de producción.',
 '',
 'El [nuevo contrato JSON](recovery-example-private-bootstrap-v4-noperm-review-2026-10-13.json) y la [evidencia del delta](../evidence/recovery-example-private-bootstrap-v4-noperm-local-2026-10-13.json) contienen los pins actualizados. Sólo cambió el binder privado. Se verificaron otra vez los 349 archivos congelados; no se creó ningún build ni candidato alojado.',
 '',
 '**Producción actual continúa en 3c3fe5ad**, deployment `dpl_2kx2wwhZHpXSXeDQc96qCc83H3tY`. `b6266def82f2962eae943c04a01f28f63f11c66279edb83da71c2709d91b875d` es el candidato Production **preparado**, todavía sin publicar. Preview y proveedor conservan sus fuentes congeladas. El límite privado de 9,9 GB sigue propuesto, sin aplicarse.',
 '',
 'Se conserva el contrato anterior: el issuer existente permanece sólo local bajo la guardia de cinco prefijos, sin afirmar ACL remoto5; el nuevo JWT del proveedor debe demostrar ACL remoto de únicamente sus dos prefijos y NOPERM sobre el ledger nativo antes del staging. La misma guardia mantiene 20 intercambios lógicos y carga 128 comandos/17.039.360 bytes; los once grupos nativos mantienen 180 comandos/108.789.760 bytes. No se crearon usuarios ACL, cuentas, secretos, despliegues ni pagos reales.',
 '',
 'La autorización conjunta y la aceptación real de accesos, ACL, dominio y producción siguen pendientes. La compra Testnet tendrá autorización separada. La revisión conjunta del coordinador no fue modificada.',
 ''
 ];await writeFile(target.replace(/json$/,'md'),lines.join('\n'),{flag:'wx'});
 return {reviewPath:target,reviewSha256:sha(await readFile(target)),evidencePath,evidenceSha256:sha(evidenceRaw),binderSha256:codeSha256['scripts/recovery-example-production-private-bootstrap-v4.mjs'],verifiedFiles:verification.verifiedFiles,currentAssertions:294,antecedentAssertionsNotAdded:989,networkRequests:0,productionChanged:false};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){if(process.argv[2]!=='prepare-local')throw Error('LOCAL_NOPERM_REVIEW_ACTION_REQUIRED');console.log(JSON.stringify(await prepareNopermReviewV4()));}
