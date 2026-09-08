export function assertPaidLiveReport(result, request) {
  if (!request || request.mode !== 'live' || !result || result.provider !== 'website-intelligence' || result.mode !== 'live' || result.schemaVersion !== '1.1' || result.language !== (request.language ?? 'es') || result.network?.attempted !== true || result.network?.allowed !== true || !Array.isArray(result.findings) || !result.findings.length || !Array.isArray(result.limitations) || !result.limitations.length || !/^[a-f0-9]{64}$/.test(result.evidence?.htmlSha256 ?? '') || !Number.isFinite(Date.parse(result.fetchedAt))) throw Error('LIVE_REPORT_REQUIRED');
  if (new URL(result.requestedUrl).href !== new URL(request.url).href) throw Error('LIVE_REPORT_URL_MISMATCH');
  const final = new URL(result.finalUrl);
  if (!['https:', 'http:'].includes(final.protocol) || final.username || final.password) throw Error('LIVE_REPORT_FINAL_URL_INVALID');
  return result;
}
