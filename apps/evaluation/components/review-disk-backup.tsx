"use client";

import { useEffect, useRef, useState } from "react";
import { stableStringify, type ReviewWorkspace } from "../lib/review-state";
import type { BackupReceipt } from "../lib/review-backup-store";

const endpoint = "/api/review-backups";
const headers = { "Content-Type": "application/json", "x-counsel-review": "local-v1" };
export function ReviewDiskBackup({ workspace, onRestore }: { workspace: ReviewWorkspace; onRestore: (file: File) => void }) {
  const [message, setMessage] = useState("Disk recovery available; drafts remain in browser checkpoints.");
  const [failed, setFailed] = useState(false);
  const [backups, setBackups] = useState<BackupReceipt[] | null>(null);
  const queue = useRef(Promise.resolve());
  const latest = useRef(workspace);
  latest.current = workspace;
  const hasWork = Object.values(workspace.records).some((r) => r.blindCommittedAt || Object.values(r.draft).some(Boolean));

  function save(snapshot: ReviewWorkspace) {
    const task = queue.current.catch(() => undefined).then(async () => {
      const response = await fetch(endpoint, { method: "POST", headers, body: stableStringify(snapshot), signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("disk-backup-unavailable");
      const receipt: BackupReceipt = await response.json();
      if (latest.current === snapshot) {
        setFailed(false);
        setMessage(`Disk copy verified at ${new Date(receipt.savedAt).toLocaleTimeString()}. ${receipt.started}/50 cases started.`);
      }
    }).catch(() => {
      if (latest.current === snapshot) {
        setFailed(true);
        setMessage("Disk backup unavailable. Keep the browser open and export an audit bundle; browser-save status is shown separately.");
      }
    });
    queue.current = task;
    return task;
  }
  useEffect(() => {
    if (!hasWork) {
      setMessage("Disk recovery available; no case responses in this workspace yet.");
      setFailed(false);
      return;
    }
    setMessage("Disk copy pending; browser checkpoints save independently.");
    const timer = setTimeout(() => { void save(workspace); }, 1200);
    return () => clearTimeout(timer);
  }, [workspace, hasWork]);

  async function showBackups() {
    try {
      const response = await fetch(endpoint, { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("unavailable");
      const result = await response.json();
      setBackups(result.backups);
      if (result.unreadable) setMessage(`${result.unreadable} damaged copies were preserved and excluded from recovery choices.`);
    } catch { setFailed(true); setMessage("Disk recovery is unavailable. Browser copies and exported JSON remain separate recovery options."); }
  }
  async function restore(id: string) {
    if (!window.confirm("Restore this disk copy into the current tab? Export your current work first if you want to preserve it. Existing disk copies will not be deleted.")) return;
    try {
      const response = await fetch(`${endpoint}?id=${id}`, { headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("unavailable");
      onRestore(new File([await response.text()], "disk-review-backup.json", { type: "application/json" }));
      setBackups(null);
    } catch { setFailed(true); setMessage("That disk copy could not be restored. Your current review remains unchanged."); }
  }
  return <section aria-label="Disk recovery" className={`border-b px-5 py-3 sm:px-8 ${failed ? "border-[#efc4c0] bg-[#fff1ef]" : "border-[#dfe7e3] bg-[#f4f8f6]"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-[#31544e]">{message}</p><div className="flex gap-3"><button type="button" disabled={!hasWork} onClick={() => void save(workspace)} className="rounded-lg border border-[#aec7bc] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">Save disk copy now</button><button type="button" onClick={() => backups ? setBackups(null) : void showBackups()} className="rounded-lg border border-[#aec7bc] bg-white px-3 py-2 text-sm font-semibold">{backups ? "Close recovery copies" : "Recover disk copy"}</button></div></div>
    {backups && <div className="mt-3 space-y-2 text-sm"><p>Latest 20 copies on this computer. Restoring is explicit; browser resets do not delete these files. Export JSON for a copy on another device.</p>{backups.length === 0 ? <p>No disk copies yet.</p> : backups.map((backup) => <div key={backup.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d5e1dc] bg-white p-3"><span>{new Date(backup.savedAt).toLocaleString()} · {backup.complete}/50 complete · {backup.started}/50 started{backup.attested ? " · signed" : ""}</span><button type="button" onClick={() => void restore(backup.id)} className="font-semibold underline">Restore {backup.id.slice(0, 8)}</button></div>)}</div>}
  </section>;
}
