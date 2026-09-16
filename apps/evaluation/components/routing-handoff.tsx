import type { DispositionRun } from "../../../src/disposition/contract";
import { QUEUE_POLICY } from "../../../src/disposition/routing-policy";

/** A routing destination, not a queue receipt or a clinician acceptance. */
export function RoutingHandoff({ result }: { result: DispositionRun }) {
  if (result.status !== "complete" || result.answer?.disposition !== "ASYNC_PHYSICIAN") return null;
  const priority = result.answer.reviewPriority === "priority" ? "Priority"
    : result.answer.reviewPriority === "routine" ? "Standard" : "Priority not recorded";
  return <section className="mx-6 mt-4 rounded-xl border p-4 text-sm" aria-label="Routing destination">
    <p><strong>Destination: Counsel clinician queue</strong> · {priority}</p>
    <p className="mt-2 text-[#62685f]">Integration stub · No request is sent and no clinician acceptance is confirmed.</p>
    <details className="mt-2"><summary>Ownership and follow-up</summary>
      <p className="mt-2">Intended owner: {QUEUE_POLICY.intendedOwner}. Priority and standard requests share this queue; priority requests are reviewed first.</p>
      <p className="mt-2">{QUEUE_POLICY.target} {QUEUE_POLICY.availability}</p>
      <p className="mt-2">{QUEUE_POLICY.followUp}</p>
    </details>
  </section>;
}
