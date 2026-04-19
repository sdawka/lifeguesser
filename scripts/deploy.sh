#!/usr/bin/env bash
#
# Deploy lifeguesser to Cloudflare Pages production.
#
# Usage:
#   scripts/deploy.sh                       # build + deploy worker
#   scripts/deploy.sh --migrate <file.sql>  # apply a SQL migration to remote D1, then deploy
#   scripts/deploy.sh --seed <file.sql>     # apply a seed SQL file to remote D1, then deploy
#   scripts/deploy.sh --skip-deploy         # only run the --migrate/--seed steps
#
# Prerequisites:
#   - wrangler logged in (`npx wrangler login`)
#   - on a clean working tree (the script refuses to deploy with uncommitted changes
#     unless --dirty is passed)
#
set -euo pipefail

PROJECT_NAME="lifeguesser"
DB_NAME="lifeguesser-db"
BRANCH="main"

cd "$(git rev-parse --show-toplevel)"

DEPLOY=true
DIRTY_OK=false
MIGRATIONS=()
SEEDS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --migrate)
      [[ -n "${2:-}" ]] || { echo "--migrate requires a SQL file" >&2; exit 2; }
      MIGRATIONS+=("$2"); shift 2 ;;
    --seed)
      [[ -n "${2:-}" ]] || { echo "--seed requires a SQL file" >&2; exit 2; }
      SEEDS+=("$2"); shift 2 ;;
    --skip-deploy) DEPLOY=false; shift ;;
    --dirty) DIRTY_OK=true; shift ;;
    -h|--help)
      sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if ! $DIRTY_OK && [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit, stash, or pass --dirty." >&2
  git status --short >&2
  exit 1
fi

run_remote_sql() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "SQL file not found: $file" >&2
    exit 1
  fi
  echo ">> applying to remote D1: $file"
  npx wrangler d1 execute "$DB_NAME" --remote --file="$file"
}

for f in ${MIGRATIONS[@]+"${MIGRATIONS[@]}"}; do run_remote_sql "$f"; done
for f in ${SEEDS[@]+"${SEEDS[@]}"};           do run_remote_sql "$f"; done

if $DEPLOY; then
  echo ">> building Astro"
  npx astro build

  echo ">> deploying to Cloudflare Pages ($PROJECT_NAME, branch=$BRANCH)"
  npx wrangler pages deploy dist --project-name "$PROJECT_NAME" --branch "$BRANCH" --commit-dirty=true
fi

echo "done."
