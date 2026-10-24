#!/bin/zsh
# Every day at 21:00: copy ~/Documents to an external disk, if it's plugged in.
# Never deletes anything on the backup (no --delete).
volume=${BACKUP_VOLUME:-/Volumes/Backup}
dest="$volume/$(id -un)-Documents"
echo "== $(date '+%Y-%m-%d %H:%M')"
if [[ ! -d $volume ]]; then
  echo "$volume not mounted, skipping"
  exit 0
fi
mkdir -p "$dest"
/usr/bin/rsync -a --stats "$HOME/Documents/" "$dest/"
