#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

current_main() {
  gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq '.object.sha'
}

if [ "$(current_main)" != "$GITHUB_SHA" ]; then
  echo "The verified commit is no longer the tip of main."
  echo "eligible=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

# The commit-to-pull-request association may take a short time to appear.
# --slurp preserves every page as an array, including an empty result.
for attempt in 1 2 3 4 5; do
  pull_requests="$(gh api --paginate --slurp "repos/$GITHUB_REPOSITORY/commits/$GITHUB_SHA/pulls")"
  matches="$(printf '%s' "$pull_requests" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { input += chunk; });
    process.stdin.on("end", () => {
      const pages = JSON.parse(input);
      if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
        throw new Error("Unexpected pull request API response");
      }
      const eligible = pages.flat().some(pr =>
        pr && pr.merged_at && pr.base?.ref === "main" &&
        pr.merge_commit_sha === process.env.GITHUB_SHA
      );
      console.log(eligible ? "true" : "false");
    });
  ')"
  if [ "$matches" = "true" ]; then
    if [ "$(current_main)" = "$GITHUB_SHA" ]; then
      echo "eligible=true" >> "$GITHUB_OUTPUT"
      echo "The current main commit is a merged pull request."
    else
      echo "eligible=false" >> "$GITHUB_OUTPUT"
      echo "Main moved while checking the merged pull request."
    fi
    exit 0
  fi
  if [ "$attempt" -lt 5 ]; then sleep 3; fi
done

echo "eligible=false" >> "$GITHUB_OUTPUT"
echo "The commit is not associated with a merged pull request into main."
