#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="/tmp/ssbc-agent-preflight-sbot.log"

is_sbot_running() {
  node -e "
    const net = require('net')
    const socket = net.connect({ host: '127.0.0.1', port: 8989 })
    socket.once('connect', function () {
      socket.end()
      process.exit(0)
    })
    socket.once('error', function () { process.exit(1) })
    setTimeout(function () { process.exit(1) }, 1000)
  " >/dev/null 2>&1
}

cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "agent:preflight must run from an ssbc git checkout" >&2
  exit 1
fi

echo "Updating $(git branch --show-current)..."
git pull --ff-only

if is_sbot_running; then
  echo "sbot is already listening at http://127.0.0.1:8989"
else
  echo "Starting sbot (log: $LOG_FILE)..."
  nohup node bin.js start >"$LOG_FILE" 2>&1 < /dev/null &
  sbot_pid=$!

  for _ in $(seq 1 20); do
    if is_sbot_running; then
      echo "sbot started (pid $sbot_pid) at http://127.0.0.1:8989"
      break
    fi
    sleep 0.5
  done

  if ! is_sbot_running; then
    echo "sbot did not start within 10 seconds; inspect $LOG_FILE" >&2
    exit 1
  fi
fi

echo
echo "Git status:"
git status --short

echo
echo "Remotes:"
git remote -v

if ! ssb_url="$(git remote get-url ssb 2>/dev/null)"; then
  echo "WARNING: no ssb remote is configured; finished work cannot be pushed over SSB." >&2
elif [[ "$ssb_url" == ssb://* ]]; then
  echo "WARNING: ssb uses legacy ssb:// transport; change it to the local HTTP git endpoint." >&2
else
  echo "ssb remote: $ssb_url"
fi

echo
echo "Latest commits:"
git log -1 --oneline HEAD
if git show-ref --verify --quiet refs/remotes/origin/main; then
  git log -1 --oneline origin/main
fi
