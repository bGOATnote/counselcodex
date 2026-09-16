/** Manual $0 browser integration harness. NEVER imported by the app.
 * Start the production GUI on 4120, then run this file with --fixture-only.
 * Open 4121/candidate. Every write is intercepted or refused, never forwarded.
 * Six ordered scenarios: C50 async, C02 emergency, C04 same-day, C04 update,
 * C50 empty evidence, C02 empty evidence with an issued emergency instruction.
 * Real Mastra execution + HTTP handler + GUI, authored providers/retrieval.
 */
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createV0Handler } from "../../apps/evaluation/lib/v0-handler.ts";
import { createGraphRuntime } from "../../src/disposition/graph-runtime.ts";
import { resolveGraphConfig } from "../../src/disposition/graph-config.ts";
import { draft, context, none, retrieval, usage } from "./gates-fixture.ts";
import type { DispositionRun, ResponseEvent } from "../../src/disposition/contract.ts";

if (process.argv[2] !== "--fixture-only") throw new Error("Explicit --fixture-only required; no live-provider mode exists.");
const directory = mkdtempSync(join(tmpdir(), "counsel-v25-gui-fixtures-"));
let attempt = 0;
const handler = createV0Handler<DispositionRun, ResponseEvent>(async (message, emit, signal) => {
  const n = ++attempt;
  if (n > 6) throw new Error("SIX_AUTHORED_SCENARIOS_ONLY");
  const emergency = n === 2 || n === 6, urgent = n === 3 || n === 4;
  const output = { ...draft, redFlags: [],
    ...(emergency || urgent ? { disposition: emergency ? "EMERGENCY_NOW" : "SAME_DAY_IN_PERSON", reviewPriority: null, workType: null,
      transportIntent: emergency ? { mode: "activate_ems", activationQuote: null } : null,
      patientMessage: emergency ? "Call 911 now. Do not drive yourself or wait for a message reply. (Authored software fixture.)" : "Arrange an in-person assessment today. Do not wait for an asynchronous reply. (Authored software fixture.)" } : { patientMessage: draft.patientMessage + " (Authored software fixture.)" }),
  };
  const safety = emergency || urgent ? { action: emergency ? "EMS_NOW" : "SAME_DAY_IN_PERSON", basis: [{ quote: message.slice(0, 100), interpretation: "Authored software-test scenario, not a clinical judgment.", currentPatient: true, present: true }], actionBasis: { indices: [0], sufficient: true }, reason: "Authored software fixture.", physicalRequirement: urgent ? "Authored in-person scenario for software testing." : null, patientMessage: "" } : none;
  const runtime = createGraphRuntime(join(directory, `attempt-${n}`), async () => n >= 5 ? { ...retrieval, hits: [] } : retrieval,
    async role => {
      if (role === "judge") throw new Error("TEST_MUST_NOT_CALL_JUDGE");
      await new Promise(resolve => setTimeout(resolve, role === "disposition" ? 1800 : 150));
      return { output: role === "context" ? context : role === "safety" ? safety : output, usage };
    }, "gates-release", { ...resolveGraphConfig(), models: { context: "fixture/context", safety: "fixture/safety", disposition: "fixture/disposition", judge: "fixture/unused-judge" } });
  try {
    const result = await runtime.assess(message, emit, signal);
    console.log(JSON.stringify({ kind: "authored_gui_software_test", n, runId: result.runId, traceId: result.traceId, status: result.status, route: result.answer?.disposition, durationMs: result.durationMs, calls: result.modelCalls, paidUsd: 0, clinicalEvidence: false }));
    return result;
  } finally { await runtime.close(); }
}, { stream: true, eventType: "response_event", cancelOnDisconnect: true, heartbeatMs: 1000 });

const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== "localhost:4121" && req.headers.host !== "127.0.0.1:4121") { res.writeHead(403).end(); return; }
    if (req.method === "POST" && req.url === "/api/candidate" && ["http://localhost:4121", "http://127.0.0.1:4121"].includes(req.headers.origin ?? "")) {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 64 * 1024) { res.writeHead(413).end(); return; } chunks.push(chunk); }
      // Normalize only inside this test adapter; real boundary protections stay intact.
      const request = new Request("http://localhost:4120/api/candidate", { method: "POST", headers: { host: "localhost:4120", origin: "http://localhost:4120", "sec-fetch-site": "same-origin", "x-counsel-review": req.headers["x-counsel-review"] as string, "content-type": req.headers["content-type"] ?? "" }, body: Buffer.concat(chunks) });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) for await (const chunk of response.body) res.write(chunk);
      res.end(); return;
    }
    if (req.method !== "GET" || req.url?.startsWith("/api/")) { res.writeHead(405).end(); return; }
    const response = await fetch(new URL(req.url ?? "/candidate", "http://localhost:4120"), { redirect: "manual" });
    const headers = new Headers(response.headers); headers.delete("content-encoding"); headers.delete("content-length");
    headers.set("cache-control", "no-store"); headers.set("x-software-test", "authored-responses-no-paid-calls");
    if (headers.get("content-type")?.includes("text/html")) {
      const html = (await response.text()).replace("</head>", '<style>body::before{content:"SOFTWARE TEST — authored responses, no model calls";display:block;position:sticky;top:0;z-index:9999;background:#ffdf80;color:#111;padding:10px;text-align:center;font:700 16px sans-serif}</style></head>');
      res.writeHead(response.status, Object.fromEntries(headers)).end(html);
    } else { res.writeHead(response.status, Object.fromEntries(headers)).end(Buffer.from(await response.arrayBuffer())); }
  } catch { res.writeHead(502).end("Software test proxy unavailable."); }
});
server.listen(4121, "127.0.0.1", () => console.log(JSON.stringify({ url: "http://localhost:4121/candidate", directory, paidUsd: 0, clinicalEvidence: false })));
