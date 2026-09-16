import { parseCsv } from '../../src/lib/csv.mjs';

// IDs here are assertions against the supplied cohort, never the source of a displayed ID.
export const CONTINUATION_GUI_CASES = [
  { runId: '8eba97f2-81ab-4406-a82e-9d2b008194f5', expectedCaseId: 'C30', description: 'rash' },
  { runId: '4c34d547-34e0-461b-a53e-59dddee5c094', expectedCaseId: 'C02', description: 'chest pressure' },
  { runId: 'd0a6dbe9-00bd-4af9-9597-6a06942723ba', expectedCaseId: null, description: 'Active EMS update' },
  { runId: '7ce06a63-a61d-497d-9a07-a21685080bf4', expectedCaseId: 'C50', description: 'usual migraine' },
  { runId: 'feb420c0-201d-456c-92af-7bfaef8f1154', expectedCaseId: null, description: 'New neurological update' },
  { runId: 'deba20d6-812e-4558-9dc3-f902c528ec5d', expectedCaseId: 'C04', description: 'diabetic foot' },
  { runId: '333c0f75-eb4c-41ff-af4e-e2fd1fb92bb0', expectedCaseId: null, description: 'New airway update' },
];

export function resolveDeckCaseLabels(csv, runs, specifications = CONTINUATION_GUI_CASES) {
  const cases = parseCsv(csv);
  const specs = new Map(specifications.map(spec => [spec.runId, spec]));
  if (specs.size !== specifications.length) throw new Error('Duplicate presentation run specification.');
  const seen = new Set();
  return runs.map(run => {
    if (seen.has(run.runId)) throw new Error(`Duplicate presentation run: ${run.runId}`);
    seen.add(run.runId);
    const spec = specs.get(run.runId);
    if (!spec) throw new Error(`No presentation specification for run ${run.runId}`);
    if (typeof run.message !== 'string') throw new Error(`Missing exact message for ${run.runId}`);
    const matches = cases.filter(item => item.message === run.message);
    if (matches.length > 1) throw new Error(`Ambiguous original case for ${run.runId}`);
    const caseId = matches[0]?.id ?? null;
    if (caseId !== spec.expectedCaseId) throw new Error(`Presentation case mismatch for ${run.runId}: expected ${spec.expectedCaseId}, exact message is ${caseId}`);
    return { runId: run.runId, caseId, label: caseId ? `${caseId} ${spec.description}` : spec.description };
  });
}
