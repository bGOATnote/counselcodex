"use client";

import { useEffect } from "react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Evaluation workbench render failure", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f8f6] px-6 py-12 text-[#173c39]">
      <section className="w-full max-w-xl rounded-3xl border border-[#d9e4df] bg-white p-8 shadow-[0_24px_80px_rgba(18,61,56,.10)]">
        <div className="grid size-11 place-items-center rounded-2xl bg-[#fae8e5] font-black text-[#9b3733]">!</div>
        <p className="mt-6 text-[10px] font-bold uppercase tracking-[.14em] text-[#8c625f]">Recoverable workspace error</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-.04em]">The review view stopped safely.</h1>
        <p className="mt-4 leading-7 text-[#5f7772]">The last verified browser checkpoint should still be intact. Reload it before entering more work. If this repeats, use Recovery to export the preserved checkpoint and damaged payload.</p>
        {error.digest && <p className="mt-4 rounded-xl bg-[#f5f8f6] px-4 py-3 font-mono text-xs text-[#627a74]">Incident reference: {error.digest}</p>}
        <div className="mt-7 flex flex-wrap gap-3">
          <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-[#176b56] px-5 py-3 text-sm font-bold text-white hover:bg-[#115846]">Reload last checkpoint</button>
          <button type="button" onClick={reset} className="rounded-xl border border-[#b9cbc5] bg-white px-5 py-3 text-sm font-bold text-[#41655e] hover:border-[#7fa497]">Retry view</button>
        </div>
      </section>
    </main>
  );
}
