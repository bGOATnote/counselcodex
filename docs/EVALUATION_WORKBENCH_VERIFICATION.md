# Physician review instrument verification

## Verified behavior

Verified on 2026-09-06 against the running Next.js application through the
visible browser interface:

- the instrument began at `0/50`, with all supplied, V0, and proposal labels
  absent from the blinded case form;
- an empty lock attempt produced all nine required clinical-judgment errors;
- case C01 accepted a disposition, operational timing, decisive evidence,
  rationale, must-not-miss concern, decision-changing unknowns, harm analysis,
  confidence, and evidence-sufficiency judgment;
- locking C01 disabled the independent fields, preserved the original answer,
  and only then revealed the supplied route, V0 route and rationale, and
  unattested proposal;
- the comparison required separate supplied-label and V0 safety assessments;
- completing C01 advanced to C02 and changed the live denominator to `1/50`;
- Results reported source and V0 agreement as `1/1`, not `1/50`, and kept the
  final attestation controls disabled;
- Protocol exposed the exact field-to-take-home-to-role competency map;
- Scale plan separated comprehensive automated screening, mandatory serious
  event review, probability sampling, active learning, and regression sets;
- a 390 by 844 viewport had no horizontal document overflow;
- Reset local review required confirmation and returned the handoff state to
  `0/50`; and
- the browser console contained no warnings or errors.

Automated checks additionally cover dataset joins, blank-start semantics,
required judgment validation, completed-case denominators, export digest
round-trip and tamper rejection, rejection of unsigned external imports, and
spreadsheet-formula neutralization.

## Claim boundary

This run verifies the instrument's build, data joins, browser behavior,
responsive layout, and evidence mechanics. It does not validate clinical
performance, reviewer identity, authorization, protected-health-information
handling, formal accessibility conformance, or production readiness. The
take-home interface is static, local, synthetic, and intentionally has no
server mutation API. Import/export integrity detects accidental or unsophisticated
tampering; it is not a cryptographic identity signature.
