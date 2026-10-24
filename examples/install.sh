#!/bin/bash
# Install an example agent for the current user.
#
#   examples/install.sh <example> [--load]
#
# Copies the script to ~/Library/Scripts/AgentDesk/, writes
# ~/Library/LaunchAgents/com.<you>.<example>.plist with your home folder filled
# in, checks it with plutil, and creates the folders it needs. Never overwrites
# an existing file. With --load the agent is also loaded (launchctl bootstrap).
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
name=${1:-}
load=${2:-}

usage() {
  echo "usage: $0 <example> [--load]" >&2
  echo "examples:" >&2
  for d in "$here"/*/; do echo "  $(basename "$d")" >&2; done
  exit 1
}

[[ -n $name && $name =~ ^[a-z0-9-]+$ && -f $here/$name/agent.plist ]] || usage
[[ -z $load || $load == --load ]] || usage

# Label segment from the user name: lowercase, anything else becomes "-"
user=$(id -un | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_\n-' '-')
label="com.$user.$name"
scripts="$HOME/Library/Scripts/AgentDesk"
script="$scripts/$name.sh"
plist="$HOME/Library/LaunchAgents/$label.plist"

[[ -e $plist ]] && { echo "Already exists: $plist" >&2; exit 1; }
[[ -e $script ]] && { echo "Already exists: $script" >&2; exit 1; }

mkdir -p "$scripts" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/$label"
install -m 755 "$here/$name/$name.sh" "$script"

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
sed -e "s|__HOME__|$HOME|g" -e "s|__USER__|$user|g" "$here/$name/agent.plist" > "$tmp"
/usr/bin/plutil -lint -s "$tmp"

# Folders the example expects (launchd won't start a job whose WorkingDirectory is missing)
case $name in
  inbox-watcher) mkdir -p "$HOME/Inbox" ;;
  local-web-server) mkdir -p "$HOME/Sites" ;;
esac

install -m 644 "$tmp" "$plist"
echo "Installed $label"
echo "  plist:  $plist"
echo "  script: $script"
echo "  logs:   $HOME/Library/Logs/$label/"

if [[ $load == --load ]]; then
  launchctl bootstrap "gui/$(id -u)" "$plist"
  echo "Loaded. Run it now with: launchctl kickstart gui/$(id -u)/$label"
else
  echo "Not loaded. Load it from Agent Desk, or: launchctl bootstrap gui/$(id -u) \"$plist\""
fi
