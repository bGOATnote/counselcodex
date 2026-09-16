# Safety and security boundary

Read [project disclosures](DISCLOSURES.md) for authorship, affiliation, AI
assistance, evaluation limits and unresolved media permissions. No institutional
or vendor endorsement, certification or warranty is claimed.

The evaluation messages are synthetic. Do not add protected health information,
credentials, production endpoints, or live patient traces. The presentation
contains user-supplied discussion images, separately identified in its asset
provenance; they are not scored case inputs or evidence of a patient outcome.
Mastra Studio and the local stores are development surfaces. Use synthetic
inputs and loopback-only listeners. Never commit `.mastra/`, `.env` files,
runtime logs, or local clinical trace exports. The reviewed submission artifacts
under `output/submission-2026-09-15/` are intended for sharing.

The workflow is a demonstration artifact. It must not be connected to patient
care, automated medical advice, prescribing, or emergency dispatch. Any future
clinical evaluation should run in shadow mode with qualified clinician review,
explicit escalation ownership, audit logging, and institutional privacy and
safety approval.

The stripped workflow makes one provider call and has no clinical side-effect
tools. Historical deterministic tools are read-only and closed-world. The
adaptive research workflow also retrieves external clinical evidence through
fixed endpoints and allowlisted citation hosts; it is not closed-world.
Any future chart, messaging, ordering, refill, scheduling, or dispatch tool must
have server-side authorization, least privilege, input/output schemas,
idempotency where applicable, tamper-evident auditing, and explicit approval for
clinical side effects. Model instructions are not an authorization mechanism.

For a real deployment, use authenticated API and Studio surfaces with separate
roles, encryption and key management, retention/deletion policies, tested
backup/restore, incident response, dependency/SBOM scanning, and a documented
HIPAA/security risk analysis. The local redaction policy is defense in depth; it
is not permission to send PHI to an unapproved exporter. Filtered Mastra spans
do not imply that all persistence is redacted: local request, event, and run
files intentionally retain synthetic messages and outputs. Keep these files
local and retain accounting records across restarts.

## Local server boundary

The Next demo binds to `127.0.0.1` and validates request Host, Origin and a
custom header. Native Mastra Studio has a separate listener and request policy;
the Next guards do not protect it. Public source availability does not deploy
either service. Do not expose these development servers through tunnels,
reverse proxies, or non-loopback interfaces without a separate authenticated
deployment design. Local-origin checks do not authenticate other software
running as the same operating-system user.

Please report software vulnerabilities privately to the repository owner rather
than including sensitive details in a public issue.
