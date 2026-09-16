import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Reuse the presentation derivative of the supplied goal.png. Its decoded pixels
// match the supplied image; the derivative removes the original EXIF metadata.
export const CASE_REVIEW_ROADMAP_MEDIA = Object.freeze({
  path: "output/submission-2026-09-15/content/assets/historical-architecture-goal.png",
  sha256: "3cf1a68427c6d46d00d9a273e7a6f09f5682f58c81cb2eec6ac9acb069e5763d",
});

const imageBytes = readFileSync(new URL("../../" + CASE_REVIEW_ROADMAP_MEDIA.path, import.meta.url));
assert.equal(createHash("sha256").update(imageBytes).digest("hex"), CASE_REVIEW_ROADMAP_MEDIA.sha256, "Reviewed architecture roadmap image changed");

export function renderCaseReviewRoadmap() {
  const style = `
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#020b16}main{width:100%;height:100vh;height:100svh}img{display:block;width:100%;height:100%;object-fit:contain}@media print{@page{size:landscape;margin:0}main{height:100vh}}
`;
  const styleHash = createHash("sha256").update(style).digest("base64");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-${styleHash}'; script-src 'none'; connect-src 'none'; img-src data:; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>Historical architecture roadmap · Disposition Study</title><style>${style}</style></head>
<body><main><img src="data:image/png;base64,${imageBytes.toString("base64")}" width="1280" height="720" alt="Presenter-supplied historical architecture roadmap: patient message, parallel Haiku safety and context, evidence retrieval, Opus disposition, and Astra review. This earlier proposed architecture differs from the current live one-call Fable demonstration."></main></body></html>\n`;
}
