// Manual public-page capture only; never imported by retrieval or the candidate.
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const pages = [
  ["response.html", "https://www.cdc.gov/antibiotic-use/hcp/clinical-care/pediatric-outpatient.html"],
  ["rights.html", "https://www.cdc.gov/other/agencymaterials.html"],
];
const retained = [];
for (const [file, url] of pages) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  const body = Buffer.from(await response.arrayBuffer());
  if (response.status !== 200 || response.url !== url || !response.headers.get("content-type")?.includes("text/html"))
    throw new Error(`Unexpected public capture response for ${url}: ${response.status}`);
  retained.push({ file, body, metadata: { url, finalUrl: response.url, status: response.status,
    retrievedAt: new Date().toISOString(), bytes: body.length,
    rawHash: createHash("sha256").update(body).digest("hex"),
    headers: Object.fromEntries(["content-type", "date", "last-modified", "etag"].map(key => [key, response.headers.get(key)])) } });
}
for (const { file, body } of retained) writeFileSync(new URL(file, import.meta.url), body, { flag: "wx" });
writeFileSync(new URL("capture.json", import.meta.url), JSON.stringify(retained.map(({ file, metadata }) => ({ file, ...metadata })), null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(retained.map(({ file, metadata }) => ({ file, ...metadata })), null, 2));
