#!/bin/zsh
# Runs whenever ~/Inbox changes: notify how many items it holds.
# launchd only watches; this script decides what to do (move, convert, upload…).
# Not on the Desktop: Desktop, Documents and Downloads need Full Disk Access.
inbox="$HOME/Inbox"
[[ -d $inbox ]] || exit 0
count=$(find "$inbox" -mindepth 1 -maxdepth 1 ! -name '.*' | wc -l | tr -d ' ')
echo "$(date '+%Y-%m-%d %H:%M:%S') $count item(s) in Inbox"
osascript -e "display notification \"$count item(s) waiting.\" with title \"Inbox changed\""
# launchd throttles jobs that exit in under 10 s; a short pause avoids log warnings
sleep 10
