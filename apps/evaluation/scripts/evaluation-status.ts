import { dataset, proposalSummary } from "../lib/cases.ts";

console.log(JSON.stringify({
  schemaVersion: "counsel-physician-review-instrument-status/v1",
  dataset,
  unattestedProposal: proposalSummary,
  physicianReview: {
    completedCases: 0,
    source: "browser-local review or imported integrity-hashed export",
    note: "Run the GUI; no case counts as physician-reviewed from repository defaults.",
  },
  permittedClaims: [
    "50-case physician review instrument implemented",
    "unattested reference proposal and V0 replay are available after blind lock",
    "software verification passed",
  ],
  prohibitedClaims: [
    "physician review completed before an attested export is supplied",
    "consensus reference standard",
    "clinical performance estimate",
    "deployment readiness",
  ],
}, null, 2));
