import { createHash } from 'node:crypto';

export const LINK_CHECK_VERSION = 'source-link-check/v2';
export const sourceRegistryHash = (sources) => createHash('sha256').update(JSON.stringify(sources)).digest('hex');

const visibleText = (html) => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ').replace(/&amp;/gi, '&')
  .replace(/&(?:apos|#39|#x27);/gi, "'").replace(/&quot;/gi, '"')
  .normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

// Offline catalog maintenance only. Never call with patient text or caller-supplied URLs.
export function validateSourceUrl(value, allowedHosts) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
      || !allowedHosts.has(url.hostname)) throw new Error('URL is outside the HTTPS publisher allowlist');
  return url.href;
}

export async function checkSourceLink(source, { allowedHosts, fetchImpl = fetch, timeoutMs = 12000, maxBytes = 262144, now = () => new Date().toISOString(), expectedDocument }) {
  const started = now();
  const result = { sourceId: source.id, requestedUrl: source.url, checkedAt: started, status: 'unverified', httpStatus: null, finalUrl: null, redirects: [], contentType: null, bytesInspected: 0, inspectedPrefixSha256: null, bodyTruncated: false, claimSupportVerified: false,
    documentVerification: /** @type {{status: string, matchedPassageIds: string[], expectedDocumentSha256: string, clinicalSupportVerified: boolean, currencyVerified: boolean} | null} */ (null) };
  try {
    let url = validateSourceUrl(source.url, allowedHosts);
    const signal = AbortSignal.timeout(timeoutMs);
    for (let hop = 0; hop <= 5; hop++) {
      const response = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal, headers: { 'user-agent': 'CounselCodex-Research-LinkCheck/1.0', accept: 'text/html,application/pdf;q=0.9,*/*;q=0.1' }, credentials: 'omit' });
      result.httpStatus = response.status;
      result.finalUrl = url;
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || hop === 5) { result.status = 'redirect_error'; return result; }
        const next = validateSourceUrl(new URL(location, url).href, allowedHosts);
        result.redirects.push({ from: url, to: next, httpStatus: response.status });
        url = next;
        continue;
      }
      result.contentType = response.headers.get('content-type');
      if (!response.ok) {
        await response.body?.cancel();
        result.status = [401, 402, 403, 429].includes(response.status) ? 'access_blocked' : 'http_error';
        return result;
      }
      const chunks = [];
      const reader = response.body?.getReader();
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const available = maxBytes - result.bytesInspected;
            const part = value.subarray(0, available);
            chunks.push(part);
            result.bytesInspected += part.length;
            if (value.length >= available) { result.bodyTruncated = true; await reader.cancel(); break; }
          }
        } finally { reader.releaseLock(); }
      }
      const body = Buffer.concat(chunks);
      result.inspectedPrefixSha256 = createHash('sha256').update(body).digest('hex');
      const html = body.toString('utf8');
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
      // Conservative transport checks, not an entailment or clinical-validity judge.
      if (/access denied|just a moment|verify you are human|request rejected|page not found|404 not found/i.test(title)) result.status = 'access_blocked';
      else if (body.subarray(0, 5).toString() === '%PDF-') result.status = 'reachable_pdf_unverified';
      else if (result.contentType?.includes('text/html') && /<html|<!doctype html/i.test(html)) result.status = 'reachable_html_unverified';
      else result.status = 'unexpected_content';
      if (expectedDocument) {
        // Bound to a preselected publisher, title, and stored excerpts. This
        // catches soft redirects/wrong documents, not forged clinical claims.
        const text = visibleText(html);
        const validExpectation = typeof expectedDocument.title === 'string' && expectedDocument.title.trim().length >= 4
          && Array.isArray(expectedDocument.passages) && expectedDocument.passages.length > 0;
        const matched = validExpectation ? expectedDocument.passages.filter((p) => typeof p.excerpt === 'string' && p.excerpt.length >= 8 && text.includes(visibleText(p.excerpt))).map((p) => p.id) : [];
        result.documentVerification = {
          expectedDocumentSha256: createHash('sha256').update(JSON.stringify(expectedDocument)).digest('hex'),
          status: !validExpectation ? 'invalid_expectation' : result.bodyTruncated ? 'truncated_unverified'
            : result.status !== 'reachable_html_unverified' ? 'format_unverified'
              : !text.includes(visibleText(expectedDocument.title)) ? 'identity_mismatch'
                : matched.length !== expectedDocument.passages.length ? 'passage_changed_or_missing' : 'identity_and_excerpt_match',
          matchedPassageIds: matched,
          clinicalSupportVerified: false, currencyVerified: false,
        };
      }
      return result;
    }
  } catch (error) {
    result.status = /allowlist/.test(error.message) ? 'unsafe_url' : /timeout|abort/i.test(`${error.name} ${error.message}`) ? 'timeout' : 'network_error';
    // No arbitrary error body/headers or secrets are retained.
  }
  return result;
}
