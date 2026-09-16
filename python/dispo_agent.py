#!/usr/bin/env python3
"""Compatibility CLI for the authoritative TypeScript routing workflow.

This module intentionally contains no independent clinical rules. Maintaining a
second rules engine caused silent safety drift. Synthetic/demo data only.
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def neutralize_spreadsheet_formula(value: object) -> object:
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


@dataclass
class Disposition:
    id: str | None
    disposition: str
    subtype: str
    confidence: str
    rationale: str
    red_flags: list[str]
    patient_directive: str
    layer: str
    hits: list[str]


def route(message: str, msg_id: str | None = None) -> Disposition:
    if not isinstance(message, str) or not message.strip():
        raise ValueError("message must be a non-empty string")
    command = ["node", "src/run.mjs", "route", "--message", message]
    if msg_id is not None:
        command.extend(["--id", msg_id])
    completed = subprocess.run(
        command,
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        timeout=15,
    )
    payload = json.loads(completed.stdout)
    red_flags = payload.get("redFlags", [])
    return Disposition(
        id=payload.get("id"),
        disposition=payload["disposition"],
        subtype=payload["subtype"],
        confidence=payload["confidence"],
        rationale=payload["rationale"],
        red_flags=red_flags,
        patient_directive=payload["patientDirective"],
        layer=payload["layer"],
        hits=red_flags or [payload["subtype"]],
    )


def load_messages(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Counsel disposition compatibility CLI")
    parser.add_argument("--input", default=str(here / "data" / "patient_messages.csv"))
    parser.add_argument("--out", default=str(here / "outputs" / "predictions.csv"))
    parser.add_argument("--message", default=None, help="Classify one synthetic message")
    parser.add_argument("--id", default=None)
    args = parser.parse_args()

    if args.message:
        print(json.dumps(asdict(route(args.message, args.id)), indent=2))
        return

    rows = load_messages(Path(args.input))
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "id", "disposition", "subtype", "confidence", "layer", "hits",
        "red_flags", "rationale", "patient_directive", "message",
        "provided_disposition",
    ]
    with out_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            result = route(row["message"], row["id"])
            payload = asdict(result)
            payload["hits"] = "|".join(result.hits)
            payload["red_flags"] = "|".join(result.red_flags)
            payload["message"] = row["message"]
            payload["provided_disposition"] = row["disposition"]
            payload = {key: neutralize_spreadsheet_formula(value) for key, value in payload.items()}
            writer.writerow(payload)
            print(f"{result.id:4}  {result.disposition:20}  [{result.layer}]  {result.hits}")
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
