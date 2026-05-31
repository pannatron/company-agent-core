#!/bin/bash
# office-gen.sh — generate one GPT-Image-2 asset and download it.
#
# Wraps .claude/skills/gpt-image-2-gen/scripts/gpt-image-gen.sh:
#   - extracts the EvoLink key from dashboard/.env.local (grep, source is flaky)
#   - submits the prompt, polls, parses IMAGE_URL, downloads to --out
#   - on POLL_TIMEOUT it tells you the task_id so you can recover via the API
#
# Usage:
#   scripts/office-gen.sh "<prompt>" --out <path.png> [--size 1:1|WxH] \
#       [--quality low|medium|high] [--resolution 1K|2K|4K] [--image url,url]
#
# Run it backgrounded and tail the .log next to --out:
#   nohup scripts/office-gen.sh "..." --out a.png > a.png.log 2>&1 &
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GEN="$ROOT/.claude/skills/gpt-image-2-gen/scripts/gpt-image-gen.sh"

PROMPT="${1:-}"
shift || true
OUT=""
PASS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    *) PASS+=("$1"); shift ;;
  esac
done

[[ -z "$PROMPT" ]] && { echo "ERROR: prompt required"; exit 2; }
[[ -z "$OUT" ]] && { echo "ERROR: --out required"; exit 2; }
[[ -f "$GEN" ]] || { echo "ERROR: gen script missing at $GEN"; exit 2; }

# --- key (mixed-case var name, source unreliable → grep-extract) ---
KEY=$(grep -i '^[[:space:]]*Evolink_API_KEY[[:space:]]*=' "$ROOT/dashboard/.env.local" \
  | head -1 | sed -E 's/^[^=]*=[[:space:]]*//; s/^["'\'']//; s/["'\'']$//' | tr -d '\r\n')
[[ -z "$KEY" ]] && { echo "ERROR: Evolink_API_KEY not found in dashboard/.env.local"; exit 2; }
export EVOLINK_API_KEY="$KEY"

mkdir -p "$(dirname "$OUT")"

echo "OFFICE_GEN_START out=$OUT"
RAW=$(bash "$GEN" "$PROMPT" "${PASS[@]}" 2>&1)
echo "$RAW"

URL=$(echo "$RAW" | grep -oE 'https://files\.evolink\.ai/[^" ]+\.(png|jpg|jpeg)' | head -1)
if [[ -z "$URL" ]]; then
  echo "OFFICE_GEN_NO_URL — check log above (POLL_TIMEOUT? recover with task_id)"
  exit 1
fi

curl -sS --max-time 120 "$URL" -o "$OUT"
# Verify PNG magic bytes (89 50 4e 47). od collapses spaces unpredictably, so
# normalise whitespace before matching.
SIG=$(head -c 4 "$OUT" | od -An -tx1 | tr -s ' \n' ' ' | sed 's/^ //;s/ $//')
if [[ -s "$OUT" && "$SIG" == "89 50 4e 47" ]]; then
  echo "OFFICE_GEN_OK out=$OUT bytes=$(wc -c < "$OUT") url=$URL"
else
  echo "OFFICE_GEN_BAD_DOWNLOAD out=$OUT sig=[$SIG] url=$URL"
  exit 1
fi
