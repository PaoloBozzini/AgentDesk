#!/bin/zsh
# Monthly Homebrew update (1st of the month, 09:00).
# brew prints its progress on stderr: send everything to one log.
exec 2>&1
# launchd's PATH is /usr/bin:/bin:/usr/sbin:/sbin and it doesn't read your shell
# profile, so set up Homebrew's environment here.
if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"   # Apple silicon
elif [[ -x /usr/local/bin/brew ]]; then
  eval "$(/usr/local/bin/brew shellenv)"      # Intel
else
  echo "Homebrew not found" >&2
  exit 1
fi
echo "== $(date '+%Y-%m-%d %H:%M') brew update"
brew update && brew upgrade && brew cleanup
