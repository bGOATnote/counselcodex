#!/usr/bin/env python3
"""Compare V0 predictions with development labels; do not infer clinical performance."""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path


ORDER = ["SELF_CARE", "ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON", "EMERGENCY_NOW"]

# Illustrative asymmetric cost. Rows = reference-proposal routes, cols = predicted.
# Missed urgent is an order of magnitude worse than over-triage.
COST = {
    ("SELF_CARE", "SELF_CARE"): 0,
    ("SELF_CARE", "ASYNC_PHYSICIAN"): 1,
    ("SELF_CARE", "SAME_DAY_IN_PERSON"): 3,
    ("SELF_CARE", "EMERGENCY_NOW"): 4,
    ("ASYNC_PHYSICIAN", "SELF_CARE"): 4,
    ("ASYNC_PHYSICIAN", "ASYNC_PHYSICIAN"): 0,
    ("ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON"): 2,
    ("ASYNC_PHYSICIAN", "EMERGENCY_NOW"): 3,
    ("SAME_DAY_IN_PERSON", "SELF_CARE"): 18,
    ("SAME_DAY_IN_PERSON", "ASYNC_PHYSICIAN"): 15,
    ("SAME_DAY_IN_PERSON", "SAME_DAY_IN_PERSON"): 0,
    ("SAME_DAY_IN_PERSON", "EMERGENCY_NOW"): 2,
    ("EMERGENCY_NOW", "SELF_CARE"): 30,
    ("EMERGENCY_NOW", "ASYNC_PHYSICIAN"): 25,
    ("EMERGENCY_NOW", "SAME_DAY_IN_PERSON"): 12,
    ("EMERGENCY_NOW", "EMERGENCY_NOW"): 0,
}

ESCALATED = {"SAME_DAY_IN_PERSON", "EMERGENCY_NOW"}
LEGACY_ORDER = ["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"]
LEGACY_COST = {
    ("SELF_CARE", "SELF_CARE"): 0,
    ("SELF_CARE", "ASYNC_PHYSICIAN"): 1,
    ("SELF_CARE", "URGENT_ESCALATION"): 3,
    ("ASYNC_PHYSICIAN", "SELF_CARE"): 4,
    ("ASYNC_PHYSICIAN", "ASYNC_PHYSICIAN"): 0,
    ("ASYNC_PHYSICIAN", "URGENT_ESCALATION"): 2,
    ("URGENT_ESCALATION", "SELF_CARE"): 25,
    ("URGENT_ESCALATION", "ASYNC_PHYSICIAN"): 20,
    ("URGENT_ESCALATION", "URGENT_ESCALATION"): 0,
}


def legacy_disposition(value: str) -> str:
    return "URGENT_ESCALATION" if value in ESCALATED else value


def load(path: Path) -> dict[str, dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return {r["id"]: r for r in csv.DictReader(f)}


def metrics(pairs: list[tuple[str, str]]) -> dict:
    n = len(pairs)
    acc = sum(g == p for g, p in pairs) / n if n else 0
    labels = ORDER
    per = {}
    for lab in labels:
        tp = sum(g == lab and p == lab for g, p in pairs)
        fp = sum(g != lab and p == lab for g, p in pairs)
        fn = sum(g == lab and p != lab for g, p in pairs)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        per[lab] = {
            "support": tp + fn,
            "precision": round(prec, 3),
            "recall": round(rec, 3),
            "f1": round(f1, 3),
        }
    cm = defaultdict(int)
    for g, p in pairs:
        cm[(g, p)] += 1
    cost = sum(COST[(g, p)] for g, p in pairs)
    # Safety diagnostic: distinguish any escalation from immediate emergency.
    escalation_reference = [(g, p) for g, p in pairs if g in ESCALATED]
    escalation_recall = (
        sum(p in ESCALATED for _, p in escalation_reference) / len(escalation_reference)
        if escalation_reference
        else 0
    )
    pred_escalated = [(g, p) for g, p in pairs if p in ESCALATED]
    escalation_precision = (
        sum(g in ESCALATED for g, _ in pred_escalated) / len(pred_escalated) if pred_escalated else 0
    )
    return {
        "n": n,
        "accuracy": round(acc, 3),
        "weighted_cost": cost,
        "mean_cost": round(cost / n, 3) if n else 0,
        "escalation_recall": round(escalation_recall, 3),
        "escalation_precision": round(escalation_precision, 3),
        "emergency_recall": round(per["EMERGENCY_NOW"]["recall"], 3),
        "emergency_precision": round(per["EMERGENCY_NOW"]["precision"], 3),
        "per_class": per,
        "confusion": {f"{g}->{p}": v for (g, p), v in sorted(cm.items())},
    }


def legacy_metrics(pairs: list[tuple[str, str]]) -> dict:
    n = len(pairs)
    correct = sum(reference == predicted for reference, predicted in pairs)
    per = {}
    for label in LEGACY_ORDER:
        tp = sum(reference == label and predicted == label for reference, predicted in pairs)
        fp = sum(reference != label and predicted == label for reference, predicted in pairs)
        fn = sum(reference == label and predicted != label for reference, predicted in pairs)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        per[label] = {
            "support": tp + fn,
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1": round(2 * precision * recall / (precision + recall), 3) if precision + recall else 0.0,
        }
    escalated = [(reference, predicted) for reference, predicted in pairs if reference == "URGENT_ESCALATION"]
    predicted_escalated = [(reference, predicted) for reference, predicted in pairs if predicted == "URGENT_ESCALATION"]
    true_positive = sum(predicted == "URGENT_ESCALATION" for _, predicted in escalated)
    return {
        "n": n,
        "accuracy": round(correct / n, 3) if n else 0,
        "weighted_cost": sum(LEGACY_COST[pair] for pair in pairs),
        "escalation_recall": round(true_positive / len(escalated), 3) if escalated else 0,
        "escalation_precision": round(true_positive / len(predicted_escalated), 3) if predicted_escalated else 0,
        "per_class": per,
    }


def main() -> None:
    here = Path(__file__).resolve().parent
    pred = load(here / "outputs" / "predictions.csv")
    # Legacy filename retained for compatibility. Its content is an unattested
    # reference proposal, not a completed physician review.
    reference_proposal = load(here / "data" / "clinician_development_review.csv")
    raw = load(here / "data" / "patient_messages.csv")

    vs_proposal = []
    vs_provided = []
    provided_vs_proposal = []
    rows_out = []
    for i in raw:
        proposal = reference_proposal[i]["clinician_disposition"]
        p = pred[i]["disposition"]
        provided = raw[i]["disposition"]
        vs_proposal.append((proposal, p))
        vs_provided.append((provided, legacy_disposition(p)))
        provided_vs_proposal.append((legacy_disposition(proposal), provided))
        rows_out.append(
            {
                "id": i,
                "message": raw[i]["message"],
                "provided": provided,
                "proposal_disposition": proposal,
                "proposal_subtype": reference_proposal[i]["clinician_subtype"],
                "proposal_rationale": reference_proposal[i]["clinical_rationale"],
                "predicted": p,
                "pred_subtype": pred[i]["subtype"],
                "pred_layer": pred[i]["layer"],
                "pred_confidence": pred[i]["confidence"],
                "rationale": pred[i]["rationale"],
                "matches_reference_proposal": proposal == p,
                "match_provided": provided == legacy_disposition(p),
                "provided_matches_reference_proposal": provided == legacy_disposition(proposal),
                "agreement_with_supplied": reference_proposal[i]["agreement_with_supplied"],
                "supplied_label_error_type": reference_proposal[i]["supplied_label_error_type"],
                "harm_if_follow_supplied": reference_proposal[i]["harm_if_follow_supplied"],
                "illustrative_cost_vs_proposal": COST[(proposal, p)],
            }
        )

    report = {
        "conclusion": {
            "clinical_performance_estimate": None,
            "reference_standard_established": False,
            "release_readiness_established": False,
            "reason": (
                "No untouched representative holdout exists; the prototype was "
                "authored against an unattested 50-case reference proposal."
            ),
        },
        "physician_review": {
            "status": "awaiting-physician-attestation",
            "reviewed_cases": 0,
            "proposed_cases": len(raw),
            "consensus_reference_cases": 0,
            "development_leakage": True,
            "completion_source": "integrity-hashed export from the physician review instrument",
        },
        "development_set_replay": {
            "inference_allowed": False,
            "interpretation": (
                "Software fit to labels used during implementation; not a "
                "clinical-performance estimate."
            ),
            "diagnostics": metrics(vs_proposal),
        },
        "supplied_workflow_vs_reference_proposal": {
            "inference_allowed": False,
            "interpretation": (
                "Hypothesis-generating comparison against an unattested proposal; "
                "not physician review or consensus truth."
            ),
            "diagnostics": legacy_metrics(provided_vs_proposal),
        },
        "prototype_vs_supplied_labels": {
            "inference_allowed": False,
            "diagnostics": legacy_metrics(vs_provided),
        },
        "reference_proposal_distribution": dict(Counter(g for g, _ in vs_proposal)),
        "provided_distribution": dict(Counter(p for _, p in provided_vs_proposal)),
        "predicted_distribution": dict(Counter(p for _, p in vs_proposal)),
    }

    out_json = here / "outputs" / "metrics.json"
    out_json.write_text(json.dumps(report, indent=2))

    out_csv = here / "outputs" / "evaluation_cases.csv"
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows_out[0].keys()), lineterminator="\n")
        w.writeheader()
        w.writerows(rows_out)

    misses = [r for r in rows_out if not r["matches_reference_proposal"]]
    provided_wrong = [r for r in rows_out if r["agreement_with_supplied"] == "disagree"]

    print("=" * 72)
    print("CLINICAL PERFORMANCE: NOT ESTIMATED")
    print(json.dumps(report["conclusion"], indent=2))
    print("=" * 72)
    print("DEVELOPMENT REPLAY vs REFERENCE PROPOSAL  (software diagnostic only)")
    print(json.dumps(report["development_set_replay"], indent=2))
    print("=" * 72)
    print("SUPPLIED LABELS vs REFERENCE PROPOSAL  (hypothesis generation only)")
    print(json.dumps(report["supplied_workflow_vs_reference_proposal"], indent=2))
    print("=" * 72)
    print(f"Prototype mismatches vs unattested reference proposal: {len(misses)}")
    for r in misses:
        print(
            f"  {r['id']} proposal={r['proposal_disposition']} "
            f"pred={r['predicted']} layer={r['pred_layer']}"
        )
        print(f"      {r['message'][:110]}")
    print(f"\nProvided-label disagreements with reference proposal: {len(provided_wrong)}")
    for r in provided_wrong:
        print(
            f"  {r['id']} provided={r['provided']} "
            f"proposal={r['proposal_disposition']}  "
            f"[{r['supplied_label_error_type']}]"
        )


if __name__ == "__main__":
    main()
