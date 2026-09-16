# Capture correction — append-only

At 02:04:26.629 UTC, after the prematurely entered 02:04 boundary, a second
read-only capture observed exactly the same two starts, same complete outcomes,
and byte-identical copied run/event hashes. No additional GUI start was found.
The comparison used all row fields, not merely the run count.

The confirmation is in `../phase5-window-confirmation/summary.json`. It is a
duplicate observation of the same two paid runs, **not two additional attempts
or additional spending**. The original snapshot and its window error remain
unchanged. The capture script now rejects future observation boundaries before
creating output, records its actual capture time, and has three keyless tests
for invalid windows. This changes research tooling, not patient routing.
