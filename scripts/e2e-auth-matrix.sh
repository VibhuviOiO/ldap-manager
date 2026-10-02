#!/usr/bin/env bash
#
# Deploy ldap-manager in each auth mode and verify RBAC with Playwright.
#
# Usage:  ./scripts/e2e-auth-matrix.sh
#
# For every scenario it starts a throwaway container on $PORT, waits for it,
# runs the RBAC spec with the role that scenario should produce, captures
# screenshots, then tears the container down. The last line summarises pass/fail
# per mode, so "is RBAC enforced in every auth mode?" is answerable in one run.
#
# Requires: docker, node/npx with the frontend dependencies installed, and
#           system Chrome (the bundled Playwright browsers are not used here).

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$REPO_ROOT/frontend"
IMAGE="${IMAGE:-ldap-manager:auth}"
PORT="${PORT:-8000}"
NETWORK="${NETWORK:-ldap-shared-network}"
CLUSTER="${AUDIT_CLUSTER:-vibhuvioio}"
ADMIN_PW="${ADMIN_PW:-ChangeMe_StrongP@ssw0rd123!}"
BASE_CONFIG="$REPO_ROOT/config.yml"
WORKDIR="$(mktemp -d)"
CONTAINER="ldap-manager-rbac"

RESULTS=()

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm ldap-rbac-data ldap-rbac-secrets >/dev/null 2>&1 || true
}
trap cleanup EXIT

log()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- helpers --

# write_config <mode> [extra auth lines...]
write_config() {
  local mode="$1"; shift
  python3 - "$BASE_CONFIG" "$WORKDIR/config.yml" "$mode" "$@" <<'PY'
import pathlib, re, sys
src, dst, mode = sys.argv[1], sys.argv[2], sys.argv[3]
extra = "\n".join("  " + line for line in sys.argv[4:])
if extra:
    extra = "\n" + extra
body = pathlib.Path(src).read_text()
body = re.sub(r"^auth:.*?\n\n(?=clusters:)",
              f"auth:\n  mode: {mode}{extra}\n\n", body, count=1, flags=re.S)
pathlib.Path(dst).write_text(body)
PY
}

deploy() {
  local config="$1"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  # Mount the working tree so the matrix always tests CURRENT code. Without
  # this it runs whatever frontend was baked into $IMAGE, and a stale bundle
  # makes the run report phantom failures.
  docker run -d --name "$CONTAINER" --network "$NETWORK" -p "${PORT}:8000" \
    -v "$REPO_ROOT/backend/app:/app/app" \
    -v "$config:/app/config.yml:ro" \
    -v ldap-rbac-data:/app/.data -v ldap-rbac-secrets:/app/.secrets \
    -e LDAP_MANAGER_CLUSTER_VIBHUVIOIO_PASSWORD="$ADMIN_PW" \
    -e LDAP_MANAGER_CONFIG_VIBHUVIOIO_PASSWORD="$ADMIN_PW" \
    "$IMAGE" >/dev/null
  for _ in $(seq 1 40); do
    sleep 1
    curl -sf "http://localhost:${PORT}/api/auth/status" >/dev/null 2>&1 && return 0
  done
  echo "  container never became ready"; return 1
}

# run_spec <label> <role> <can_write> [username] [password]
run_spec() {
  local label="$1" role="$2" can_write="$3" user="${4:-}" pass="${5:-}"
  log "$label (expect role=$role can_write=$can_write)"
  (
    cd "$FRONTEND" &&
    AUDIT_BASE_URL="http://localhost:${PORT}" \
    AUDIT_CLUSTER="$CLUSTER" \
    EXPECTED_ROLE="$role" \
    EXPECTED_CAN_WRITE="$can_write" \
    AUDIT_USERNAME="$user" \
    AUDIT_PASSWORD="$pass" \
    AUDIT_SHOTS="test-results/screenshots/$label" \
    npx playwright test -c playwright.audit.config.ts tests/e2e/audit/rbac.spec.ts
  ) >"$WORKDIR/$label.log" 2>&1
  local status=$?
  if [ $status -eq 0 ]; then
    RESULTS+=("\033[32mPASS\033[0m  $label (role=$role)")
  else
    RESULTS+=("\033[31mFAIL\033[0m  $label (role=$role)  -> $WORKDIR/$label.log")
  fi
}

# ----------------------------------------------------------------- matrix --

log "auth.mode: none  (no login; role comes from auth.default_role)"
for role in admin readonly; do
  write_config none "default_role: $role"
  deploy "$WORKDIR/config.yml" || continue
  run_spec "none-$role" "$role" "$([ "$role" = readonly ] && echo false || echo true)"
done

log "auth.mode: local  (per-user role)"
write_config local "default_role: readonly"
deploy "$WORKDIR/config.yml" || true
curl -sf -X POST "http://localhost:${PORT}/api/auth/setup" -H 'Content-Type: application/json' \
  -d '{"users":[{"username":"alice","password":"LocalPass123!","role":"admin"},
                {"username":"bob","password":"LocalPass123!","role":"readwrite"},
                {"username":"carol","password":"LocalPass123!","role":"readonly"}]}' >/dev/null
run_spec "local-admin"     admin     true  alice 'LocalPass123!'
run_spec "local-readwrite" readwrite true  bob   'LocalPass123!'
run_spec "local-readonly"  readonly  false carol 'LocalPass123!'

log "auth.mode: ldap  (group -> role)"
write_config ldap \
  "default_role: readonly" \
  "ldap:" \
  "  cluster: $CLUSTER" \
  "  user_dn_template: \"uid={username},ou=People,dc=vibhuvioio,dc=com\"" \
  "  role_map:" \
  "    default: readonly" \
  "    groups:" \
  "      \"cn=Administrators,ou=Group,dc=vibhuvioio,dc=com\": admin" \
  "      \"cn=Pandavas,ou=Group,dc=vibhuvioio,dc=com\": readwrite"
deploy "$WORKDIR/config.yml" || true
run_spec "ldap-admin"     admin     true  arjuna    'TestPass123!'
run_spec "ldap-readwrite" readwrite true  bhima     'TestPass123!'
run_spec "ldap-readonly"  readonly  false dushasana 'TestPass123!'

# restore the operator's real config
log "restoring the normal deployment"
docker rm -f ldap-manager >/dev/null 2>&1 || true
docker run -d --name ldap-manager --network "$NETWORK" -p "${PORT}:8000" \
  -v "$REPO_ROOT/backend/app:/app/app" \
  -e LDAP_MANAGER_CLUSTER_VIBHUVIOIO_PASSWORD="$ADMIN_PW" \
  -e LDAP_MANAGER_CONFIG_VIBHUVIOIO_PASSWORD="$ADMIN_PW" \
  "${IMAGE}" >/dev/null 2>&1 || true

printf '\n\033[1m=== RBAC matrix summary ===\033[0m\n'
for line in "${RESULTS[@]}"; do printf '  %b\n' "$line"; done
printf '\n  logs: %s\n' "$WORKDIR"
