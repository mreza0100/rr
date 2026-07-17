#!/usr/bin/env bash
set -euo pipefail

# PreToolUse(Edit|Write) — guards /pcm territory.
# Edits to CLAUDE.md, SKILL.md, and .claude/** are /pcm-exclusive: these files ARE
# the prompt surface — SKILL.md is the skill's runtime prompt vendored by consumer
# projects, CLAUDE.md/.claude/ the harness wiring — so a careless edit ships straight
# into live sessions. Allowed only when BOTH of THIS session's markers are fresh
# (session-keyed — concurrent sessions never share or clear each other's gate):
#   tmp/rr_pcm_active.<sid>       — /pcm is active (stamped per the deny message)
#   tmp/rr_quality_loaded.<sid>   — quality/prompt.md was READ this session
#                                   (stamped automatically by guard-stamp.sh)
# Sliding expiry: every ALLOWED edit re-touches both markers, so an active session
# never expires mid-batch; the TTL reaps only abandoned sessions. guard-stamp.sh
# clears this session's markers at turn end (Stop hook). Silent no-op elsewhere.

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
[[ -z "$FILE_PATH" ]] && exit 0

# Anchor to the EDITED FILE's repo root, not the hook's cwd — correct inside
# worktrees and regardless of where the harness spawns the hook.
REPO_ROOT=$(git -C "$(dirname "$FILE_PATH")" rev-parse --show-toplevel 2>/dev/null) || exit 0
REL_PATH="${FILE_PATH#"$REPO_ROOT"/}"

case "$REL_PATH" in
  CLAUDE.md|SKILL.md|.claude/*) ;;   # the prompt surface
  *) exit 0 ;;
esac

SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty')
ACTIVE="$REPO_ROOT/tmp/rr_pcm_active${SID:+.$SID}"
QUALITY="$REPO_ROOT/tmp/rr_quality_loaded${SID:+.$SID}"
TTL=1500
NOW=$(date +%s)

fresh() {
  [[ -f "$1" ]] || return 1
  local age=$(( NOW - $(cat "$1" 2>/dev/null || echo 0) ))
  (( age >= 0 && age < TTL ))
}

if fresh "$ACTIVE" && fresh "$QUALITY"; then
  # Sliding expiry — an active session never times out mid-batch.
  printf '%s\n' "$NOW" > "$ACTIVE"
  printf '%s\n' "$NOW" > "$QUALITY"
  exit 0
fi

REASON="This file is the repo's PROMPT SURFACE — CLAUDE.md, SKILL.md, or .claude/ wiring loaded by the harness at runtime (SKILL.md is vendored verbatim by consumer projects). You ARE authorized as the infra owner via /pcm."
if ! fresh "$QUALITY"; then
  REASON+=" DENIED — prompt-file edits require /quality:prompt loaded this session: Read .claude/commands/quality/prompt.md (the Read auto-stamps your session), then retry."
fi
if ! fresh "$ACTIVE"; then
  REASON+=" DENIED — prompt-surface edits route through /pcm: open this session's gate from the repo root: date +%s > \"tmp/rr_pcm_active${SID:+.$SID}\" — run the stamp UNSANDBOXED (a sandboxed write never lands on the filesystem this hook reads; a denied retry after stamping means the stamp ran sandboxed), then retry."
fi
REASON+=" Markers slide on every allowed edit and are cleared at turn end. Do NOT route around this by disabling the hook or editing the prompt surface outside /pcm."

jq -cn --arg r "$REASON" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
exit 2
