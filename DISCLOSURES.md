# Project disclosures

Updated September 16, 2026. These statements describe this submission and its
limits; they are not a legal opinion or a guarantee against liability.

## Author, affiliation and development assistance

This is an independent take-home project presented by **Brandon Dent, MD**, in
a personal capacity. The presenter-supplied title, **former EM assistant
community professor at UNR**, describes a former role at the University of
Nevada, Reno. It does not represent a current appointment, university project,
institutional approval or university endorsement.

The submission was prepared for discussion with Counsel Health. It is not
Counsel Health's software, clinical policy, service or research validation.
The Counsel name and logo identify the intended presentation audience; they
do not establish sponsorship, partnership or permission to redistribute a mark.
No endorsement or approval by Counsel Health, the University of Nevada, Reno,
OpenAI or Anthropic is claimed. No individual recipient's name is needed to
evaluate this work.

OpenAI Codex assisted with implementation, tests, documentation and presentation
preparation. Model-generated reviews and rationales are not independent
physician judgments or legal advice. Physician-reference decisions attributed
to the presenter are distinct from those automated contributions. The current
demo calls Anthropic; the experimental model identifiers and settings are
recorded in their respective manifests. A vendor's inclusion does not certify
this implementation or its clinical claims. The repository name is a project
identifier, not an official product or partnership designation.

## Clinical and evaluation scope

The software demonstrates routing of synthetic opening messages. It is not a
patient-care service, medical advice, prescribing system or emergency service.
Its output creates no clinician task, acceptance of care or completed follow-up.
No patient should rely on a demonstration output to make a care decision.
The project does not claim regulatory clearance, clinical readiness, HIPAA
compliance, institutional review approval or prospective validation.

The historical saved 48/50 result is agreement with a revised physician reference on a
known synthetic set. The original result was 44/49. The revision followed review
of existing outputs; it changed reference labels and included C25, not model
behavior. C22 and C47 remain false negatives for required clinician review.
No patient outcome or observed harm was measured. Rationale quality, subgroup
performance and generalization to unseen cases remain separate questions.
See the [adjudication record](docs/PHYSICIAN_ADJUDICATION_V3_2026-09-15.md).

A separate repeated-control study returned 45/50 and 46/50 with the same Fable request bodies, so the historical result did not reproduce. That study also tested prompt variants and a local Nemotron model. Its 50 known cases use the same post-output physician reference; its 48 authored challenges have no independent clinical review. Repeated and paired outputs are not additional independent patients. No research arm replaced the demonstration, and no score establishes clinical readiness. See the [completed results](docs/WORKFLOW_AWARE_RESULTS_2026-09-16.md).

## Data, images and local operation

The assignment messages are described as fabricated in the supplied brief.
Do not enter real patient information, identifying information or credentials.
Live submissions are sent to the configured Anthropic endpoint. Requests and
responses are also retained in local run records. Loopback hosting does not
make inference offline, remove provider processing or establish privacy
compliance. See [GUI access](docs/GUI_ACCESS.md) and [SECURITY.md](SECURITY.md).

The presentation's ankle photographs, Ottawa illustration and historical
architecture diagram were separately supplied by the presenter. The saved case
viewer also displays the same metadata-stripped ankle photograph and radiograph. They were
added for discussion after evaluation and are not C22 inputs, patient outcomes
or validation evidence. Metadata removal is not proof of consent, ownership or
de-identification. Synthetic provenance and publication consent for the
photographs have not been independently established. The Ottawa illustration's
creator and license are unverified. Its clinical simplification is qualified in
the slide. [Asset provenance](output/submission-2026-09-15/content/assets/provenance.json)
records the files, transformations and source information.

## Rights and distribution

This repository is public for review. No repository-wide open-source license
has been granted. GitHub's permissions to view and fork public repositories
are distinct from a general reuse license. Existing third-party licenses and
notices continue to apply to the material they cover. See
[GitHub's licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).

The assignment CSV, source material, dependency code, trademarks, photographs
and illustrations are not represented as exclusively owned by the presenter.
The brief permits building and presenting the exercise and sharing a code link;
that is not treated here as a general third-party redistribution license.
The supplied brief, role document and private preparation are not included.
Public availability of an image or logo is not, by itself, permission to reuse it.
The educational purpose of a presentation does not establish fair use; that
determination depends on the circumstances. See the
[U.S. Copyright Office's fair-use guidance](https://copyright.gov/fair-use/).

The retained Counsel logo identifies the presentation recipient at the
presenter's request. Separate written permission for this reproduction is not
recorded in the repository. Counsel reserves rights in its content and marks
in its [terms](https://www.counselhealth.com/terms-of-service).
OpenAI names identify development tools and model sources; their use must not
imply an endorsement under [OpenAI's brand guidance](https://openai.com/brand/).
No institution's legal protections or vendor service warranties are transferred
to this prototype by mentioning it.

## Remaining review items

Before broader redistribution or licensing, the presenter should establish
the rights and any necessary subject consent for the supplied media and confirm
the assignment dataset's redistribution terms. If those cannot be established,
use independently licensed replacements or omit the affected assets. Any
applicable employment, confidentiality or assignment agreement needs separate
review; this repository cannot determine those obligations. Qualified counsel
can assess the specific facts, permissions and any proposed license. These
disclosures do not resolve the unverified permissions or waive anyone's rights.

For a rights or privacy concern, contact the repository owner through an
established private channel. Do not post patient information or other sensitive
details in public issues. The [security policy](SECURITY.md) covers software
vulnerability reporting.

## Public saved-output review

The GitHub Pages case review displays the same synthetic assignment messages and
frozen outputs included in this public repository. It accepts no patient text,
calls no model, and submits no review decisions. The hosting provider receives
ordinary web-request metadata; this is not a patient-care service. Physician v3
is a single-author, post-output reference, not independent clinical validation.
CSV labels are displayed separately for discussion. V25 early actions and
incomplete releases are not substituted for completed dispositions. Model run,
quantization, repetition and original score denominators remain identified.
