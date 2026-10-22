"""Offline fixtures; no production proof is created by these tests."""
import copy
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("corrective_qr", ROOT / "scripts/validate-isolated-readiness-production-public.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
checks = 0


def check(value):
    global checks
    assert value
    checks += 1


def reject(e, ready):
    global checks
    try:
        m.validate_capture(e, ready)
    except ValueError:
        checks += 1
        return
    raise AssertionError("Expected exact capture rejection")


ready = {"status": "READY_READINESS_GUARD_FIX_PRODUCTION_PENDING_ACCEPTANCE", "sourceDigest": m.SOURCE, "planHash": m.PLAN, "canonicalOrigin": m.ORIGIN, "canonicalAssigned": True, "readyState": "READY", "target": "production", "generalPurchasesEnabled": False, "newPayments": 0, "deploymentId": "dpl_OfflineCorrective"}
ready.update({"supplementalReviewHash": m.SUPPLEMENT, "validationFamily": m.FAMILY, "validationPreviewPlanHash": m.PREVIEW_PLAN})
e = {"status": "PASS_CORRECTIVE_PUBLIC_DISCOVERY_QR_DECODE_PENDING", "sourceDigest": m.SOURCE, "correctiveReleasePlanHash": m.PLAN, "canonicalOrigin": m.ORIGIN, "deploymentId": ready["deploymentId"], "providerDeploymentId": m.PROVIDER, "anonymousClient": True, "protectionBypassUsed": False, "generalPurchasesEnabled": False, "publicProtectionPreserved": True, "privateAccountBindingPreserved": False, "requests": 12, "qr": {kind: {"path": m.QR_PATHS[kind], "expectedDestination": m.DESTINATIONS[kind], "sha256": "a" * 64, "independentlyDecoded": False} for kind in ["service", "general"]}}
e.update({"supplementalReviewHash": m.SUPPLEMENT, "validationFamily": m.FAMILY, "validationPreviewPlanHash": m.PREVIEW_PLAN})
for k in ["newAccounts", "newOrders", "newPayments", "signatures", "providerExecutions", "providerTicks", "readinessInvocations", "secretValuesInOutput", "ownerIdsInOutput"]:
    e[k] = 0
m.validate_capture(e, ready)
checks += 1
for k, value in [("sourceDigest", "034"), ("correctiveReleasePlanHash", "wrong"), ("deploymentId", m.OLD_BAZAAR), ("providerDeploymentId", "dpl_Other"), ("canonicalOrigin", "https://foreign.invalid"), ("requests", 13), ("anonymousClient", False), ("protectionBypassUsed", True), ("privateAccountBindingPreserved", True), ("newOrders", 1), ("newPayments", 1), ("signatures", 1), ("providerExecutions", 1)]:
    wrong = copy.deepcopy(e)
    wrong[k] = value
    reject(wrong, ready)
for k, value in [("sourceDigest", "034"), ("planHash", "wrong"), ("deploymentId", m.OLD_BAZAAR), ("canonicalAssigned", False), ("newPayments", 1), ("target", "preview")]:
    wrong = copy.deepcopy(ready)
    wrong[k] = value
    reject(e, wrong)
for kind in ["service", "general"]:
    for k, value in [("path", "old.svg"), ("expectedDestination", "https://foreign.invalid"), ("sha256", "bad"), ("independentlyDecoded", True)]:
        wrong = copy.deepcopy(e)
        wrong["qr"][kind][k] = value
        reject(wrong, ready)
check(m.canonical({"z": "prueba ñ", "a": 1}) == '{"a":1,"z":"prueba ñ"}'.encode("utf-8"))
# These are pre-existing public SVG fixtures with identical intended URLs;
# they test renderer/decoder compatibility, not a new deployment or capture.
decoder = m.load_decoder()
for kind in ["service", "general"]:
    raw = m.public_file("docs/evidence/on-demand-v3-production-" + kind + "-qr-2026-10-12.svg", 20000 if kind == "service" else 60000)
    result = decoder.decode_service(raw, m.DESTINATIONS[kind]) if kind == "service" else decoder.decode_general(raw, m.DESTINATIONS[kind])
    check(result["decodedDestination"] == m.DESTINATIONS[kind])
for k in ["supplementalReviewHash", "validationFamily", "validationPreviewPlanHash"]:
    wrong = copy.deepcopy(e)
    wrong[k] = "wrong"
    reject(wrong, ready)
print(json.dumps({"status": "PASS_OFFLINE_ISOLATED_CORRECTIVE_QR_FIXTURES", "checks": checks, "localExistingPublicSvgDecodes": 2, "newDeploymentValidated": False, "newProofFilesWritten": 0, "networkRequests": 0, "credentialReads": 0, "newPayments": 0}))
