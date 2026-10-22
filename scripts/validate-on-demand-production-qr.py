"""Decode captured canonical production QRs locally. No network or credentials."""
import argparse
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import time
import xml.etree.ElementTree as ET

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
ORIGIN = "https://bazaar.browns.studio"
SERVICE = "guionista-bazaar-production-text-v1"
PLAN = "5d7ef135f78cf9be801d6b7b58bd49eb305749f161eaaf3b18ee527c5d576266"
SOURCES = {
    "bazaar": "034f25235cbbcc89f8f7e51633e93b372e7f531c2cf191f9b114920052b40c52",
    "provider": "9f5b26c7a8ccfbf39c2420f99a938228677927bd1f51ddb825d5bf1c048ae232",
}
DEPLOYMENTS = {"bazaar": "dpl_14sk88QGZ9A7UfatU2uQ2i95rYai", "provider": "dpl_59zNf8MCvktnzTgci3eppUriS2Un"}
EVIDENCE = "docs/evidence/on-demand-v3-production-public-acceptance-2026-10-12.json"
OUTPUT = "docs/evidence/on-demand-v3-production-qr-decoded-2026-10-12.json"
QR_PATHS = {
    "service": "docs/evidence/on-demand-v3-production-service-qr-2026-10-12.svg",
    "general": "docs/evidence/on-demand-v3-production-general-qr-2026-10-12.svg",
}
DESTINATIONS = {"service": ORIGIN + "/resources/" + SERVICE, "general": ORIGIN + "/demo"}
VALIDATOR = "scripts/validate-functional-preview-qr.py"
VALIDATOR_SHA = "6ef9221b686b661ed951b88d52f702d281b23fb8db3d504bd7842bd8d35d354e"
STANDARD_DETECTOR = cv2.QRCodeDetector
ARUCO_DETECTOR = getattr(cv2, "QRCodeDetectorAruco", None)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def public_file(path, maximum):
    target = ROOT / path
    if target.is_symlink() or not target.is_file() or target.stat().st_size > maximum:
        raise ValueError("BOUNDED_PUBLIC_ARTIFACT_REQUIRED")
    if ROOT not in target.resolve().parents:
        raise ValueError("OWN_PUBLIC_ARTIFACT_REQUIRED")
    return target.read_bytes()


class BoundedDecoder:
    def detectAndDecode(self, pixels):
        started = time.monotonic()
        for factory in [STANDARD_DETECTOR, ARUCO_DETECTOR]:
            if factory is None:
                continue
            for scale in [1, 0.5, 2]:
                if time.monotonic() - started > 30:
                    raise ValueError("LOCAL_DECODE_TIME_BOUND")
                rendered = pixels if scale == 1 else cv2.resize(pixels, None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST)
                value, points, straight = factory().detectAndDecode(rendered)
                if value and points is not None:
                    return value, points, straight
        return "", None, None


def decode_service(svg, expected):
    if expected != DESTINATIONS["service"]:
        raise ValueError("EXACT_CANONICAL_SERVICE_DESTINATION_REQUIRED")
    raw = public_file(VALIDATOR, 20000)
    if sha(raw) != VALIDATOR_SHA:
        raise ValueError("PINNED_NATIVE_SVG_VALIDATOR_REQUIRED")
    spec = importlib.util.spec_from_file_location("production_native_svg_validator", ROOT / VALIDATOR)
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
    # Existing renderer accepts only bounded native qrcode path commands. The
    # independent OpenCV decoder tries its Aruco implementation if necessary.
    previous = cv2.QRCodeDetector
    cv2.QRCodeDetector = BoundedDecoder
    try:
        return validator.validate(svg, expected)
    finally:
        cv2.QRCodeDetector = previous


def decode_general(svg, expected):
    if expected != DESTINATIONS["general"]:
        raise ValueError("EXACT_CANONICAL_GENERAL_DESTINATION_REQUIRED")
    if len(svg) > 60000 or b"<!DOCTYPE" in svg.upper() or b"<!ENTITY" in svg.upper():
        raise ValueError("BOUNDED_GENERAL_QR_REQUIRED")
    root = ET.fromstring(svg)
    dimensions = root.attrib.get("viewBox", "").split()
    if len(dimensions) != 4 or dimensions[:2] != ["0", "0"] or dimensions[2] != dimensions[3] or not re.fullmatch(r"[0-9]+", dimensions[2]):
        raise ValueError("SQUARE_GENERAL_QR_REQUIRED")
    modules = int(dimensions[2])
    if not 21 <= modules <= 185 or root.tag != "{http://www.w3.org/2000/svg}svg":
        raise ValueError("BOUNDED_GENERAL_QR_MODULES_REQUIRED")
    pixels = np.full((modules, modules), 255, dtype=np.uint8)

    def draw(node, fill="black", depth=0):
        if depth > 4:
            raise ValueError("GENERAL_QR_DEPTH_BOUND")
        tag = node.tag.rsplit("}", 1)[-1]
        if tag not in ["svg", "g", "rect"]:
            raise ValueError("NATIVE_GENERAL_QR_REQUIRED")
        color = node.attrib.get("fill", fill).lower()
        if color not in ["white", "black", "#fff", "#ffffff", "#000", "#000000"]:
            raise ValueError("MONOCHROME_GENERAL_QR_REQUIRED")
        if tag == "rect":
            nums = [node.attrib.get("x", "0"), node.attrib.get("y", "0"), node.attrib.get("width", ""), node.attrib.get("height", "")]
            if not all(re.fullmatch(r"[0-9]+", value) for value in nums):
                raise ValueError("INTEGER_GENERAL_QR_RECTANGLES_REQUIRED")
            left, top, width, height = map(int, nums)
            if width <= 0 or height <= 0 or left + width > modules or top + height > modules:
                raise ValueError("GENERAL_QR_RECTANGLE_BOUND")
            pixels[top:top + height, left:left + width] = 255 if color in ["white", "#fff", "#ffffff"] else 0
        for child in node:
            draw(child, color, depth + 1)

    draw(root)
    value, points, _ = BoundedDecoder().detectAndDecode(cv2.resize(pixels, None, fx=12, fy=12, interpolation=cv2.INTER_NEAREST))
    if not value or points is None:
        raise ValueError("GENERAL_QR_DECODE_UNCONFIRMED")
    # Never print/store an unexpected destination that might contain a secret.
    if value != expected:
        raise ValueError("GENERAL_QR_DESTINATION_MISMATCH")
    return {"decodedDestination": expected, "moduleDimension": modules, "rasterDimension": modules * 12}


def validate_capture(evidence):
    if evidence.get("status") != "PASS_ANONYMOUS_PUBLIC_DISCOVERY_QR_DECODE_PENDING" or evidence.get("planHash") != PLAN or evidence.get("sourceDigests") != SOURCES or evidence.get("origin") != ORIGIN or evidence.get("bazaarDeploymentId") != DEPLOYMENTS["bazaar"] or evidence.get("providerDeploymentId") != DEPLOYMENTS["provider"]:
        raise ValueError("EXACT_REAL_PRODUCTION_CAPTURE_REQUIRED")
    if any(evidence.get(field) != 0 for field in ["newAccounts", "newOrders", "newPayments", "providerExecutions", "providerTicks", "readinessInvocations"]):
        raise ValueError("READ_ONLY_PRODUCTION_CAPTURE_REQUIRED")
    for kind in ["service", "general"]:
        record = evidence.get("qr", {}).get(kind, {})
        if record.get("path") != QR_PATHS[kind] or record.get("expectedDestination") != DESTINATIONS[kind] or not re.fullmatch(r"[a-f0-9]{64}", record.get("sha256", "")) or record.get("independentlyDecoded") is not False:
            raise ValueError("EXACT_CAPTURED_QR_REFERENCE_REQUIRED")


def execute():
    evidence_raw = public_file(EVIDENCE, 128000)
    evidence = json.loads(evidence_raw)
    validate_capture(evidence)
    if (ROOT / OUTPUT).exists():
        raise ValueError("EXISTING_QR_DECODE_EVIDENCE_REQUIRED_REVIEW")
    results = []
    for kind in ["service", "general"]:
        raw = public_file(QR_PATHS[kind], 20000 if kind == "service" else 60000)
        if sha(raw) != evidence["qr"][kind]["sha256"]:
            raise ValueError("CAPTURED_QR_INTEGRITY_MISMATCH")
        result = decode_service(raw, DESTINATIONS[kind]) if kind == "service" else decode_general(raw, DESTINATIONS[kind])
        results.append({"kind": kind, "path": QR_PATHS[kind], "sha256": sha(raw), **result})
    report = {"version": 1, "status": "PASS_LOCAL_DECODING_CAPTURED_PRODUCTION_QRS", "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "planHash": PLAN, "sourceDigests": SOURCES, "deploymentIds": DEPLOYMENTS, "captureEvidence": EVIDENCE, "captureEvidenceSha256": sha(evidence_raw), "results": results, "checks": 2, "decoder": {"name": "OpenCV QRCodeDetector / QRCodeDetectorAruco", "opencvVersion": cv2.__version__, "numpyVersion": np.__version__, "nativeRendererSha256": VALIDATOR_SHA}, "networkRequests": 0, "credentialReads": 0, "newAccounts": 0, "newOrders": 0, "newPayments": 0, "providerExecutions": 0, "paidFlowValidated": False, "limitations": ["Captured SVGs are decoded locally; transaction and private delivery remain separately unvalidated", "Public requests originated from the operator computer, not an independent team"]}
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
            raise ValueError("EXACT_CHECK_ARGUMENTS_REQUIRED")
        return {"status": "PREPARED_LOCAL_PRODUCTION_QR_DECODER_NOT_EXECUTED", "planHash": PLAN, "sourceDigests": SOURCES, "deploymentIds": DEPLOYMENTS, "captureEvidence": EVIDENCE, "paths": QR_PATHS, "destinations": DESTINATIONS, "output": OUTPUT, "networkRequests": 0, "credentialReads": 0}
    if args.approved_helper_sha256 != sha(Path(__file__).read_bytes()):
        raise ValueError("EXACT_REVIEWED_QR_DECODER_REQUIRED")
    return execute()


if __name__ == "__main__":
    try:
        print(json.dumps(main()))
    except Exception as error:
        code = str(error)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,95}", code):
            code = "LOCAL_PRODUCTION_QR_DECODE_UNCONFIRMED"
        print(json.dumps({"status": "UNCONFIRMED", "code": code, "networkRequests": 0, "newPayments": 0}))
        sys.exit(1)
