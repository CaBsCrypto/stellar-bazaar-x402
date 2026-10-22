"""Offline capture contracts and independent decoding of locally generated synthetic SVGs."""
import copy
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("new_restricted_decoder", ROOT / "scripts/decode-payment-recovery-acceptance-postpromotion-qr.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
capture = {"status": "PASS_NONFINANCIAL_RECOVERY_ACCEPTANCE_MEMBERSHIP_QR_DECODE_PENDING", "planHash": module.PLAN, "sourceDigest": module.SOURCE, "canonicalOrigin": module.ORIGIN, "runtimeMembershipProven": True, "originalFinancialJournalUnchanged": True, "paidFlowValidated": False, "deploymentId": "dpl_SYNTHETICREADY", "requests": 7, "qr": {kind: {"path": path, "expectedDestination": module.DESTINATIONS[kind], "independentlyDecoded": False, "sha256": "a" * 64} for kind, path in module.PATHS.items()}}
for key in ["newAccounts", "newOrders", "newPayments", "signatures", "settlements", "providerExecutions", "sellerWakes", "readinessInvocations", "financialStateWrites"]:
    capture[key] = 0
checks = 0


def rejects(value):
    global checks
    try:
        module.validate_capture(value)
    except ValueError:
        checks += 1
        return
    raise AssertionError("EXPECTED_REJECTION")


module.validate_capture(capture)
checks += 1
for field, value in [("sourceDigest", "e" * 64), ("canonicalOrigin", "https://attacker.example"), ("runtimeMembershipProven", False), ("originalFinancialJournalUnchanged", False), ("requests", 8), ("paidFlowValidated", True), ("newPayments", 1), ("sellerWakes", 1)]:
    wrong = copy.deepcopy(capture)
    wrong[field] = value
    rejects(wrong)
for kind in module.PATHS:
    wrong = copy.deepcopy(capture)
    wrong["qr"][kind]["expectedDestination"] += "#token=synthetic-secret"
    rejects(wrong)
parent_spec = importlib.util.spec_from_file_location("bounded_existing_decoder", ROOT / module.PARENT)
parent = importlib.util.module_from_spec(parent_spec)
parent_spec.loader.exec_module(parent)
assert module.sha((ROOT / module.PARENT).read_bytes()) == module.PARENT_SHA
checks += 1
for kind, filename in [("service", "payment-recovery-acceptance-qr-local-synthetic-service.svg"), ("general", "payment-recovery-acceptance-qr-local-synthetic-general.svg")]:
    svg = (ROOT / ".vercel" / filename).read_bytes()
    fn = parent.decode_service if kind == "service" else parent.decode_general
    result = fn(svg, module.DESTINATIONS[kind])
    assert result["decodedDestination"] == module.DESTINATIONS[kind]
    checks += 1
print(json.dumps({"status": "PASS_OFFLINE_RECOVERY_ACCEPTANCE_POSTPROMOTION_QR_CONTRACTS", "checks": checks, "syntheticLocalSvgDecodes": 2, "newCaptureEvidenceCreated": False, "networkRequests": 0, "credentialReads": 0, "newPayments": 0}))
