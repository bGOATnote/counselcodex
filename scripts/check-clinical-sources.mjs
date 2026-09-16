import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { clinicalSources } from '../apps/evaluation/lib/evidence-catalog.ts';
import { evidenceLibrary, libraryHash } from '../src/evidence/library.ts';
import regulatorySources from '../docs/research/regulatory-sources.json' with { type: 'json' };
import responseStandardSources from '../docs/research/response-standard-sources.json' with { type: 'json' };
import nasalHistorySources from '../docs/research/nasal-history-sources.json' with { type: 'json' };
import { checkSourceLink, LINK_CHECK_VERSION, sourceRegistryHash } from '../src/evaluation/source-link-checker.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => !['--regulatory', '--response-standard', '--nasal-history', '--evidence'].includes(arg))) throw new Error('Select at most one registry. Arbitrary URLs are not accepted.');
const sources = args.includes('--evidence') ? evidenceLibrary.sources : args.includes('--regulatory') ? regulatorySources : args.includes('--response-standard') ? responseStandardSources : args.includes('--nasal-history') ? nasalHistorySources : clinicalSources;
const allowedHosts = new Set(['www.aafp.org', 'professional.heart.org', 'www.heart.org', 'newsroom.heart.org', 'dailymed.nlm.nih.gov', 'www.acog.org', 'www.cdc.gov', 'www.nice.org.uk', 'www.idsociety.org', 'www.acc.org', 'www.aad.org', 'le.utah.gov', 'commerce.utah.gov', 'medicaid-documents.dhhs.utah.gov', 'www.medicare.gov', 'www.fda.gov', 'www.hhs.gov', 'www.abem.org', 'www.ahrq.gov', 'www.counselhealth.com']);
if (args.includes('--nasal-history')) for (const host of ['www.mayoclinic.org', 'www.cuh.nhs.uk', 'www.nhs.uk', 'platform.claude.com']) allowedHosts.add(host);
if (args.includes('--evidence')) for (const host of ['www.mayoclinic.org', 'www.cuh.nhs.uk', 'www.nhs.uk', 'www.stroke.org']) allowedHosts.add(host);
const checks = new Array(sources.length);
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < sources.length) {
    const index = next++;
    const passages = args.includes('--evidence') ? evidenceLibrary.passages.filter((p) => p.sourceId === sources[index].id) : [];
    checks[index] = await checkSourceLink(sources[index], { allowedHosts, ...(passages.length ? { maxBytes: 1_048_576, expectedDocument: { title: sources[index].title.replace(/^NHS:\s*/, ''), passages } } : {}) });
    console.log(`${checks[index].sourceId}: ${checks[index].status} (${checks[index].httpStatus ?? 'no HTTP response'})`);
  }
}));
const report = { schemaVersion: LINK_CHECK_VERSION, checkedAt: new Date().toISOString(), sourceRegistryHash: sourceRegistryHash(sources), ...(args.includes('--evidence') ? { libraryHash } : {}), policy: 'Public source GETs only; no patient data. HTTP reachability is not claim support, currency or clinical validation. PDFs are not text-parsed by this check.', checks };
const bytes = `${JSON.stringify(report, null, 2)}\n`;
const hash = createHash('sha256').update(bytes).digest('hex');
const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/research/link-checks');
await mkdir(directory, { recursive: true });
const path = resolve(directory, `${report.checkedAt.replaceAll(':', '-')}-${hash.slice(0, 12)}.json`);
await writeFile(path, bytes, { flag: 'wx' });
console.log(`Immutable report: ${path}`);
// Reachability problems are findings, never silently converted to success.
if (checks.some(({ status }) => !status.startsWith('reachable_'))) process.exitCode = 2;
if (checks.some(({ documentVerification }) => documentVerification && documentVerification.status !== 'identity_and_excerpt_match')) process.exitCode = 2;
