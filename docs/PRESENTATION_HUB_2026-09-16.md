# Browser presentation hub

[Case index](https://bgoatnote.github.io/counselcodex/#index) ·
[Roadmap](https://bgoatnote.github.io/counselcodex/roadmap.html) ·
[Live local demo](http://localhost:4120/stripped)

The browser is the main discussion surface. Use C22 → C47 → C49, then the
proposed roadmap and a live synthetic submission. The PowerPoint/PDF remains
available for deeper technical and evaluation questions.

## Changes

- Restored the prior **Prepared for** Counsel logo badge.
- The sticky header links to the case index, live demo, graphic-only roadmap
  and repository. Presentation view remains available.
- External destinations open separate tabs, preserving the selected case.
- C22 contains the same two metadata-stripped images as the PowerPoint, embedded
  for offline use. Its caption identifies them as post-evaluation discussion
  images, not model inputs or verified images of the synthetic case.
- The roadmap derives from presentation slides 15–16. It is a proposed sequence
  governed by evidence and clinical review. Historical observations remain
  qualified as development evidence.

## Verification

Actual browser checks on the local publication preview covered the restored
logo, C22 images and their natural dimensions, case-exclusive display, image
removal on C23, index return from the bottom of a case, Back navigation, and
50 index links. Desktop width 1280 and mobile width 390 had no horizontal
overflow. The mobile header remained visible during scrolling; index search
returned below it. The roadmap filled a 1280×800 presentation viewport, with
no navigation furniture, scripts or network access. Browser consoles reported
no errors or warnings. Temporary viewport overrides were reset.

The Live demo link opened the running local Fable page in a separate tab without
submitting. Source, compiled route and existing successful traces establish the
native Anthropic call path: Fable 5.1, low effort, one request per submission.
No fresh inference was triggered during this update. Provider success on the
next submission is not guaranteed by an HTTP page check. Localhost refers to
the viewing computer; it is not a publicly hosted inference service.

All 50 embedded study records are byte-identical to the prior viewer
(SHA-256 `11662fb3a28b3500784ce3bae11084041d90f8e87e1007f19d9182881aab98c6`).
No prompts, reference labels, frozen outputs, live application or slides changed.
Local checks passed: 1,075 tests, 48 skipped; 15 focused viewer/adapter tests;
JavaScript syntax checks and TypeScript checking. The initial sandbox run could
not bind two temporary test listeners; rerunning with loopback access passed.

Both HTML files are standalone. Keep `index.html` and `roadmap.html` beside one
another for offline presenting. Saved cases and images need no model service;
live inference needs the local server and Anthropic access. Repository links
need internet. Publication manifests bind the renderer, roadmap, source deck,
reviewed photo bytes and generated pages.
