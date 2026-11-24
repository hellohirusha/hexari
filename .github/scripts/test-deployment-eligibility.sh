#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT
export GITHUB_REPOSITORY="example/hexari" GITHUB_SHA="verified-sha" GITHUB_OUTPUT="$output_file"

# Simulate GitHub without making network requests or delaying negative cases.
gh() {
  if [[ "$*" == *"/git/ref/heads/main"* ]]; then
    if [[ "$TEST_SCENARIO" == stale ]]; then echo other-sha; else echo verified-sha; fi
    return
  fi
  case "$TEST_SCENARIO" in
    merged) printf '%s\n' '[[],[{"merged_at":"2026-01-01T00:00:00Z","base":{"ref":"main"},"merge_commit_sha":"verified-sha"}]]' ;;
    wrong-base) printf '%s\n' '[[{"merged_at":"2026-01-01T00:00:00Z","base":{"ref":"develop"},"merge_commit_sha":"verified-sha"}]]' ;;
    wrong-sha) printf '%s\n' '[[{"merged_at":"2026-01-01T00:00:00Z","base":{"ref":"main"},"merge_commit_sha":"other-sha"}]]' ;;
    direct-push) printf '%s\n' '[[]]' ;;
    api-error) return 1 ;;
    *) echo "Unexpected test scenario: $TEST_SCENARIO" >&2; return 1 ;;
  esac
}
sleep() { :; }
export -f gh sleep

check() {
  export TEST_SCENARIO="$1"
  : > "$output_file"
  if ! bash "$script_dir/check-deployment-eligibility.sh"; then
    echo "Scenario failed unexpectedly: $TEST_SCENARIO" >&2
    exit 1
  fi
  if [[ "$(cat "$output_file")" != "eligible=$2" ]]; then
    echo "Unexpected eligibility for $TEST_SCENARIO" >&2
    exit 1
  fi
}

check merged true
check direct-push false
check wrong-base false
check wrong-sha false
check stale false
export TEST_SCENARIO=api-error
: > "$output_file"
if bash "$script_dir/check-deployment-eligibility.sh"; then
  echo "An API failure must not permit deployment." >&2
  exit 1
fi
echo "Deployment eligibility checks passed."
