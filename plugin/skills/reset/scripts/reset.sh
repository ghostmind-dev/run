#!/usr/bin/env bash
# Starts herdr again from nothing: closes every workspace, makes sure the hub (the `run`
# project) has one, then builds the workspaces asked for.
#   reset.sh [--dry-run] [<project>[:<profile>|:all]]...
#     <project>            build its workspace, start nothing
#     <project>:<profile>  build it and start the routines of that profile
#     <project>:all        build it and start every routine its panes name
#     --dry-run            change nothing: print what would be closed, built and started
#
# The workspace this runs from is never closed: closing it would kill the script half way.
# Every project is checked before anything is closed, so a wrong name closes nothing.
set -uo pipefail

HUB=run
dry=0 specs=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry=1 ;;
    -*) echo "reset.sh: unknown option $arg" >&2; exit 2 ;;
    *) specs+=("$arg") ;;
  esac
done
command -v jq >/dev/null || { echo "reset.sh: jq is required" >&2; exit 1; }

projects="$(RUN_NO_MACHINES=1 run projects --json)" || { echo "reset.sh: run projects --json failed" >&2; exit 1; }
[ "$(jq -r '.herdr.isRunning' <<<"$projects")" = true ] || { echo "reset.sh: herdr is not running" >&2; exit 1; }

# Two folders can carry the same project name: the one whose folder has that name wins.
project() {
  jq -c --arg n "$1" '[.projects[] | select(.machine == "local" and .name == $n)]
    | (map(select(.path | endswith("/" + $n))) | first) // first // empty' <<<"$projects"
}

hub="$(project "$HUB")"
[ -n "$hub" ] || { echo "reset.sh: the $HUB project was not found under $(jq -r .root <<<"$projects")" >&2; exit 1; }

plan=() bad=0
for spec in ${specs[@]+"${specs[@]}"}; do
  name="${spec%%:*}" profile=""
  [ "$spec" = "$name" ] || profile="${spec#*:}"
  [ "$name" = "$HUB" ] && continue
  p="$(project "$name")"
  if [ -z "$p" ]; then
    echo "reset.sh: no project named $name" >&2; bad=1; continue
  fi
  if [ "$(jq -r '.status' <<<"$p")" = "no herdr" ]; then
    echo "reset.sh: $name defines no herdr workspace" >&2; bad=1; continue
  fi
  if [ -n "$profile" ] && [ "$profile" != all ] &&
    ! jq -e --arg f "$profile" 'any(.routines[]; .profiles | index($f))' <<<"$p" >/dev/null; then
    echo "reset.sh: $name has no profile $profile (it has: $(jq -r '[.routines[].profiles[]] | unique | join(", ")' <<<"$p"))" >&2
    bad=1; continue
  fi
  plan+=("$(jq -r '[.label, .path] | @tsv' <<<"$p")"$'\t'"$profile")
done
[ "$bad" = 0 ] || { echo "reset.sh: nothing was closed" >&2; exit 2; }

here="${HERDR_WORKSPACE_ID:-}"
hub_kept=0

echo "== Closed"
closed=0
while IFS=$'\t' read -r id label; do
  [ -n "$id" ] || continue
  if [ "$id" = "$here" ]; then
    echo "  kept    $label ($id): this session runs in it"
    [ "$label" = "$HUB" ] && hub_kept=1
    continue
  fi
  closed=1
  if [ "$dry" = 1 ]; then
    echo "  would close  $label ($id)"
  elif herdr workspace close "$id" >/dev/null 2>&1; then
    echo "  closed  $label ($id)"
  else
    echo "  ! could not close $label ($id)"
  fi
done < <(herdr workspace list | jq -r '.result.workspaces[] | [.workspace_id, .label] | @tsv')
[ "$closed" = 1 ] || echo "  nothing else was open"

build() { # label path profile
  local label="$1" path="$2" profile="$3" args=(--all --no-focus) what="nothing started"
  case "$profile" in
    "") ;;
    all) args+=(--start); what="every routine started" ;;
    *) args+=(--start --profile "$profile"); what="profile $profile started" ;;
  esac
  if [ "$dry" = 1 ]; then
    echo "  would build  $label ($path): $what"
  elif out="$(cd "$path" && run herdr init "$label" "${args[@]}" 2>&1)"; then
    echo "  built   $label ($path): $what"
  else
    echo "  ! $label failed: $(tail -1 <<<"$out")"
  fi
}

echo "== Built"
if [ "$hub_kept" = 1 ]; then
  echo "  kept    $HUB: already there"
else
  build "$(jq -r .label <<<"$hub")" "$(jq -r .path <<<"$hub")" ""
fi
for line in ${plan[@]+"${plan[@]}"}; do
  IFS=$'\t' read -r label path profile <<<"$line"
  build "$label" "$path" "$profile"
done
