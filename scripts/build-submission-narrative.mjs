/** Generate the reviewable Markdown narrative from the same source as the PPTX. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(readFileSync(resolve(root, "output/submission-2026-09-15/content/deck.json"), "utf8"));
const lines = ["# Disposition take-home slide narrative", "", `${spec.mainSlides} main slides and ${spec.slides.length - spec.mainSlides} appendix slides. The ${spec.presentationMinutes}-minute plan includes a seven-minute live demo; reserve ${spec.qaMinutes} further minutes for Q&A.`, "", "Current demonstration: `/stripped`, Fable 5.1 low effort, three buckets. [PowerPoint](../output/submission-2026-09-15/counsel-disposition-take-home.pptx) · [PDF](../output/submission-2026-09-15/counsel-disposition-take-home.pdf) · [Demo script](DEMO_SCRIPT_2026-09-15.md)", ""];
for (const [i, slide] of spec.slides.entries()) {
  lines.push(`## Slide ${i + 1}: ${slide.title}`, "");
  if (slide.minutes) lines.push(`Time: ${slide.minutes} minute${slide.minutes === 1 ? "" : "s"}.`, "");
  if (slide.subtitle) lines.push(slide.subtitle, "");
  if (slide.presenter) lines.push(`**${slide.presenter.name}**`, "", slide.presenter.title, "");
  if (slide.demoLink) lines.push(`[${slide.demoLink.url}](${slide.demoLink.url}) — ${slide.demoLink.label}`, "");
  if (slide.reviewerLink) lines.push(`[${slide.reviewerLink.label}](${slide.reviewerLink.url})`, "");
  if (slide.caseReviewLink) lines.push(`[${slide.caseReviewLink.label}](${slide.caseReviewLink.url})`, "");
  if (slide.roadmap) lines.push(slide.roadmap, "");
  if (slide.logo) lines.push(...(slide.logo.label ? [slide.logo.label, ""] : []), `![${slide.logo.alt}](../${slide.logo.path})`, "");
  if (slide.table) {
    const row = (cells) => `| ${cells.map((cell) => String(cell).replaceAll("|", "\\|").replaceAll("\n", "<br>")).join(" | ")} |`;
    lines.push(row(slide.table.headers), row(slide.table.headers.map(() => "---")), ...slide.table.rows.map(row), "");
  }
  if (slide.flow) lines.push(...slide.flow.map((item, j) => `${j + 1}. ${item}`), "");
  if (slide.metrics) lines.push(...slide.metrics.map((item) => `- **${item.value}**: ${item.label}`), "");
  if (slide.images) {
    if (slide.imageCaption) lines.push(`**${slide.imageCaption}**`, "");
    for (const image of slide.images) lines.push(`![${image.alt}](../${image.path})`, "");
    if (slide.imageSidebarTitle) lines.push(`### ${slide.imageSidebarTitle}`, "");
  }
  if (slide.type === "prompt") lines.push("```text", ...slide.body, "```", "");
  else if (slide.body) lines.push(...slide.body.map((item) => `- ${item}`), "");
  if (slide.references) lines.push(...slide.references.map(item => `- **${item.label}:** ${item.disposition}`), "");
  if (slide.comparisons) for (const item of slide.comparisons) lines.push(`**${item.label}: ${item.disposition}**`, "", item.rationale, "");
  if (slide.emphasis) lines.push(`**${slide.emphasis}**`, "");
  if (slide.scoreQualifier) lines.push(slide.scoreQualifier, "");
  if (slide.harm) lines.push(`**${slide.harm}**`, "");
  if (slide.footnote) lines.push(`Scope: ${slide.footnote}`, "");
  lines.push("### Speaker notes", "", slide.notes, "", "### Sources", "");
  for (const source of slide.sources ?? []) {
    const link = /^https?:/.test(source) ? source : /^(docs|src|tests|apps|data|outputs|output)\//.test(source) || /^[A-Z_]+\.md$/.test(source) ? `../${source}` : null;
    lines.push(link ? `- [${source}](${link})` : `- ${source}`);
  }
  lines.push("");
}
if (spec.slides.slice(0, spec.mainSlides).reduce((total, slide) => total + slide.minutes, 0) !== spec.presentationMinutes) throw new Error("Session timing mismatch");
const target = resolve(root, "docs/INTERVIEW_DECK_2026-09-15.md");
const narrative = lines.join("\n");
if (process.argv.includes("--verify")) {
  if (readFileSync(target, "utf8") !== narrative) throw new Error("Slide narrative differs from deck.json; regenerate it before publishing.");
  console.log(`Verified ${spec.slides.length} slides and their speaker notes.`);
} else {
  writeFileSync(target, narrative);
  console.log(`Wrote ${spec.slides.length} slides, ${spec.presentationMinutes} presentation minutes.`);
}
