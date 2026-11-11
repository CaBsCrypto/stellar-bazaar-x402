// Browser-only generation. Registration/authentication remains a server concern.
export function generateDemoCredentials(ownerId: string) {
  const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");
  return { ownerId, readToken: "bz_read_" + randomHex(), writeToken: "bz_write_" + randomHex() };
}
