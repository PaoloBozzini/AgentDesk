# Example agents

Ready-made LaunchAgents, one per folder: an `agent.plist` and the script it runs. Together they cover every way launchd can start a job.

| Example                                  | Runs                      | Trigger                           | What it does                                                                               |
| ---------------------------------------- | ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| [`brew-update`](brew-update)             | 1st of every month, 09:00 | `StartCalendarInterval` (Day)     | `brew update && brew upgrade && brew cleanup`                                              |
| [`documents-backup`](documents-backup)   | every day, 21:00          | `StartCalendarInterval` (Hour)    | Copies `~/Documents` to an external disk if it's plugged in (never deletes on the backup)  |
| [`downloads-cleanup`](downloads-cleanup) | every Monday, 10:00       | `StartCalendarInterval` (Weekday) | Lists items in `~/Downloads` older than 30 days; with `MODE=trash` moves them to the Trash |
| [`disk-space-alert`](disk-space-alert)   | every hour                | `StartInterval`                   | Notification when the startup disk has less than 10% free                                  |
| [`inbox-watcher`](inbox-watcher)         | when `~/Inbox` changes    | `WatchPaths`                      | Notification with the number of items waiting                                              |
| [`local-web-server`](local-web-server)   | at login, kept running    | `RunAtLoad` + `KeepAlive`         | Serves `~/Sites` on `http://127.0.0.1:8000`, restarted if it crashes                       |

Settings live in each plist's `EnvironmentVariables` (threshold, mode, backup disk, port), so you can change them in Agent Desk's form without touching the script.

## Install

```sh
examples/install.sh brew-update           # install, don't load
examples/install.sh brew-update --load    # install and load
```

This:

- copies the script to `~/Library/Scripts/AgentDesk/<example>.sh`
- writes `~/Library/LaunchAgents/com.<you>.<example>.plist` with your home folder filled in (launchd needs absolute paths: it doesn't expand `~` or `$HOME`)
- checks it with `plutil -lint`, creates the log folder `~/Library/Logs/com.<you>.<example>/` and any folder the example needs
- never overwrites an existing file

Then select it in Agent Desk to load it, run it, read its logs or change its schedule. To remove it, use **Delete…** in Agent Desk (and delete the script from `~/Library/Scripts/AgentDesk/`).

## Things launchd does differently from your terminal

- **`PATH` is only `/usr/bin:/bin:/usr/sbin:/sbin`** and your shell profile (`~/.zshrc`, `~/.zprofile`) is not read. That's why `brew-update` sets up Homebrew itself (`brew shellenv`) instead of expecting `brew` on the `PATH`. Use absolute paths, or set `PATH` in `EnvironmentVariables`.
- **Privacy-protected folders** (`~/Desktop`, `~/Documents`, `~/Downloads`, external disks): a background job gets `Operation not permitted` until you allow it. For `documents-backup` and `downloads-cleanup`, give **`/bin/zsh`** Full Disk Access (System Settings → Privacy & Security → Full Disk Access → **+**, press ⇧⌘G and type `/bin/zsh`). `inbox-watcher` watches `~/Inbox` so it doesn't need this. `downloads-cleanup` with `MODE=trash` also asks once to control Finder.
- **Many tools print progress on stderr.** `brew` does, so `brew-update` sends everything to one log (`exec 2>&1`); otherwise normal output lands in the stderr tab.
- **Jobs that exit within 10 seconds get throttled** if they're started again right away. `inbox-watcher` waits 10 seconds so a burst of changes doesn't spam the log.
- **Missed runs:** if the Mac is asleep at the scheduled time, the job runs when it wakes; if it's shut down, that run is skipped.
