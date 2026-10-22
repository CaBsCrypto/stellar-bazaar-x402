"""Decode the two future captured canonical SVGs. Local only; no credentials."""
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
SOURCE = "d558ae14b168fa99d10c37b9045c434b400f0c7b8abec1371248578bebe5705d"
PLAN = "83bc3627c9a25923da85ceca316bccf800b88b1411994295880595509765db29"
CAPTURE = "docs/evidence/facilitator-repaired-restricted-postpromotion-acceptance-2026-10-12.json"
OUTPUT = "docs/evidence/facilitator-repaired-restricted-postpromotion-qr-decoded-2026-10-12.json"
PATHS = {"service": "docs/evidence/facilitator-repaired-restricted-postpromotion-service-qr-2026-10-12.svg", "general": "docs/evidence/facilitator-repaired-restricted-postpromotion-general-qr-2026-10-12.svg"}
DESTINATIONS = {"service": ORIGIN + "/resources/" + SERVICE, "general": ORIGIN + "/demo"}
PARENT = "scripts/validate-on-demand-production-qr.py"
PARENT_SHA = "e19de1295b872573a9a4e386165675736e8e802801d1e45563ab1b3dea544502"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def bounded(path, maximum):
    target = ROOT / path
    if target.is_symlink() or not target.is_file() or target.stat().st_size > maximum or ROOT not in target.resolve().parents:
        raise ValueError("BOUNDED_LOCAL_PUBLIC_ARTIFACT_REQUIRED")
    return target.read_bytes()


def validate_capture(value):
    if value.get("status") != "PASS_NONFINANCIAL_CANONICAL_ACCESS_ADMISSION_AND_HISTORY_QR_DECODE_PENDING" or value.get("planHash") != PLAN or value.get("sourceDigest") != SOURCE or value.get("canonicalOrigin") != ORIGIN or value.get("runtimeMembershipProven") is not True or value.get("originalFinancialJournalUnchanged") is not True or value.get("paidFlowValidated") is not False or not re.fullmatch(r"dpl_[A-Za-z0-9]+", value.get("deploymentId", "")) or value.get("requests") != 16:
        raise ValueError("EXACT_REAL_RESTRICTED_CANONICAL_CAPTURE_REQUIRED")
    for field in ["newAccounts", "newOrders", "newPayments", "signatures", "settlements", "providerExecutions", "sellerWakes", "readinessInvocations", "financialStateWrites"]:
        if value.get(field) != 0:
            raise ValueError("NO_FINANCIAL_ACTION_OR_PROVIDER_WAKE_REQUIRED")
    for kind in PATHS:
        qr = value.get("qr", {}).get(kind, {})
        if qr.get("path") != PATHS[kind] or qr.get("expectedDestination") != DESTINATIONS[kind] or qr.get("independentlyDecoded") is not False or not re.fullmatch(r"[a-f0-9]{64}", qr.get("sha256", "")):
            raise ValueError("EXACT_CANONICAL_CAPTURED_SVG_REQUIRED")


def execute():
    raw = bounded(CAPTURE, 131072)
    capture = json.loads(raw)
    validate_capture(capture)
    if (ROOT / OUTPUT).exists():
        raise ValueError("EXISTING_DECODE_EVIDENCE_PRESERVED")
    if sha(bounded(PARENT, 20000)) != PARENT_SHA:
        raise ValueError("PINNED_EXISTING_INDEPENDENT_DECODER_REQUIRED")
    spec = importlib.util.spec_from_file_location("existing_bounded_canonical_qr_decoder", ROOT / PARENT)
    decoder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(decoder)
    results = []
    for kind in PATHS:
        svg = bounded(PATHS[kind], 20000 if kind == "service" else 60000)
        if sha(svg) != capture["qr"][kind]["sha256"]:
            raise ValueError("CAPTURED_SVG_HASH_MISMATCH")
        result = decoder.decode_service(svg, DESTINATIONS[kind]) if kind == "service" else decoder.decode_general(svg, DESTINATIONS[kind])
        results.append({"kind": kind, "path": PATHS[kind], "sha256": sha(svg), **result})
    report = {"version": 1, "status": "PASS_LOCAL_CANONICAL_RESTRICTED_PUBLICATION_QR_DECODE", "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "planHash": PLAN, "sourceDigest": SOURCE, "deploymentId": capture["deploymentId"], "captureEvidence": CAPTURE, "captureEvidenceSha256": sha(raw), "results": results, "checks": 2, "independentDecoderSha256": PARENT_SHA, "networkRequests": 0, "credentialReads": 0, "newOrders": 0, "newPayments": 0, "providerExecutions": 0, "sellerWakes": 0, "paidFlowValidated": False}
    with (ROOT / OUTPUT).open("x", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")
    return {"status": report["status"], "evidence": OUTPUT, "checks": 2, "networkRequests": 0, "newPayments": 0, "paidFlowValidated": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--approved-helper-sha256")
    args = parser.parse_args()
    if not args.execute:
        if args.approved_helper_sha256:
            raise ValueError("LOCAL_CHECK_TAKES_NO_EXECUTION_APPROVAL")
        return {"status": "PREPARED_LOCAL_RESTRICTED_PUBLICATION_QR_DECODER", "capture": CAPTURE, "output": OUTPUT, "networkRequests": 0, "credentialReads": 0, "newPayments": 0}
    if args.approved_helper_sha256 != sha(Path(__file__).read_bytes()):
        raise ValueError("EXACT_REVIEWED_DECODER_REQUIRED")
    return execute()


if __name__ == "__main__":
    try:
        print(json.dumps(main()))
    except Exception as error:
        code = str(error)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,95}", code):
            code = "LOCAL_RESTRICTED_QR_DECODE_UNCONFIRMED"
        print(json.dumps({"status": "UNCONFIRMED", "code": code, "networkRequests": 0, "credentialReads": 0, "newPayments": 0}))
        sys.exit(1)
