#!/usr/bin/env python3
"""Copy the canonical clinical-evaluation workbook into the Python output folder."""

from pathlib import Path
from shutil import copyfile


REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE = REPO_ROOT / "output" / "evaluation" / "counsel-disposition-clinical-review.xlsx"
DESTINATION = REPO_ROOT / "python" / "outputs" / "Counsel_Dispo_Evaluation.xlsx"


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(
            "Canonical clinical-review workbook is missing. Build it from the reviewed "
            "artifact workflow before creating a compatibility copy."
        )
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    copyfile(SOURCE, DESTINATION)
    print(f"Copied evidence-bounded clinical-review workbook to {DESTINATION}")


if __name__ == "__main__":
    main()
