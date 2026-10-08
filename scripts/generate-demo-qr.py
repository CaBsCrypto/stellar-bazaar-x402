"""Generate the public QR and verify its contents; no access tokens in the URL."""
from pathlib import Path
import cv2
import numpy as np

URL = 'https://bazaar.browns.studio/demo'
root = Path(__file__).resolve().parents[1]
matrix = cv2.QRCodeEncoder_create().encode(URL)
dark = matrix == 0
margin = 4
size = matrix.shape[0] + 2 * margin
rectangles = ''.join(f'<rect x="{x + margin}" y="{y + margin}" width="1" height="1"/>'
                     for y, x in zip(*np.where(dark)))
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
       'role="img" aria-label="Abrir la demo pública de Bazaar" shape-rendering="crispEdges">'
       f'<rect width="{size}" height="{size}" fill="white"/><g fill="black">{rectangles}</g></svg>')
image = np.pad(matrix, margin, constant_values=255).repeat(12, 0).repeat(12, 1)
decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(image)
assert decoded == URL, 'QR did not decode to its expected public URL'
(root / 'public' / 'demo-qr.svg').write_text(svg, encoding='utf-8')
print('PASS: QR decoded to the public demo URL; no credentials included.')
