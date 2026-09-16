# Post-cohort onset-admission GUI retest

Two prospectively specified, consecutive starts through the actual candidate
GUI. No retries, substitution, model comparison or physician approval. The
earlier withheld update in phase4 remains a failure in its original record.

| Input | Run | Published result | Browser reply / completion |
|---|---|---|---:|
| Original C50 migraine/refill | c19ba1e2-78a2-4ad1-9f60-bef6c4385d19 | Priority async | 68.42 s |
| Same message plus gradual-onset update | 17e17bf6-2fa6-4fd4-9d26-8605e7a7fef1 | Priority async | 73.89 s |

The update was exactly: “It came on gradually, like my usual migraines. No new
weakness or trouble speaking.” Both text areas were inspected before clicking
Update assessment. Neither run emitted an early emergency instruction or an
intake question. Browser times include network and HTTP processing, not a
measured first paint. Raw run/event journals are alongside this report.

Both runs used prompt hash
`598165cd6840bb80192b05001eca7934f0acea10b450cda81dcf8a600f07f73f`,
corpus hash `af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd`,
and candidate build `Toz9Tat1iLM7JVtu2V0HS`. Both had six model calls, one
field-local repair and a fresh accepting whole-answer judge. Trace and journals
were saved. C50's invalid context extraction was not admitted as clinical facts;
retrieval query hints were retained. The update's context passed that contract.

The update now records its exact gradual-onset statement as evidence for the
onset finding. The targeted pattern check is **not_assessed**, not a deterministic
pass. Full exact-draft review still applies. Its care destination is the Counsel
clinician queue, priority async; the GUI explicitly says this integration is a
stub and no request or acceptance is confirmed.

This demonstrates correction of the reproduced false rejection, not clinical
safety, generalization or adequate speed. Repair plus second review still costs
tens of seconds. The safety-net wording still combines “sudden, worst-ever” and
merits clinical review; accepting judge output is not physician endorsement.

Base token estimates: $0.591360 and $0.586536. With the prospectively declared
25% contingency and $0.002 allowance per run, the total is **$1.476370**.
This is not a provider invoice. No unknown-usage reservation remains.

## Capture-window disclosure

The capture command was run at approximately 02:00 UTC with an upper boundary
of 02:04 UTC entered prematurely. Both actual starts and completions preceded
capture. The immutable summary is a snapshot, not evidence that the future
interval was observed. A separate window verification after 02:04 must confirm
whether any additional GUI starts occurred; no further GUI submissions are
authorized by this two-start plan. Do not silently treat this recording mistake
as a completed prospective observation window.
