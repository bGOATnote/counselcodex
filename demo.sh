#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

run_case() {
  local title="$1"
  local id="$2"
  local message="$3"
  echo
  echo "════════════════════════════════════════════════════════"
  echo "  ${title}"
  echo "════════════════════════════════════════════════════════"
  node src/run.mjs route --id "$id" --message "$message"
}

run_case \
  "1 / 3   C08  thunderclap   provided label: ASYNC" \
  "C08" \
  "35F. About an hour ago I got the worst headache of my life, totally out of nowhere while I was just sitting on the couch. It hit like a thunderclap. My neck feels a bit stiff now too."

run_case \
  "2 / 3   C06  losartan refill   provided label: URGENT" \
  "C06" \
  "Could I get a refill on my losartan? I've been on 50mg once a day for about 2 years, my blood pressure is well controlled, last home reading was 122/78."

run_case \
  "3 / 3   C01  viral URI   provided label: SELF_CARE" \
  "C01" \
  "Hi, I've had a runny nose and a mild sore throat for about 2 days. No fever, I'm still eating and drinking fine. Should I be worried?"

echo
echo "Run the full scorecard with: node src/run.mjs evaluate"

