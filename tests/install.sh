#!/bin/sh
set -eu

# Execute the published POSIX installer against a tiny local curl shim. This
# proves the checksum gate is reached before the AppImage is placed on PATH.
# @claim:installer-checksum
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT INT TERM
mkdir -p "$WORK/bin" "$WORK/home"
PAYLOAD='verified-reminder-mailroom'
HASH=$(printf '%s' "$PAYLOAD" | sha256sum | awk '{print $1}')
OS=$(uname -s)
if [ "$OS" = Darwin ]; then
  PLATFORM='macos_arm64'
  ASSET='Reminder.Mailroom.dmg'
else
  PLATFORM='linux'
  ASSET='reminder.AppImage'
fi

printf '%s\n' '#!/bin/sh' 'set -eu' "out=''" "url=''" 'while [ $# -gt 0 ]; do' '  case "$1" in' '    -o) out="$2"; shift 2;;' '    *) url="$1"; shift;;' '  esac' 'done' 'case "$url" in' "  *latest.json) printf '%s' '{\"platforms\":{\"$PLATFORM\":{\"url\":\"https://example.invalid/$ASSET\",\"sha256\":\"$HASH\"}}}' > \"\$out\" ;;" "  *$ASSET) printf '%s' '$PAYLOAD' > \"\$out\" ;;" '  *) exit 1 ;;' 'esac' > "$WORK/bin/curl"
chmod +x "$WORK/bin/curl"
if [ "$OS" = Darwin ]; then
  printf '%s\n' '#!/bin/sh' 'if [ "$1" = attach ]; then' '  shift; mount=""' '  while [ $# -gt 0 ]; do' '    if [ "$1" = -mountpoint ]; then mount="$2"; shift 2; else shift; fi' '  done' '  mkdir -p "$mount/Reminder Mailroom.app"' 'fi' 'exit 0' > "$WORK/bin/hdiutil"
  chmod +x "$WORK/bin/hdiutil"
fi

PATH="$WORK/bin:$PATH" HOME="$WORK/home" sh "$ROOT/public/install.sh" > "$WORK/output"
if [ "$OS" = Darwin ]; then
  test -d "$WORK/home/Applications/Reminder Mailroom.app"
  grep -q 'Installed Reminder Mailroom' "$WORK/output"
else
  test -x "$WORK/home/.local/bin/reminder-mailroom"
  test "$(sed -n '1p' "$WORK/home/.local/bin/reminder-mailroom")" = "$PAYLOAD"
  grep -q 'Installed verified AppImage' "$WORK/output"
fi

# Stock BSD find does not support the GNU-only option that previously broke
# the macOS branch.
if grep -Eq '^[[:space:]]*APP=.*find.*(-maxdepth|-quit)' "$ROOT/public/install.sh"; then
  printf '%s\n' 'install.sh contains a GNU-only find option' >&2
  exit 1
fi
