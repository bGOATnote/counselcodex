"use client";

import { useEffect, useRef, useState } from "react";
import type { StrippedRun } from "../../../src/stripped/contract";
import styles from "./stripped-workbench.module.css";

type Props = {
  cases: Array<{ id: string; message: string }>;
  protocol: { model: string; effort: string; promptSHA256: string };
};

export function StrippedWorkbench({ cases, protocol }: Props) {
  // Wait for hydration before enabling controls so the displayed selection and
  // submitted message cannot diverge during the first page load.
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState(cases[0]?.message ?? "");
  const [run, setRun] = useState<StrippedRun | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientMs, setClientMs] = useState<number | null>(null);
  const request = useRef<{ sequence: number; controller: AbortController | null }>({ sequence: 0, controller: null });

  useEffect(() => {
    setReady(true);
    return () => {
      request.current.sequence += 1;
      request.current.controller?.abort();
    };
  }, []);

  function editMessage(value: string) {
    request.current.sequence += 1;
    request.current.controller?.abort();
    request.current.controller = null;
    setBusy(false);
    setMessage(value);
    setRun(null);
    setError("");
    setClientMs(null);
  }

  async function assess() {
    if (!ready || busy || !message.trim()) return;
    const submittedMessage = message;
    const sequence = ++request.current.sequence;
    request.current.controller?.abort();
    const controller = new AbortController();
    request.current.controller = controller;
    const started = performance.now();
    const current = () => sequence === request.current.sequence;
    setBusy(true);
    setRun(null);
    setError("");
    setClientMs(null);

    try {
      const response = await fetch("/api/stripped", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-counsel-review": "local-v1" },
        body: JSON.stringify({ message: submittedMessage }),
        signal: controller.signal,
      });
      const payload: StrippedRun | { error: string } = await response.json();
      if (!current()) return;
      if (!("id" in payload)) throw new Error(payload.error || "The request could not complete. Try again.");
      if (payload.message !== submittedMessage) throw new Error("The response did not match the submitted message. Please try again.");
      setRun(payload);
      setClientMs(Math.round(performance.now() - started));
      if (!response.ok || payload.status === "error") {
        setError(payload.error || "The request did not return a disposition. Try again.");
      }
    } catch (caught) {
      if (current()) {
        setError(caught instanceof Error && caught.name !== "AbortError" ? caught.message : "The request could not complete. Try again.");
      }
    } finally {
      if (current()) {
        request.current.controller = null;
        setBusy(false);
      }
    }
  }

  const currentRun = run?.message === message ? run : null;
  const answer = currentRun?.status === "complete" ? currentRun.result : null;
  const selectedCase = cases.find((item) => item.message === message)?.id ?? "";

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          {/* The existing static brand asset needs no image transformation. */}
          <img src="/counsel-symbol.svg" width="50" height="51" alt="" />
          <div><p className={styles.eyebrow}>Counsel Codex</p><h1>Disposition</h1></div>
        </div>
        <p className={styles.model}>Fable 5.1 <span aria-hidden="true">·</span> {protocol.effort} effort</p>
      </header>

      <main className={styles.workspace}>
        <p className={styles.intro}>One message. One disposition.</p>
        <div className={styles.columns}>
          <section className={styles.panel} aria-labelledby="stripped-message-heading">
            <h2 id="stripped-message-heading">Patient message</h2>
            <label htmlFor="stripped-case">Sample message</label>
            <select id="stripped-case" disabled={!ready} value={selectedCase} onChange={(event) => editMessage(cases.find((item) => item.id === event.target.value)?.message ?? "")}>
              <option value="">New or edited message</option>
              {cases.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.message.slice(0, 76)}{item.message.length > 76 ? "…" : ""}</option>)}
            </select>
            <form onSubmit={(event) => { event.preventDefault(); void assess(); }}>
              <label htmlFor="stripped-message">Message to assess</label>
              <textarea id="stripped-message" disabled={!ready} rows={8} maxLength={12_000} value={message} onChange={(event) => editMessage(event.target.value)} />
              <p className={styles.hint}>Edit the message and submit again to start a new assessment.</p>
              <button type="submit" className={styles.submit} disabled={!ready || busy || !message.trim()}>{busy ? "Getting disposition…" : "Get disposition"}</button>
            </form>
          </section>

          <section className={`${styles.panel} ${styles.response}`} aria-labelledby="stripped-result-heading" aria-busy={busy}>
            <h2 id="stripped-result-heading">Disposition</h2>
            <div aria-live="polite" aria-atomic="true">
              {busy ? <div className={styles.empty}><p className={styles.pending}>Assessing the message…</p><p>The disposition and short rationale will appear here.</p></div> : answer ? (
                <div className={styles.answer} data-disposition={answer.disposition}>
                  <p className={styles.bucket}>{answer.disposition}</p>
                  <h3>Rationale</h3>
                  <p className={styles.rationale}>{answer.rationale}</p>
                </div>
              ) : !error && <div className={styles.empty}><p>Ready when you are.</p><p>Choose a sample or enter a message, then get its disposition.</p></div>}
            </div>
            {error && <div role="alert" className={styles.error}><h3>No disposition returned</h3><p>{error}</p></div>}
            {currentRun && <RunTrace run={currentRun} clientMs={clientMs} />}
          </section>
        </div>
        <footer className={styles.footer}>
          <p>Synthetic-message research demo · Not for patient care.</p>
          <details><summary>Model configuration</summary><dl className={styles.metadata}><dt>Model</dt><dd>{protocol.model}</dd><dt>Effort</dt><dd>{protocol.effort}</dd><dt>Prompt SHA-256</dt><dd>{protocol.promptSHA256}</dd></dl></details>
        </footer>
      </main>
    </div>
  );
}

function RunTrace({ run, clientMs }: { run: StrippedRun; clientMs: number | null }) {
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...run, clientReceiptMs: clientMs }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fable-disposition-${run.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <details className={styles.trace} key={run.id}>
      <summary>Request &amp; response trace <span>{(run.trace.latencyMs / 1000).toFixed(2)} s</span></summary>
      <dl className={styles.metadata}>
        <dt>Run ID</dt><dd>{run.id}</dd>
        <dt>Provider request</dt><dd>{run.trace.providerRequestId ?? "Not returned"}</dd>
        <dt>Workflow / step</dt><dd>{run.trace.workflowId} / {run.trace.stepId}</dd>
        <dt>Model calls</dt><dd>{run.trace.providerCalls}</dd>
        <dt>Server time</dt><dd>{(run.trace.latencyMs / 1000).toFixed(2)} s</dd>
        <dt>Browser receipt</dt><dd>{clientMs === null ? "Not recorded" : `${(clientMs / 1000).toFixed(2)} s`}</dd>
        <dt>Input / output tokens</dt><dd>{run.trace.usage ? `${run.trace.usage.inputTokens} / ${run.trace.usage.outputTokens}` : "Not returned"}</dd>
        <dt>Cache read / write</dt><dd>{run.trace.usage ? `${run.trace.usage.cacheReadTokens} / ${run.trace.usage.cacheWriteTokens}` : "Not returned"}</dd>
        <dt>Estimated cost</dt><dd>{run.trace.estimatedUSD === null ? "Not available" : `$${run.trace.estimatedUSD.toFixed(5)}`}</dd>
        <dt>Started</dt><dd>{run.createdAt}</dd>
        <dt>Completed</dt><dd>{run.completedAt}</dd>
      </dl>
      <p className={styles.hint}>The trace includes the request, final output, and execution metadata. Hidden reasoning is omitted.</p>
      <details className={styles.json}><summary>Submitted request</summary><pre>{JSON.stringify(run.trace.request, null, 2)}</pre></details>
      <details className={styles.json}><summary>Response · reasoning removed</summary><pre>{JSON.stringify(run.trace.response, null, 2)}</pre></details>
      <button type="button" className={styles.download} onClick={download}>Download trace JSON</button>
    </details>
  );
}
