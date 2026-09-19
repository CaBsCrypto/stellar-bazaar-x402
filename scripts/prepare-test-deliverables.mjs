import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { deliverableSchema } from "../lib/deliverable.ts";

const fixtureDir = resolve("work/private-deliverables-fixtures");
if (!existsSync(fixtureDir)) {
  mkdirSync(fixtureDir, { recursive: true });
}

const posterPath = join(fixtureDir, "test-poster.png");
const videoPath = join(fixtureDir, "test-sample.mp4");
const manifestPath = join(fixtureDir, "manifest.json");

console.log("Generating visual test assets in:", fixtureDir);

// 1. Generate test poster PNG
try {
  execSync(
    `ffmpeg -y -f lavfi -i testsrc=size=1280x720:rate=1 -frames:v 1 "${posterPath}"`,
    { stdio: "inherit" }
  );
} catch (e) {
  console.error("FFmpeg poster error:", e.message);
}

// 2. Generate short test MP4 video (3 seconds, 720p, 30fps)
try {
  execSync(
    `ffmpeg -y -f lavfi -i testsrc=size=1280x720:rate=30 -f lavfi -i sine=frequency=440:duration=3 -t 3 -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart "${videoPath}"`,
    { stdio: "inherit" }
  );
} catch (e) {
  console.error("FFmpeg video error:", e.message);
}

const posterBytes = readFileSync(posterPath);
const videoBytes = readFileSync(videoPath);

const posterSha256 = createHash("sha256").update(posterBytes).digest("hex");
const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");

const files = [
  {
    id: "file-test-poster-1",
    name: "test-poster.png",
    mediaType: "image/png",
    size: posterBytes.length,
    sha256: posterSha256,
  },
  {
    id: "file-test-video-1",
    name: "test-sample.mp4",
    mediaType: "video/mp4",
    size: videoBytes.length,
    sha256: videoSha256,
  },
];

const manifest = {
  schemaVersion: "bazaar.deliverable/v1",
  deliveryId: "delivery-test-x402-001",
  versionId: "v1",
  versionLabel: "Versión de Prueba 1",
  title: "Prueba de pago x402 y recepción visual",
  summary: "Afiche PNG y video de muestra para verificar almacenamiento privado S3, visor multimedia y reproducción con control de avance sin pagos Testnet.",
  files,
  content: {
    kind: "video",
    clips: [
      {
        id: "clip-test-1",
        title: "Video de prueba x402 y recepción visual",
        fileId: "file-test-video-1",
        posterFileId: "file-test-poster-1",
        durationSeconds: 3,
      },
    ],
  },
};

const validatedManifest = deliverableSchema.parse(manifest);
writeFileSync(manifestPath, JSON.stringify(validatedManifest, null, 2), "utf8");

console.log("\n=== Test Assets Prepared Successfully ===");
console.log(`Poster: ${posterPath} (${posterBytes.length} bytes, sha256: ${posterSha256})`);
console.log(`Video:  ${videoPath} (${videoBytes.length} bytes, sha256: ${videoSha256})`);
console.log(`Manifest validated and written to: ${manifestPath}`);
