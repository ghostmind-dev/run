---
name: reset
description: Start herdr again from nothing - close every workspace, keep or build the `run` hub, then build only the project workspaces asked for, with nothing started, one profile started, or every routine started. Use when the user runs /run:reset, or says "reset my spaces", "wipe everything and open X", "start fresh", "I just restarted my computer", "herdr lost my spaces", "the spaces do not know their repository any more", "close everything and give me X and Y", "I only want the relay space", or names the set of projects they want open now.
---

# Reset the herdr spaces

After a restart of the Mac, herdr can bring workspaces back that no longer know their
project. Repairing them one by one is slower than starting again. One script does it:

```bash
"$SKILL_DIR/scripts/reset.sh" --dry-run relay            # print the plan, change nothing
"$SKILL_DIR/scripts/reset.sh" relay                      # run + relay, nothing started
"$SKILL_DIR/scripts/reset.sh" relay:mobile potion:all    # start a profile, or every routine
"$SKILL_DIR/scripts/reset.sh"                            # only the run hub
```

`SKILL_DIR` is this skill's folder. The script needs `jq` and a running herdr.

## What it does

1. **Checks** every project named, before it closes anything. An unknown project, a project
   with no herdr workspace or an unknown profile stops the script with nothing closed.
2. **Closes** every open workspace, strays included. Closing a workspace kills what runs in
   its panes.
3. **Makes sure the hub is there**: the `run` project always has a workspace. It is never
   in the list of projects; it is always kept or built.
4. **Builds** each project asked for, in the order given, without moving to it.

## What to start

Each argument is a project name, with an optional suffix:

| Argument | Effect |
|---|---|
| `relay` | Builds the workspace. Starts nothing |
| `relay:mobile` | Builds it and starts the routines of the panes in the `mobile` profile |
| `relay:all` | Builds it and starts every routine a pane names |

- **The default is to start nothing.** Add a suffix only when the user asked for processes to
  run: "start everything" is `:all`; "start the iOS side" is the profile that covers it.
- **To find the profile**, read the project: `run projects --json` gives each pane's `routine`
  and `profiles`. Tell the user which routines the profile starts.
- **One profile for each project.** When the user wants a set that no profile covers (for
  example the database with the mobile app), the fix is in the project's `meta.json`: add the
  profile name to those panes. Propose that change; do not start panes by hand to imitate it.
  A pane that must run in every way of working lists every profile.

## What it leaves alone

- **The workspace the script runs from.** Closing it would kill the session half way. When
  that workspace is the hub, it is kept as it is. When it is another project, it stays open
  and the hub is built beside it: tell the user to close it by hand if they want it gone.
- **Other machines.** Only local workspaces are closed and built.

## How to run it

1. The user's message names the projects. When it names none and they said to wipe
   everything, reset to the hub alone. When it names none and says nothing about wiping, ask
   which projects they want.
2. Run `--dry-run` first when other workspaces are open and the user did not clearly say to
   wipe them, and show them what would close. When they said "wipe everything", run directly.
3. Report in a few lines: what was closed, what was built, what was started.

When two folders carry the same project name, the script takes the one whose folder has that
name (`relay`, not `relay-block`). Say which path was built when that happens.
