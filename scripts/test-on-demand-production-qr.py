"""Offline decoder fixtures: synthetic service QR and existing public general SVG."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("production_qr_decoder", ROOT / "scripts/validate-on-demand-production-qr.py")
decoder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decoder)
checks = 0


def equal(left, right):
    global checks
    assert left == right
    checks += 1


def rejects(action, contains=None):
    global checks
    try:
        action()
    except Exception as error:
        text = str(error)
        assert "offline-test-secret" not in text
        if contains:
            assert contains in text
        checks += 1
        return
    raise AssertionError("EXPECTED_CLOSED_DECODER_REJECTION")


def generated_qr(destination):
    node = "C:/Users/MGC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"
    code = "import QRCode from 'qrcode'; process.stdout.write(await QRCode.toString(process.argv[1],{type:'svg',errorCorrectionLevel:'M',margin:4}));"
    result = subprocess.run([node, "--input-type=module", "-e", code, destination], cwd=ROOT, capture_output=True, timeout=20, check=True)
    return result.stdout


service = generated_qr(decoder.DESTINATIONS["service"])
equal(decoder.decode_service(service, decoder.DESTINATIONS["service"])["decodedDestination"], decoder.DESTINATIONS["service"])
general = (ROOT / "public/demo-qr.svg").read_bytes()
equal(decoder.decode_general(general, decoder.DESTINATIONS["general"])["decodedDestination"], decoder.DESTINATIONS["general"])
rejects(lambda: decoder.decode_service(service, "https://wrong.invalid"), "EXACT_CANONICAL_SERVICE_DESTINATION_REQUIRED")
rejects(lambda: decoder.decode_general(general, "https://wrong.invalid"), "EXACT_CANONICAL_GENERAL_DESTINATION_REQUIRED")
wrong = generated_qr(decoder.DESTINATIONS["service"] + "?access=offline-test-secret")
rejects(lambda: decoder.decode_service(wrong, decoder.DESTINATIONS["service"]), "QR_DESTINATION_MISMATCH")
rejects(lambda: decoder.decode_service(b"<!DOCTYPE svg><svg/>", decoder.DESTINATIONS["service"]), "BOUNDED_QR_SVG_REQUIRED")
rejects(lambda: decoder.decode_general(b"<!ENTITY unsafe><svg/>", decoder.DESTINATIONS["general"]), "BOUNDED_GENERAL_QR_REQUIRED")
rejects(lambda: decoder.decode_general(b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><script/></svg>', decoder.DESTINATIONS["general"]), "NATIVE_GENERAL_QR_REQUIRED")
rejects(lambda: decoder.decode_general(b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><rect x="0" y="0" width="22" height="21"/></svg>', decoder.DESTINATIONS["general"]), "GENERAL_QR_RECTANGLE_BOUND")
rejects(lambda: decoder.decode_service(service.replace(b'stroke="#000000"', b'stroke="#aabbcc"'), decoder.DESTINATIONS["service"]), "NATIVE_QR_PATH_REQUIRED")
capture = {"status": "PASS_ANONYMOUS_PUBLIC_DISCOVERY_QR_DECODE_PENDING", "planHash": decoder.PLAN, "sourceDigests": decoder.SOURCES, "origin": decoder.ORIGIN, "bazaarDeploymentId": decoder.DEPLOYMENTS["bazaar"], "providerDeploymentId": decoder.DEPLOYMENTS["provider"], "qr": {kind: {"path": decoder.QR_PATHS[kind], "expectedDestination": decoder.DESTINATIONS[kind], "sha256": "a" * 64, "independentlyDecoded": False} for kind in ["service", "general"]}, **{field: 0 for field in ["newAccounts", "newOrders", "newPayments", "providerExecutions", "providerTicks", "readinessInvocations"]}}
decoder.validate_capture(capture)
checks += 1
for field, value in [("status", "UNCONFIRMED"), ("planHash", "b" * 64), ("origin", "https://preview.invalid"), ("bazaarDeploymentId", "dpl_Other"), ("providerDeploymentId", "dpl_Other"), ("newPayments", 1), ("providerExecutions", 1)]:
    bad = copy.deepcopy(capture)
    bad[field] = value
    rejects(lambda: decoder.validate_capture(bad))
for field, value in [("path", "private-secret-file"), ("expectedDestination", decoder.DESTINATIONS["service"] + "?access=offline-test-secret"), ("sha256", "bad"), ("independentlyDecoded", True)]:
    bad = copy.deepcopy(capture)
    bad["qr"]["service"][field] = value
    rejects(lambda: decoder.validate_capture(bad))
equal(decoder.cv2.QRCodeDetector, decoder.STANDARD_DETECTOR)
print(json.dumps({"status": "PASS_OFFLINE_PRODUCTION_QR_DECODER", "checks": checks, "actualIndependentDecodes": 2, "syntheticServiceQr": True, "existingPublicGeneralQr": True, "realCapturedProductionQrRead": False, "networkRequests": 0, "credentialReads": 0, "newPayments": 0, "providerExecutions": 0}))
