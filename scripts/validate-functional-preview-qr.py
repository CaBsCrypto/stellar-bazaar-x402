"""Decode a saved hosted QR locally; no browser, network or credentials."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET

import cv2
import numpy as np


def validate(svg_bytes, expected_url):
    if len(svg_bytes) > 20000 or b"<!DOCTYPE" in svg_bytes or b"<!ENTITY" in svg_bytes:
        raise ValueError("BOUNDED_QR_SVG_REQUIRED")
    root = ET.fromstring(svg_bytes)
    if root.tag != "{http://www.w3.org/2000/svg}svg":
        raise ValueError("NATIVE_QR_SVG_REQUIRED")
    dimensions = root.attrib.get("viewBox", "").split()
    if len(dimensions) != 4 or dimensions[:2] != ["0", "0"] or dimensions[2] != dimensions[3]:
        raise ValueError("SQUARE_QR_REQUIRED")
    modules = int(dimensions[2])
    if not 21 <= modules <= 185:
        raise ValueError("QR_MODULE_BOUND")
    scale = 12
    pixels = np.full((modules * scale, modules * scale), 255, dtype=np.uint8)
    dark_paths = 0
    for path in root:
        if path.tag != "{http://www.w3.org/2000/svg}path":
            raise ValueError("UNEXPECTED_SVG_ELEMENT")
        if path.attrib.get("fill") == "#ffffff":
            continue
        if path.attrib.get("stroke") != "#000000":
            raise ValueError("NATIVE_QR_PATH_REQUIRED")
        dark_paths += 1
        data = path.attrib.get("d", "")
        if re.search(r"[^Mmh0-9.\-\s]", data):
            raise ValueError("UNEXPECTED_QR_PATH_COMMAND")
        x = y = 0.0
        for command, values in re.findall(r"([Mmh])([^Mmh]+)", data):
            nums = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", values)]
            if command in ["M", "m"]:
                if len(nums) != 2:
                    raise ValueError("INVALID_QR_PATH")
                if command == "M":
                    x, y = nums
                else:
                    x += nums[0]
                    y += nums[1]
            else:
                if len(nums) != 1 or nums[0] <= 0:
                    raise ValueError("INVALID_QR_PATH")
                end = x + nums[0]
                if not (0 <= x < end <= modules and 0.5 <= y <= modules - 0.5):
                    raise ValueError("QR_PATH_OUT_OF_BOUNDS")
                pixels[round((y - 0.5) * scale):round((y + 0.5) * scale), round(x * scale):round(end * scale)] = 0
                x = end
    if dark_paths != 1:
        raise ValueError("SINGLE_QR_REQUIRED")
    decoded, points, _ = cv2.QRCodeDetector().detectAndDecode(pixels)
    if not decoded or points is None:
        raise ValueError("QR_DECODE_UNCONFIRMED")
    # Do not print or persist a different decoded value, which could contain a secret.
    if decoded != expected_url:
        raise ValueError("QR_DESTINATION_MISMATCH")
    url = urllib.parse.urlsplit(decoded)
    if url.scheme != "https" or url.username or url.password or url.query or url.fragment:
        raise ValueError("PUBLIC_SERVICE_URL_REQUIRED")
    return {"decodedDestination": decoded, "moduleDimension": modules, "rasterDimension": modules * scale}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--svg", default="docs/evidence/functional-preview-qr-2026-10-11.svg")
    parser.add_argument("--deployment", default="docs/evidence/functional-preview-deployment-2026-10-11.json")
    parser.add_argument("--service", default="guionista-bazaar-pilot-text-funded-v1")
    parser.add_argument("--output", default="docs/evidence/functional-preview-qr-decoded-2026-10-11.json")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.service):
        raise ValueError("PUBLIC_SERVICE_ID_REQUIRED")
    deployment = json.loads(Path(args.deployment).read_text(encoding="utf-8"))
    origin = deployment.get("url", "")
    if not re.fullmatch(r"https://stellar-bazaar-x402-[a-z0-9]+-cabscryptocontacto-6028s-projects\.vercel\.app", origin):
        raise ValueError("EXACT_PREVIEW_ORIGIN_REQUIRED")
    expected = origin + "/resources/" + args.service
    svg_bytes = Path(args.svg).read_bytes()
    result = validate(svg_bytes, expected)
    evidence = {
        "version": 1, "status": "PASS", "category": "Independent decoding of saved hosted Preview SVG",
        "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "candidate": deployment.get("candidate"), "effectiveSourceDigest": deployment.get("effectiveSourceDigest"),
        "deploymentId": deployment.get("deploymentId"), "environment": "protected-preview artifact, decoded locally",
        "sourceSvg": args.svg, "sourceSvgSha256": hashlib.sha256(svg_bytes).hexdigest(),
        "deploymentEvidence": args.deployment, "serviceId": args.service,
        "expectedDestination": expected, **result,
        "decoder": {"name": "OpenCV QRCodeDetector", "version": cv2.__version__, "numpyVersion": np.__version__},
        "checks": {"independentPixelDecode": True, "exactPreviewOrigin": True, "exactServicePath": True,
                   "queryAbsent": True, "fragmentAbsent": True, "credentialsAbsent": True},
        "networkRequests": 0, "newAccounts": 0, "newOrders": 0, "newPayments": 0,
        "productionPublished": False, "cronActivated": False, "externalPublicAccessValidated": False,
        "limitations": ["The QR was previously fetched from protected Preview; local decoding does not prove anonymous access or a purchase.",
                        "This evidence is bound to the recorded candidate and URL, not to future V2 or production."]
    }
    with Path(args.output).open("x", encoding="utf-8") as handle:
        json.dump(evidence, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(json.dumps({"status": "PASS", "evidence": args.output, "destination": expected,
                      "decoder": cv2.__version__, "networkRequests": 0, "newPayments": 0}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        code = str(error)
        if not re.fullmatch(r"[A-Z0-9_]+", code):
            code = "LOCAL_QR_VALIDATION_UNCONFIRMED"
        print(json.dumps({"status": "FAIL", "code": code}))
        sys.exit(1)
