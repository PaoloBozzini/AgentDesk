#!/bin/zsh
# Serves ~/Sites on http://127.0.0.1:$PORT. Starts at login; launchd restarts it
# if it crashes (KeepAlive SuccessfulExit = false), not if it exits cleanly.
mkdir -p "$HOME/Sites"
cd "$HOME/Sites" || exit 1
exec /usr/bin/python3 -m http.server "${PORT:-8000}" --bind 127.0.0.1
