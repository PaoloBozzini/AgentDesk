#!/bin/zsh
# Every Monday 10:00: list items in ~/Downloads older than OLDER_THAN_DAYS.
# MODE=report (default) only logs them; MODE=trash moves them to the Trash
# (recoverable from there).
mode=${MODE:-report}
days=${OLDER_THAN_DAYS:-30}
echo "== $(date '+%Y-%m-%d %H:%M') mode=$mode older than $days days"
find "$HOME/Downloads" -mindepth 1 -maxdepth 1 -mtime "+$days" -print0 |
  while IFS= read -r -d '' item; do
    echo "$item"
    if [[ $mode == trash ]]; then
      # Finder's move keeps "Put Back" working
      osascript -e 'on run argv' -e 'tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)' -e 'end run' "$item" >/dev/null
    fi
  done
