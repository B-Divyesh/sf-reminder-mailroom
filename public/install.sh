#!/bin/sh
set -eu

MANIFEST_URL="https://github.com/B-Divyesh/sf-reminder-mailroom/releases/latest/download/latest.json"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

case "$(uname -s)" in
  Darwin)
    case "$(uname -m)" in arm64) PLATFORM="macos_arm64" ;; *) PLATFORM="macos_x64" ;; esac
    ;;
  Linux) PLATFORM="linux" ;;
  *) printf '%s\n' "Reminder Mailroom supports macOS, Windows, and Linux." >&2; exit 1 ;;
esac

curl -fsSL "$MANIFEST_URL" -o "$TMP_DIR/latest.json"
LINE="$(tr -d '\n ' < "$TMP_DIR/latest.json")"
BLOCK="$(printf '%s' "$LINE" | sed -n "s/.*\"$PLATFORM\":{\([^}]*\)}.*/\1/p")"
URL="$(printf '%s' "$BLOCK" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')"
EXPECTED="$(printf '%s' "$BLOCK" | sed -n 's/.*"sha256":"\([^"]*\)".*/\1/p')"

if [ -z "$URL" ] || [ -z "$EXPECTED" ]; then
  printf '%s\n' "No installer was listed for $PLATFORM. See the latest GitHub release." >&2
  exit 1
fi

ASSET="$TMP_DIR/$(basename "$URL")"
curl -fL "$URL" -o "$ASSET"
if command -v sha256sum >/dev/null 2>&1; then ACTUAL="$(sha256sum "$ASSET" | awk '{print $1}')"; else ACTUAL="$(shasum -a 256 "$ASSET" | awk '{print $1}')"; fi
if [ "$ACTUAL" != "$EXPECTED" ]; then
  printf '%s\n' "Checksum mismatch; the installer was not opened." >&2
  exit 1
fi

if [ "$(uname -s)" = "Darwin" ]; then
  MOUNT="$TMP_DIR/mount"
  mkdir "$MOUNT"
  hdiutil attach "$ASSET" -nobrowse -mountpoint "$MOUNT" >/dev/null
  APP="$(find "$MOUNT" -maxdepth 1 -name '*.app' -print -quit)"
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
  cp -R "$APP" "$DEST/"
  hdiutil detach "$MOUNT" >/dev/null
  printf '%s\n' "Installed Reminder Mailroom in $DEST. Because this build is unsigned, Control-click it and choose Open the first time."
else
  DEST="$HOME/.local/bin"
  mkdir -p "$DEST"
  cp "$ASSET" "$DEST/reminder-mailroom"
  chmod 755 "$DEST/reminder-mailroom"
  printf '%s\n' "Installed verified AppImage at $DEST/reminder-mailroom"
  case ":$PATH:" in *":$DEST:"*) ;; *) printf '%s\n' "Add $DEST to PATH to launch it as reminder-mailroom." ;; esac
fi
