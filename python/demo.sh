#!/usr/bin/env bash
# Live-demo helper. Run from this directory.
set -euo pipefail
cd "$(dirname "$0")"

echo
echo "════════════════════════════════════════════════════════"
echo "  1 / 3   C08  thunderclap   CSV said ASYNC"
echo "════════════════════════════════════════════════════════"
python3 dispo_agent.py --id C08 --message "35F. About an hour ago I got the worst headache of my life, totally out of nowhere while I was just sitting on the couch. It hit like a thunderclap. My neck feels a bit stiff now too."

echo
echo "════════════════════════════════════════════════════════"
echo "  2 / 3   C06  losartan refill   CSV said URGENT"
echo "════════════════════════════════════════════════════════"
python3 dispo_agent.py --id C06 --message "Could I get a refill on my losartan? I've been on 50mg once a day for about 2 years, my blood pressure is well controlled, last home reading was 122/78."

echo
echo "════════════════════════════════════════════════════════"
echo "  3 / 3   C01  viral URI   CSV said SELF_CARE"
echo "════════════════════════════════════════════════════════"
python3 dispo_agent.py --id C01 --message "Hi, I've had a runny nose and a mild sore throat for about 2 days. No fever, I'm still eating and drinking fine. Should I be worried?"

echo
echo "Batch + scoreboard:"
echo "  python3 dispo_agent.py && python3 evaluate.py"
echo
