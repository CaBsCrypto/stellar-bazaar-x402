"""Decode the actual SVG QR modules in memory; do not regenerate or edit images."""
import json
import xml.etree.ElementTree as ET
from pathlib import Path
import cv2
import numpy as np

expected = {'demo-qr.svg': 'https://bazaar.browns.studio/demo', 'bazaar-qr.svg': 'https://bazaar.browns.studio/'}
for filename, target in expected.items():
    root = ET.parse(Path('public') / filename).getroot()
    _, _, width, height = [int(x) for x in root.attrib['viewBox'].split()]
    assert 1 <= width <= 256 and 1 <= height <= 256
    pixels = np.full((height, width), 255, dtype=np.uint8)
    def draw(node, fill='black'):
        color = node.attrib.get('fill', fill)
        if node.tag.rsplit('}', 1)[-1] == 'rect':
            x, y = int(node.attrib.get('x', 0)), int(node.attrib.get('y', 0))
            w, h = int(node.attrib['width']), int(node.attrib['height'])
            assert x >= 0 and y >= 0 and x+w <= width and y+h <= height
            if color not in ('white', '#fff', '#ffffff', '#FFFFFF'):
                pixels[y:y+h, x:x+w] = 0
        for child in node:
            draw(child, color)
    draw(root)
    rendered = cv2.resize(pixels, None, fx=12, fy=12, interpolation=cv2.INTER_NEAREST)
    decoded, points, _ = cv2.QRCodeDetector().detectAndDecode(rendered)
    assert points is not None and decoded == target, filename + ': unexpected QR target'
    assert '?' not in decoded and '#' not in decoded
print(json.dumps({'status': 'PASS', 'decodedSvgFiles': len(expected), 'targets': expected, 'svgFilesModified': False, 'networkRequests': 0}))
