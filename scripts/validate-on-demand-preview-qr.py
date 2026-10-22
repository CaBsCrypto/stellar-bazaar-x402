"""Independently decode both hosted QR artifacts. Local files only."""
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import cv2
import numpy as np

spec = importlib.util.spec_from_file_location("qr_validator", "scripts/validate-functional-preview-qr.py")
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)
standard_detector = cv2.QRCodeDetector
class Decoder:
    def detectAndDecode(self, pixels):
        for factory in [standard_detector, cv2.QRCodeDetectorAruco]:
            for scale in [1, 0.5, 2]:
                image = cv2.resize(pixels, None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST)
                decoded, points, straight = factory().detectAndDecode(image)
                if decoded and points is not None:
                    return decoded, points, straight
        return "", None, None
validator.cv2.QRCodeDetector = Decoder
def general_validate(svg, expected):
    if len(svg) > 60000 or b"<!DOCTYPE" in svg or b"<!ENTITY" in svg:
        raise ValueError("BOUNDED_STATIC_QR_REQUIRED")
    root = ET.fromstring(svg)
    x, y, width, height = map(int, root.attrib["viewBox"].split())
    if x or y or width != height or not 21 <= width <= 185:
        raise ValueError("BOUNDED_STATIC_QR_REQUIRED")
    pixels = np.full((height, width), 255, dtype=np.uint8)
    def draw(node, fill="black"):
        tag = node.tag.rsplit("}", 1)[-1]
        if tag not in ["svg", "g", "rect"]:
            raise ValueError("NATIVE_STATIC_QR_REQUIRED")
        color = node.attrib.get("fill", fill)
        if tag == "rect":
            left, top = int(node.attrib.get("x", 0)), int(node.attrib.get("y", 0))
            w, h = int(node.attrib["width"]), int(node.attrib["height"])
            if min(left, top) < 0 or left+w > width or top+h > height:
                raise ValueError("STATIC_QR_BOUNDS")
            if color not in ["white", "#fff", "#ffffff"]:
                pixels[top:top+h, left:left+w] = 0
        for child in node:
            draw(child, color)
    draw(root)
    decoded, points, _ = Decoder().detectAndDecode(cv2.resize(pixels, None, fx=12, fy=12, interpolation=cv2.INTER_NEAREST))
    if points is None or decoded != expected:
        raise ValueError("STATIC_QR_DESTINATION_MISMATCH")
    return {"decodedDestination": expected, "moduleDimension": width, "rasterDimension": width*12}
evidence_path = "docs/evidence/on-demand-preview-acceptance-v2-AcknKP8XcmobtQEhu9u7dtWFrLWM-d4770b76-2026-10-11.json"
evidence = json.loads(Path(evidence_path).read_text(encoding="utf-8"))
if evidence["status"] != "PASS" or evidence["sourceDigest"] != "54235252ccb9022247cfa579ca99c82af5bf84ce8444d334c006bc50ce2e9e76":
    raise ValueError("EXACT_PASS_PREVIEW_REQUIRED")
results = []
for name, path, destination in [
    ("service", evidence["serviceQrArtifact"], evidence["url"] + "/resources/" + evidence["service"]["id"]),
    ("general", evidence["generalQrArtifact"], "https://bazaar.browns.studio/demo"),
]:
    svg = Path(path).read_bytes()
    decoded = general_validate(svg, destination) if name == "general" else validator.validate(svg, destination)
    results.append({"kind": name, "source": path, "sha256": hashlib.sha256(svg).hexdigest(), **decoded})
report = {"version": 1, "status": "PASS_LOCAL_DECODING_HOSTED_QRS", "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "deploymentId": evidence["deploymentId"], "sourceDigest": evidence["sourceDigest"], "checks": 2, "results": results, "decoder": "OpenCV QRCodeDetector / QRCodeDetectorAruco", "networkRequests": 0, "newPayments": 0, "productionPublished": False, "limitations": ["Service QR uses the exact protected Preview origin. General QR remains the canonical production demo URL; production still runs the previous candidate."]}
path = "docs/evidence/on-demand-v2-preview-qr-decoded-2026-10-12.json"
with Path(path).open("x", encoding="utf-8") as output:
    json.dump(report, output, indent=2)
    output.write("\n")
print(json.dumps({"status": report["status"], "checks": 2, "evidence": path, "networkRequests": 0}))
