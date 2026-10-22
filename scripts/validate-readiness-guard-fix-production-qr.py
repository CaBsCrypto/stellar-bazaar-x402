"""Decode only new corrective production captures; no network or credentials."""
import argparse
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://bazaar.browns.studio"
SERVICE = "guionista-bazaar-production-text-v1"
SOURCE = "2358527b4f1e5947c296e3e7fb01af2a3345616a765fc8de468719f0ad49cf86"
PLAN = "b6bf1fa02232a7c362bb45427e17324450cb44875f4841d1b3b45b4fd372bb3c"
PROVIDER = "dpl_59zNf8MCvktnzTgci3eppUriS2Un"
OLD_BAZAAR = "dpl_14sk88QGZ9A7UfatU2uQ2i95rYai"
CAPTURE = "docs/evidence/readiness-guard-fix-production-public-acceptance-2026-10-12.json"
READY = "docs/evidence/readiness-guard-fix-production-deployment-2026-10-12.json"
OUTPUT = "docs/evidence/readiness-guard-fix-production-qr-decoded-2026-10-12.json"
DECODER = "scripts/validate-on-demand-production-qr.py"
DECODER_SHA = "e19de1295b872573a9a4e386165675736e8e802801d1e45563ab1b3dea544502"
QR_PATHS = {kind: "docs/evidence/readiness-guard-fix-production-" + kind + "-qr-2026-10-12.svg" for kind in ["service", "general"]}
DESTINATIONS = {"service": ORIGIN + "/resources/" + SERVICE, "general": ORIGIN + "/demo"}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def public_file(path, maximum):
    p = ROOT / path
    if p.is_symlink() or not p.is_file() or p.stat().st_size > maximum or ROOT not in p.resolve().parents:
        raise ValueError("BOUNDED_OWN_CORRECTIVE_PUBLIC_FILE_REQUIRED")
    return p.read_bytes()


def load_decoder():
    raw = public_file(DECODER, 20000)
    if sha(raw) != DECODER_SHA:
        raise ValueError("EXACT_PINNED_QR_DECODER_REQUIRED")
    spec = importlib.util.spec_from_file_location("unchanged_production_qr_decoder", ROOT / DECODER)
    decoder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(decoder)
    return decoder


def validate_capture(e, ready):
    if ready.get("status") != "READY_READINESS_GUARD_FIX_PRODUCTION_PENDING_ACCEPTANCE" or ready.get("sourceDigest") != SOURCE or ready.get("planHash") != PLAN or ready.get("canonicalOrigin") != ORIGIN or ready.get("canonicalAssigned") is not True or ready.get("readyState") != "READY" or ready.get("target") != "production" or ready.get("generalPurchasesEnabled") is not False or ready.get("newPayments") != 0:
        raise ValueError("EXACT_CORRECTIVE_CANONICAL_READY_REQUIRED")
    deployment = ready.get("deploymentId", "")
    if not re.fullmatch(r"dpl_[A-Za-z0-9]+", deployment) or deployment == OLD_BAZAAR:
        raise ValueError("NEW_CORRECTIVE_DEPLOYMENT_REQUIRED")
    if e.get("status") != "PASS_CORRECTIVE_PUBLIC_DISCOVERY_QR_DECODE_PENDING" or e.get("sourceDigest") != SOURCE or e.get("correctiveReleasePlanHash") != PLAN or e.get("canonicalOrigin") != ORIGIN or e.get("deploymentId") != deployment or e.get("providerDeploymentId") != PROVIDER or e.get("anonymousClient") is not True or e.get("protectionBypassUsed") is not False or e.get("generalPurchasesEnabled") is not False or e.get("publicProtectionPreserved") is not True or e.get("privateAccountBindingPreserved") is not False or not isinstance(e.get("requests"), int) or not 1 <= e["requests"] <= 12:
        raise ValueError("REAL_NEW_CORRECTIVE_CAPTURE_REQUIRED")
    if any(e.get(k) != 0 for k in ["newAccounts", "newOrders", "newPayments", "signatures", "providerExecutions", "providerTicks", "readinessInvocations", "secretValuesInOutput", "ownerIdsInOutput"]):
        raise ValueError("CORRECTIVE_CAPTURE_EFFECTS_FORBIDDEN")
    for kind in ["service", "general"]:
        record = e.get("qr", {}).get(kind, {})
        if record.get("path") != QR_PATHS[kind] or record.get("expectedDestination") != DESTINATIONS[kind] or not re.fullmatch(r"[a-f0-9]{64}", record.get("sha256", "")) or record.get("independentlyDecoded") is not False:
            raise ValueError("EXACT_NEW_CAPTURE_REFERENCE_REQUIRED")


def execute():
    evidence_raw = public_file(CAPTURE, 128000)
    e = json.loads(evidence_raw)
    validate_capture(e, json.loads(public_file(READY, 128000)))
    if (ROOT / OUTPUT).exists():
        raise ValueError("EXISTING_CORRECTIVE_QR_PROOF_READ_ONLY_RECOVERY")
    decoder = load_decoder()
    decoded = {}
    for kind in ["service", "general"]:
        raw = public_file(QR_PATHS[kind], 20000 if kind == "service" else 60000)
        if sha(raw) != e["qr"][kind]["sha256"]:
            raise ValueError("CORRECTIVE_QR_INTEGRITY_MISMATCH")
        result = decoder.decode_service(raw, DESTINATIONS[kind]) if kind == "service" else decoder.decode_general(raw, DESTINATIONS[kind])
        # Existing decoder never emits an unexpected destination.
        if result.get("decodedDestination") != DESTINATIONS[kind]:
            raise ValueError("INDEPENDENT_CORRECTIVE_QR_DESTINATION_REQUIRED")
        decoded[kind] = {"path": QR_PATHS[kind], "sha256": sha(raw), "destination": DESTINATIONS[kind], "independentlyDecoded": True, **result}
    report = {"version": 4, "status": "PASS_CORRECTIVE_PRODUCTION_QR_INDEPENDENTLY_DECODED", "sourceDigest": SOURCE, "correctiveReleasePlanHash": PLAN, "deploymentId": e["deploymentId"], "providerDeploymentId": PROVIDER, "canonicalOrigin": ORIGIN, "publicEvidenceSha256": sha(canonical(e)), "publicEvidenceFileSha256": sha(evidence_raw), **decoded, "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "decoderSha256": DECODER_SHA, "networkRequests": 0, "credentialReads": 0, "newOrders": 0, "newPayments": 0, "signatures": 0, "providerExecutions": 0}
    with (ROOT / OUTPUT).open("x", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")
    return {"status": report["status"], "checks": 2, "evidence": OUTPUT, "networkRequests": 0, "newPayments": 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--approved-helper-sha256")
    args = parser.parse_args()
    if not args.execute:
        if args.approved_helper_sha256:
            raise ValueError("EXACT_LOCAL_CHECK_ARGUMENTS_REQUIRED")
        return {"status": "PREPARED_CORRECTIVE_QR_DECODER_NOT_EXECUTED", "sourceDigest": SOURCE, "correctiveReleasePlanHash": PLAN, "capture": CAPTURE, "output": OUTPUT, "paths": QR_PATHS, "destinations": DESTINATIONS, "networkRequests": 0, "credentialReads": 0}
    if args.approved_helper_sha256 != sha(Path(__file__).read_bytes()):
        raise ValueError("EXACT_REVIEWED_CORRECTIVE_QR_DECODER_REQUIRED")
    return execute()


if __name__ == "__main__":
    try:
        print(json.dumps(main()))
    except Exception as error:
        code = str(error)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,95}", code):
            code = "CORRECTIVE_QR_DECODE_UNCONFIRMED"
        print(json.dumps({"status": "UNCONFIRMED", "code": code, "networkRequests": 0, "newPayments": 0}))
        sys.exit(1)
