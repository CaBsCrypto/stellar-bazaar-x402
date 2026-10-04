# Provider source snapshot

This archive preserves the exact 22 source files uploaded for the USDC-first-sale Preview candidate. Original payload: c8a59203f6a68a263ee650f61513dce525453ab9ad90c513b3097abec293f37c; original source bytes: 383586. Bazaar application source binding: a741937b6d389edbd333ff51bac95b68e654d40e.

Every original filename has the suffix .source. The bytes inside each file are unchanged. This keeps provider TypeScript and package/configuration files outside the Bazaar compiler/runtime discovery patterns. It does not change the source snapshot. The receipt ../provider-usdc-source-archive.json maps originalPath to archivePath and records byte length, SHA-1 from the Vercel dry upload, and SHA-256 from the frozen upload audit.

To restore, create a separate empty provider directory and copy each receipt archivePath to its originalPath, removing only the final .source suffix. Verify all byte lengths and hashes and reconstruct the ordered original upload list {path,bytes,sha256}; its SHA-256 must equal the payload fingerprint above. Never restore into the Bazaar application checkout. Dependencies, build outputs, tests, .env files, .vercel settings, secrets and deployment credentials are absent. Restoring source does not authorize deploying or making network requests.

This snapshot includes legacy provider routes and client modules exactly as uploaded; the accepted marketplace product uses the deterministic text generator. No service has been run by creating this archive.
