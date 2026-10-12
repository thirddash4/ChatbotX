#!/bin/sh

set -eu

WORKER_DIST_DIR="${WORKER_DIST_DIR:-/app/apps/worker/dist}"
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"

# --enable-source-maps resolves production stack traces back to original TypeScript
# source. Exported so every worker launched below (loop and single-worker exec) inherits it.
export NODE_OPTIONS="${NODE_OPTIONS:-} --enable-source-maps"

# Map a built bundle (dir + file basename without .mjs) to its roster name.
# Standard:  <dir>/worker.mjs            -> <dir>
# Variants:  <dir>/worker-<suffix>.mjs   -> <dir>-<suffix>, with aliases below
#            to preserve the historical sequence-* CLI names.
map_worker_name() {
  dir="$1"
  file="$2"
  if [ "$file" = "worker" ]; then
    echo "$dir"
    return 0
  fi
  case "${dir}/${file}" in
    "sequence-scheduler/worker-producer") echo "sequence-producer" ;;
    "sequence-scheduler/worker-consumer") echo "sequence-consumer" ;;
    *) echo "${dir}-${file#worker-}" ;;
  esac
}

# Scan dist/ and emit a "name|path" line per built worker bundle, sorted.
# The roster is derived from what was actually built, so it can never drift
# from the tsdown entrypoints or reference a worker that does not exist.
discover_workers() {
  for path in "$WORKER_DIST_DIR"/*/worker*.mjs; do
    [ -f "$path" ] || continue   # skip the literal pattern when nothing matches
    rel="${path#"$WORKER_DIST_DIR"/}"
    dir="${rel%%/*}"
    file="${rel##*/}"
    file="${file%.mjs}"
    printf '%s|%s\n' "$(map_worker_name "$dir" "$file")" "$path"
  done | sort
}

WORKER_TABLE="$(discover_workers)"

all_worker_names() {
  printf '%s\n' "$WORKER_TABLE" | cut -d'|' -f1
}

print_usage() {
    names="$(all_worker_names | tr '\n' '|' | sed 's/|$//')"
    echo "Usage: ${0} worker [standalone|core|all${names:+|}${names}]" >&2
    echo "       ${0} {bash|sh}" >&2
}

resolve_worker_script() {
  line="$(printf '%s\n' "$WORKER_TABLE" | awk -F '|' -v worker="$1" '$1 == worker { print; exit }')"
  [ -n "$line" ] || return 1
  printf '%s\n' "${line#*|}"
}

require_script() {
  if [ ! -f "$1" ]; then
    echo "Worker script not found: $1" >&2
    exit 4
  fi
}

case "${1:-}" in
    "worker")
        if [ "$#" -gt 2 ]; then
            print_usage
            exit 3
        fi

        worker="${2:-standalone}"
        case "$worker" in
          all | standalone | core)
            [ "$worker" != "all" ] || worker="standalone"
            script="$WORKER_DIST_DIR/$worker.mjs"
            require_script "$script"
            exec "$NODE_BIN" "$script"
            ;;
          sequence-*)
            echo "Kafka workers are disabled in this deployment" >&2
            exit 3
            ;;
        esac
        case ",${WORKER_DISABLE:-}," in
          *",$worker,"*)
            echo "Worker is disabled: $worker" >&2
            exit 3
            ;;
        esac

        script="$(resolve_worker_script "$worker")" || {
          print_usage
          exit 3
        }
        require_script "$script"
        exec "$NODE_BIN" "$script"
        ;;
    "/bin/sh" | "sh" | "/bin/bash" | "bash")
        exec "$@"
        ;;
    *)
        print_usage
        exit 3
        ;;
esac
