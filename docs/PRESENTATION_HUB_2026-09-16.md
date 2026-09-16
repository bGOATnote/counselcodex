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

## Hosted release

Release commit: `422a818d4da9d2444632dc5ead9550d8cc765eed`.
[CI](https://github.com/bGOATnote/counselcodex/actions/runs/35129454238) and
[Pages deployment](https://github.com/bGOATnote/counselcodex/actions/runs/35130485391)
passed. The exact-index publication scan covered 16,620 files with zero findings
and errors; 40 existing visual-extraction warnings remained. Changed images and
the new graphic were visually inspected. The staged secret scan found no leaks.

Both public pages returned HTTP 200 with bytes identical to local artifacts:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| index.html | 1,437,381 | `b6975446242a071836fb493df55d0811dc807edf268f8b036e246f1c49cd3bff` |
| roadmap.html | 6,413 | `a3e23dcc12698b61f4c388fa1d3d45c09c917c7191e830683d7c2c244576e068` |

Actual public-browser checks confirmed the restored badge, loaded image
dimensions, hidden index on C22 and both new header links. Live demo opened the
local Fable page with Get disposition enabled; Roadmap opened the published
graphic. Both preserved C22 in the original tab. No call was submitted and no
console errors or warnings were observed. An already-open viewer required a
reload to replace its previous HTML. Temporary preview tabs and viewport
overrides were removed.
