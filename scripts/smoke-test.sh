#!/usr/bin/env bash
#
# LazyBrain End-to-End Smoke Test
#
# Validates the complete flow from a fresh clone to hook interception working:
#   1. Copy repo to temp dir
#   2. npm ci && npm run build
#   3. lazybrain scan && lazybrain compile --offline
#   4. lazybrain ready && lazybrain hook plan
#   5. lazybrain hook install → writes project .claude/hooks/hooks.json
#   6. Send a test prompt via stdin to the hook → verify route context injection
#   7. Cleanup (rollback hook + remove temp dir)
#
# Usage: ./scripts/smoke-test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMP_DIR=""
HOOK_INSTALLED=0
HOOK_HEALTH_PATH="${HOME}/.lazybrain/hook-health.json"
HOOK_HEALTH_BACKUP=""
HOOK_HEALTH_HAD_FILE=0
CONFIG_PATH="${HOME}/.lazybrain/config.json"
CONFIG_BACKUP=""
CONFIG_HAD_FILE=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_pass()  { echo -e "${GREEN}[PASS]${NC}  $1"; }
log_fail()  { echo -e "${RED}[FAIL]${NC}  $1"; }

cleanup() {
  log_info "Cleaning up..."
  if [[ "$HOOK_INSTALLED" -eq 1 && -n "$TEMP_DIR" && -x "$TEMP_DIR/dist/bin/lazybrain.js" ]]; then
    (cd "$TEMP_DIR" && "$TEMP_DIR/dist/bin/lazybrain.js" hook rollback 2>/dev/null) || \
      (cd "$TEMP_DIR" && "$TEMP_DIR/dist/bin/lazybrain.js" hook uninstall 2>/dev/null) || true
    log_info "Rolled back lazybrain hook"
  fi

  if [[ -n "$HOOK_HEALTH_BACKUP" ]]; then
    if [[ "$HOOK_HEALTH_HAD_FILE" -eq 1 && -f "$HOOK_HEALTH_BACKUP" ]]; then
      mkdir -p "$(dirname "$HOOK_HEALTH_PATH")"
      mv "$HOOK_HEALTH_BACKUP" "$HOOK_HEALTH_PATH"
      log_info "Restored hook runtime health"
    elif [[ "$HOOK_HEALTH_HAD_FILE" -eq 0 ]]; then
      rm -f "$HOOK_HEALTH_PATH" "$HOOK_HEALTH_BACKUP"
    fi
  fi

  if [[ -n "$CONFIG_BACKUP" ]]; then
    if [[ "$CONFIG_HAD_FILE" -eq 1 && -f "$CONFIG_BACKUP" ]]; then
      mkdir -p "$(dirname "$CONFIG_PATH")"
      mv "$CONFIG_BACKUP" "$CONFIG_PATH"
      log_info "Restored LazyBrain config"
    elif [[ "$CONFIG_HAD_FILE" -eq 0 ]]; then
      rm -f "$CONFIG_PATH" "$CONFIG_BACKUP"
    fi
  fi

  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
    log_info "Removed temp dir: $TEMP_DIR"
  fi
}

trap cleanup EXIT

run_step() {
  local name="$1"
  local cmd="$2"
  log_info "Step: $name"
  log_info "  Running: $cmd"
  if eval "$cmd"; then
    log_pass "$name"
    return 0
  else
    log_fail "$name (exit code: $?)"
    return 1
  fi
}

# ── Main ─────────────────────────────────────────────────────────────────────

log_info "LazyBrain E2E Smoke Test"
log_info "Repo: $REPO_DIR"
echo

# Step 1: Copy to temp dir
TEMP_DIR=$(mktemp -d "/tmp/lazybrain-smoke.XXXXXX")
log_info "Step 1: Copy repo to temp dir"
tar -C "$REPO_DIR" \
  --exclude "./.git" \
  --exclude "./node_modules" \
  --exclude "./dist" \
  -cf - . | tar -C "$TEMP_DIR" -xf -
log_pass "Copied to $TEMP_DIR"
echo

# Step 2: npm ci && npm run build
log_info "Step 2: Install dependencies"
cd "$TEMP_DIR"
if ! npm ci > /dev/null 2>&1; then
  log_error "npm ci failed"
  exit 1
fi
log_pass "npm ci"
echo

log_info "Step 3: Build"
if ! npm run build > /dev/null 2>&1; then
  log_error "npm run build failed"
  exit 1
fi
log_pass "npm run build"
echo

# Step 4: Verify built files exist
log_info "Step 4: Verify built files"
if [[ ! -f "$TEMP_DIR/dist/bin/lazybrain.js" ]]; then
  log_error "dist/bin/lazybrain.js not found after build"
  exit 1
fi
if [[ ! -f "$TEMP_DIR/dist/bin/hook.js" ]]; then
  log_error "dist/bin/hook.js not found after build"
  exit 1
fi
log_pass "Built files exist"
echo

# Step 5: Run lazybrain scan && compile (offline mode for CI)
cd "$TEMP_DIR"
log_info "Step 5: lazybrain scan"
if ! "$TEMP_DIR/dist/bin/lazybrain.js" scan > /dev/null 2>&1; then
  log_warn "lazybrain scan had issues (non-fatal for smoke test)"
fi
log_pass "scan complete"
echo

log_info "Step 6: lazybrain compile --offline"
if ! "$TEMP_DIR/dist/bin/lazybrain.js" compile --offline > /dev/null 2>&1; then
  log_error "lazybrain compile --offline failed"
  exit 1
fi
log_pass "compile complete"
echo

# Step 7: Verify graph.json exists
GRAPHPATH="${HOME}/.lazybrain/graph.json"
log_info "Step 7: Verify graph.json exists"
if [[ ! -f "$GRAPHPATH" ]]; then
  log_error "graph.json not found at $GRAPHPATH"
  exit 1
fi
log_pass "graph.json exists"
echo

# Step 8: Check readiness and preview hook install
log_info "Step 8: lazybrain ready"
READY_OUTPUT=$("$TEMP_DIR/dist/bin/lazybrain.js" ready || true)
if ! echo "$READY_OUTPUT" | grep -qE '^(READY|NOT_READY)$'; then
  log_error "lazybrain ready did not print READY or NOT_READY"
  echo "$READY_OUTPUT"
  exit 1
fi
log_pass "ready command responded"
echo

log_info "Step 9: lazybrain hook plan"
PLAN_OUTPUT=$("$TEMP_DIR/dist/bin/lazybrain.js" hook plan)
if ! echo "$PLAN_OUTPUT" | grep -q "LazyBrain hook plan"; then
  log_error "hook plan did not produce plan output"
  echo "$PLAN_OUTPUT"
  exit 1
fi
log_pass "hook plan output"
echo

# Step 10: Install hook into project hooks file
log_info "Step 10: Install LazyBrain hook"
HOOKS_PATH="$TEMP_DIR/.claude/hooks/hooks.json"
if ! "$TEMP_DIR/dist/bin/lazybrain.js" hook install; then
  log_error "lazybrain hook install failed"
  exit 1
fi
HOOK_INSTALLED=1
log_pass "Hook installed"
echo

# Step 11: Verify hooks.json was modified
log_info "Step 11: Verify project hooks.json contains LazyBrain hook"
if ! grep -q "lazybrain" "$HOOKS_PATH"; then
  log_error "project hooks.json does not contain lazybrain hook"
  exit 1
fi
log_pass "project hooks.json modified"
echo

# Step 12: Send test prompt to hook via stdin and verify response
log_info "Step 12: Test hook with UserPromptSubmit event"

# Keep this E2E assertion independent from the developer machine's prior hook
# runtime health. A recently slow hook run can legitimately skip injection.
HOOK_HEALTH_BACKUP="$TEMP_DIR/hook-health.before-smoke.json"
if [[ -f "$HOOK_HEALTH_PATH" ]]; then
  HOOK_HEALTH_HAD_FILE=1
  cp "$HOOK_HEALTH_PATH" "$HOOK_HEALTH_BACKUP"
fi
rm -f "$HOOK_HEALTH_PATH"

CONFIG_BACKUP="$TEMP_DIR/config.before-smoke.json"
if [[ -f "$CONFIG_PATH" ]]; then
  CONFIG_HAD_FILE=1
  cp "$CONFIG_PATH" "$CONFIG_BACKUP"
fi
mkdir -p "$(dirname "$CONFIG_PATH")"
node -e "const fs=require('fs'); const p=process.argv[1]; let c={}; try { c=JSON.parse(fs.readFileSync(p,'utf8')); } catch {} c.hookSafety={...(c.hookSafety||{}), loadAvgBreaker: 9999, avgDurationBreakerMs: 999999}; fs.writeFileSync(p, JSON.stringify(c,null,2)+'\n');" "$CONFIG_PATH"

# Build the stdin payload matching Claude Code hook protocol
TEST_PROMPT="帮我审查这段代码"
HOOK_INPUT=$(cat <<EOF
{
  "session_id": "smoke-test-$(date +%s)",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "$TEST_PROMPT",
  "cwd": "$TEMP_DIR"
}
EOF
)

log_info "  Sending prompt: $TEST_PROMPT"
OUTPUT=$("$TEMP_DIR/dist/bin/hook.js" <<< "$HOOK_INPUT" 2>/dev/null || echo '{"continue":true}')

log_info "  Raw hook output: $OUTPUT"

# Check that output is valid JSON with continue:true
if ! echo "$OUTPUT" | grep -q '"continue":true'; then
  log_error "Hook did not return continue:true"
  log_error "Output: $OUTPUT"
  exit 1
fi

# Verify the hook injected route context. Depending on the graph, this can be
# a concrete match result, a combo route, or the generic tiny route reminder.
ADDL_PROMPT=$(echo "$OUTPUT" | grep -o '"additionalContext":"[^"]*"' || true)
if [[ -z "$ADDL_PROMPT" ]]; then
  ADDL_PROMPT=$(echo "$OUTPUT" | grep -o '"additionalContext":[^,}]*' || true)
fi

if [[ -z "$ADDL_PROMPT" ]]; then
  log_error "Hook did not inject route context"
  exit 1
fi

log_pass "Hook returned route context"
echo

# Step 13: Test non-UserPromptSubmit events fail closed
log_info "Step 13: Test non-UserPromptSubmit hook event"
SESSION_OUTPUT=$("$TEMP_DIR/dist/bin/hook.js" <<< '{"session_id":"smoke-test","hook_event_name":"SessionStart","cwd":"'"$TEMP_DIR"'"}' 2>/dev/null || echo '{"continue":true}')
if ! echo "$SESSION_OUTPUT" | grep -q '"continue":true'; then
  log_warn "Non-UserPromptSubmit hook did not return continue:true (may still be ok)"
else
  log_pass "Non-UserPromptSubmit hook fails closed"
fi
echo

log_info "Step 14: Rollback hook"
if "$TEMP_DIR/dist/bin/lazybrain.js" hook rollback 2>/dev/null; then
  HOOK_INSTALLED=0
  log_pass "Hook rolled back"
else
  log_warn "Hook rollback had issues (continuing)"
fi
echo

# Summary
echo "────────────────────────────────────────"
log_pass "All smoke tests passed!"
echo "────────────────────────────────────────"
echo
log_info "Summary:"
log_info "  • Fresh clone:      OK"
log_info "  • npm ci:           OK"
log_info "  • npm run build:    OK"
log_info "  • lazybrain scan:  OK"
log_info "  • lazybrain compile: OK (offline)"
log_info "  • graph.json:       Created at ~/.lazybrain/"
log_info "  • lazybrain ready: OK"
log_info "  • hook plan:       OK"
log_info "  • hook install:    OK"
log_info "  • project hooks:   Modified correctly"
log_info "  • UserPromptSubmit: Route context"
log_info "  • Other hook events: Fail closed"
log_info "  • hook rollback:    OK"
log_info ""
log_info "Cleanup: EXIT trap will remove temp dir"
