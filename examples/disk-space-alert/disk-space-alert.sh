#!/bin/zsh
# Every hour: notify when the startup disk has less than MIN_FREE_PERCENT free.
min=${MIN_FREE_PERCENT:-10}
# df -k on the data volume: used% is column 5 (e.g. "87%")
used=$(df -k /System/Volumes/Data | awk 'NR == 2 { sub("%", "", $5); print $5 }')
free=$((100 - used))
echo "$(date '+%Y-%m-%d %H:%M') free: ${free}%"
if (( free < min )); then
  osascript -e "display notification \"Only ${free}% free on the startup disk.\" with title \"Low disk space\""
fi
