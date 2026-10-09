---
name: run
description: How the Ghostmind `run` CLI works - the `run projects` dashboard, herdr workspaces, routines and meta.json. Use when the user mentions `run projects`, `run routine`, `run herdr`, the projects dashboard or TUI, opening, starting or closing a project's workspace, or when writing or editing a meta.json (routines, herdr tabs and panes, a pane's routine or profiles, a project's colour, tags, groups, type project/app), or wants project colours in herdr's sidebar shown or hidden (`run herdr colors`). Also use when a routine fails, a project is missing from the dashboard, or a workspace shows as a stray.
---

# run

`run` is the command that operates Ghostmind projects on the Mac. It has three
commands and everything it knows comes from each folder's `meta.json`.

| Command | What it does |
|---|---|
| `run projects` | The dashboard: every project, its herdr workspace, its git state. Where almost all the work happens |
| `run routine <name>` | Runs an entry of the folder's `routines` |
| `run herdr …` | Builds and closes herdr workspaces from the command line |

`run --version` prints the version. `run -p <folder> <command>` runs a command
as if started in that folder.

## The dashboard: `run projects`

A full-screen table of every project under the root, refreshed every 2 seconds.
Run it in a herdr pane.

**The root** is `--root <path>`, else `$RUN_PROJECT`, else the current folder.

**A project** is a folder whose `meta.json` has `"type": "project"`. Folders
with `"type": "app"` below it are its apps: they count in the APPS column and
never get a row. A folder with no `type`, or no `meta.json`, is not listed.

| Column | Meaning |
|---|---|
| MACHINE | `local`, or the label of the saved herdr machine the project is on (see *Other machines*) |
| ORG | The GitHub organization or user the repository is pushed to (its `origin` remote). `none`: no repository, or no remote yet |
| BRANCH | Checked-out branch. `no git`: not a repository. `<name> (local)`: no remote. `<sha> detached`: no branch |
| CHANGES | A number: uncommitted files. `↑n`: commits not pushed. `↓n`: commits not pulled (as of the last fetch). `clean`: nothing pending. `-`: no repository |
| STATUS | See below |
| TABS, PANES | The open workspace's size, from herdr |
| AGENTS | How many of the workspace's coding agents are working, out of how many it holds (`1 of 2`). `-`: it holds none. The pane view shows each one |
| GROUPS, TAGS | The project's `groups` and `tags`. TAGS lists the tags in `meta.json` order, as many whole ones as fit, then `+n`: click the tags or press `i` to see them all |

**Status** only describes herdr:

- `open`: the project has a workspace in herdr. `focused`: it is the one on screen.
- `here`: the workspace the dashboard itself runs in. It is never closed from the dashboard.
- `closed`: no workspace. `no herdr`: the project defines none.
- `offline`: the project is on another machine that does not answer right now; it cannot be acted on.
- `stray`: a herdr workspace whose label matches no project.

A workspace belongs to a project by its **label**, not by any folder: changing
directory inside a pane changes nothing.

### Keys

| Key | Action |
|---|---|
| up/down, `j`/`k`, wheel | Move. Click selects a row |
| `tab`, left/right | Choose a button. `enter` presses it; `1`-`3` press directly; click works |
| `space` | Mark a row. `A` marks every row in view. Marked rows are the target |
| `a` | Only open projects |
| `v` | The saved views, each with its rules. `enter` applies one, `d` deletes it, `e` opens the settings file to add or change one. `[` and `]` step to the previous and next view; `0` goes back to all projects. A view stays applied until changed: `/`, `a` and `t` narrow inside it and `esc` does not remove it |
| `t` | Pick a tag or a group: `enter` narrows the table to it, `o` opens all its closed projects |
| `/` | Filter by name, folder, tag or group |
| `o` | Sort by the next column, then by none; `O` reverses the direction. A click on a column title does the same, in the table and in the pane view. Works on every screen, each with its own order, and is remembered |
| `esc` | Clear the filter, the scope and the marks |
| `p` | Show the panes of an open project (see below) |
| `r` | Rescan the folders (picks up `meta.json` edits) |
| `R` | Restart the dashboard (picks up a new version of `run`) |
| `T` | Next colour theme |
| `,` | This screen's settings: which of its columns show. Works on the projects, the tabs, a tab's panes and all panes, each with its own choice |
| shift+`,` | The dashboard's settings: theme and how the pane view opens. Both are saved in `~/.config/run/projects.json` |
| `?` | List every key. The header only shows the ones that fit the width |
| `q` | Quit |

### Buttons

- **Open**: builds the workspace of each closed target, in the background. It never switches to it: moving between workspaces is done in herdr.
- **Close**: closes the workspace, which kills everything running in its panes. Asks first.
- **Close others**: closes every open workspace except the target and `here`, strays included. Asks first.

When an open builds a workspace whose panes name routines, the dashboard lists
them, all ticked, and asks which to start: `space` ticks or unticks the one
under the cursor, `a` all of them, `enter` or `y` opens and starts the ticked
ones, `n` opens the panes empty. The choice is not remembered.

When panes name **profiles**, the question shows them on a line (`all`, each
profile, `none`): `p` or the left and right arrows step through them, ticking
exactly the routines of that profile. Ticks can still be changed by hand after.

The usual switch of context: go to the `here` row, **Close others**, then mark
the projects wanted and **Open**, or `t`, pick the group and `o`; then `enter`.

### The panes of an open project

`p` on an open project (or **Open** on it) opens its pane view, which has two
levels and one alternative listing:

- **Tabs**: one line per tab, with how many panes it has, how many name a routine, and how many are running something. `enter` goes into a tab.
- **A tab's panes**: each pane, the routine it names, and what is running in it now (`idle`, a command, or an agent and its state). `esc` or left goes back to the tabs.
- **All panes** (`f`): every pane of every tab in one list. `f` again returns to the tabs. The choice is remembered: the pane view opens the same way next time.

`s` starts the selected line: a pane's routine, or every pane of a tab. `S`
starts every idle pane that names a routine. On a pane, `enter` lists the
routines of the `meta.json` its tab comes from (the pane's own one marked as
default) and runs the one chosen; `s` does the same when the pane names none. Only an idle shell is typed into:
a pane already running something is skipped. `esc` at the tabs returns to the
projects.

`run projects --dry-run` shows what each action would do without doing it.
`run projects --list` prints the table once.

## Asking what is there, as an agent

Do not read the screen or walk the folders: ask `run` for JSON.

| Command | Answers |
|---|---|
| `run projects --json` | Every project: `name`, `machine`, `status`, `label` (its workspace label), `path`, `folder`, `org` and `repo` (where it is pushed, `null` when nowhere), `branch`, `changes`, `tags`, `groups`, `apps`, the `routines` its panes name, the `tabs` of its workspace with the routines each could run, and its open `workspace` (id, size, agents) or `null`. Also the `root`, whether herdr runs, and the saved `views` |
| `run projects --json --view <name>` | The same, for the projects of one view |
| `run projects --json --panes` | Adds `panes` to each open project: every pane's `paneId`, `tab`, `name`, `cwd`, `routine`, whether it is idle or holds an agent, and what is `running` |

Typical questions and where the answer is:

- *Which projects have work to commit or push?* `changes` is neither `clean` nor `null`.
- *What is running right now?* `--panes`, then the panes whose `isIdle` is false.
- *Where is project X and what can it run?* its `path`, and `tabs[].routines`.
- *Which projects are open, and which have an agent working?* `workspace` is not `null`; `workspace.agents[].status`.

`status` is one of `open`, `focused`, `here`, `closed`, `no herdr`, `stray`.
The output reflects the moment it is asked; nothing is cached.

## Other machines

The table also lists the projects of every machine saved in herdr
(`herdr machine add <ssh-host>`), with that machine's label in MACHINE. Opening
one builds its workspace **on that machine**: its panes and routines run there,
and herdr shows the workspace in its sidebar under that machine.

- **How it reads them:** this machine runs `run projects --json` on the other one over SSH, about every 10 seconds, and merges the answer. So the other machine needs `run` (0.12 or later), `herdr` and its projects.
- **How it acts:** Open runs `run herdr init` there; Close runs `herdr workspace close` there. **Close others** only closes workspaces on the machines its targets are on.
- **When a machine does not answer:** its rows stay, dimmed, with status `offline`, and nothing can be done to them. The header says which machines are online.
- **The same project on two machines** is two rows: each has its own branch and changes.
- **The pane view (`p`) works for another machine too:** its panes are read and its routines started through `herdr --machine <label>`, and `--json --panes` includes them. It refreshes a little slower than a local one.
- Setting `RUN_NO_MACHINES=1` lists this machine only.

## Views: saved filters

A view is a named rule for which projects the table lists. The header always
names the view in force; `all`, every project, is the default and cannot be
deleted. Views are created
by editing the settings file, `~/.config/run/projects.json`; the dashboard
applies and deletes them but does not create them.

```json
{
  "views": {
    "music": { "tags": ["music"] },
    "ensemble": { "groups": ["ensemble", "agents"] },
    "learning": { "folders": ["library"] },
    "work": { "folders": ["ghostmind"], "openOnly": true },
    "todo": { "changes": "pending" },
    "apps": { "orgs": ["ghostmind-app"] },
    "unpublished": { "orgs": ["none"] },
    "closed": { "status": ["closed"] }
  },
  "startView": "work"
}
```

| Rule | A project passes when |
|---|---|
| `tags` | it has at least one of these tags |
| `groups` | it belongs to at least one of these groups |
| `folders` | it sits in one of these top-level folders (the FOLDER column) |
| `machines` | it is on one of these machines: `local`, or a saved machine's label (the MACHINE column) |
| `orgs` | its repository is pushed to one of these organizations or users (the ORG column); `none` takes the projects with no remote |
| `openOnly` | it has a workspace open in herdr |
| `changes` | `"pending"`: it has uncommitted files or commits to push or pull. `"clean"`: it has none. A folder with no repository passes neither |
| `status` | its STATUS is one of these: `open` (which also takes `focused` and `here`), `closed`, `no herdr`, `stray` |

A project is listed when it passes every rule the view gives; a rule left out
lets everything through. `startView` names the view the dashboard opens in;
`run projects --view <name>` overrides it, and works with `--list`.

**To add or change a view as an agent:**

1. Read `~/.config/run/projects.json` (create it as `{}` when missing).
2. Add or replace the entry under `views`, keeping every other key of the file as it is (`theme`, `panes`, `hidden` belong to the dashboard).
3. Use only tags, groups, folders and organizations that exist: `run projects --json` gives each project's `folder`, `org`, `groups` and `tags`.
4. Check it: `run projects --list --view <name>` prints exactly the projects the view lists, and fails with a message when the name is not found.

A dashboard that is already open picks the change up on `v` or `r`; no restart
is needed. To make a view match more projects, add the tag or group to those
projects' `meta.json` instead of widening the view.

## meta.json

```json
{
  "id": "aB3dE6gH9jK2",
  "name": "music",
  "type": "project",
  "description": "What it is",
  "tags": ["audio"],
  "groups": ["band"],
  "routines": {
    "dev": "skaffold dev",
    "migrate": "bash scripts/migrate.sh"
  },
  "herdr": { "workspaces": [] }
}
```

- `id` is 12 random characters; `name` is what the dashboard shows.
- `tags` describe the project. `groups` name sets of projects worked on together, wherever their folders are.
- Fetch the schema before editing the `herdr` block: `https://raw.githubusercontent.com/ghostmind-dev/run/refs/heads/main/meta/schema.json`.

## Routines

`run routine <name>` runs the entry from the `routines` of the `meta.json` in
the current folder. With no name it asks which one.

- **There is no shell.** The command is split on spaces. Anything with `cd`, `&&`, pipes, quotes or redirects goes in `scripts/<name>.sh`, and the routine is `bash scripts/<name>.sh`.
- `run routine a b` runs several routines at once. A routine cannot call other routines by name.

## Herdr workspaces

One project is one workspace, named by `label`. Each `meta.json` (the
project's and each app's) contributes tabs to it.

```json
"herdr": {
  "workspaces": [{
    "label": "music",
    "tabs": [{
      "label": "ui",
      "prefix": false,
      "layout": "compact",
      "compact": {
        "type": "main-side",
        "panes": [
          { "name": "server", "routine": "dev", "description": "dev server, long-running" },
          { "name": "shell", "description": "ad-hoc commands" }
        ]
      }
    }]
  }]
}
```

- Compact types: `single` (1 pane), `vertical` and `horizontal` (2), `main-side` (3), `two-by-two` (4).
- A pane starts in the folder of the `meta.json` that defines its tab.
- `routine` names the routine the pane usually runs. One per pane; it only runs when asked.
- `profiles` lists the profiles a pane is part of, on a pane that names a `routine`: `"profiles": ["web", "mobile"]`. A profile is a set of routines started together, for one way of working on the project. Names have no spaces. A pane can be in several, and a pane in none only starts under `all` or by hand. Each app's `meta.json` tags its own panes, so a profile spans the project's apps. There is no list of profiles to declare: a profile exists because a pane names it.
- `"prefix": false` keeps the tab label as written; otherwise it is prefixed with the app's name.
- `"focus": true` on a pane or a tab chooses what is active inside the workspace; it never moves you there. Only `"focus": true` on the workspace itself does, and only from the command line.

From the command line, in the project's folder:

| Command | Effect |
|---|---|
| `run herdr init <label> --all` | Builds the workspace from every `meta.json` of the project. Tabs that exist are skipped |
| `… --start` | Also types `run routine <name>` into each new pane that names one |
| `… --start --only <tab/pane,...>` | Starts only those panes; the tab is named as herdr shows it, with its app prefix |
| `… --start --profile <name>` | Starts only the panes whose `profiles` include that name |
| `… --reset` | Closes the workspace first |
| `… --no-focus` | Ignores a workspace's `"focus": true`: you stay where you are. The dashboard always passes it |
| `run herdr terminate <label>` | Closes it |
| `run herdr list` | Lists open workspaces |
| `run herdr colors [on\|off]` | Shows or hides every project's colour in herdr's sidebar. **With no argument it toggles**, so pass `on` or `off` unless a toggle is what was asked |

### Project colours

A project can have a colour: a small `■` beside its workspace in herdr's sidebar.

- **Set it** with `"color"` on the workspace in the project's own `meta.json`, next to `label`: `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple` or `pink`. Any other value is ignored.
- **Switch all of them** with `run herdr colors on` or `run herdr colors off`. The choice is kept (`colors` in `~/.config/run/projects.json`) and applies at once to every open workspace; a workspace built later follows it. `on` prints how many open workspaces were marked.
- **There is no command to read the state**: `run herdr colors` alone changes it. Read `colors` in `~/.config/run/projects.json` instead (absent means on).
- **How it reaches herdr:** `run` reports one token per workspace through herdr's API (`herdr workspace report-metadata <id> --source run --token color_<name>=■`, and `--clear-token color_<name>` for the others). herdr only paints a token its own config names, so `~/.config/herdr/config.toml` must list the `$color_*` tokens with their colours under `[ui.sidebar.spaces]`; after editing it, `herdr server reload-config`.
- **A colour does not show**: colours are off, the value is not one of the eight, the workspace's label matches no project, or herdr's config lacks that `$color_*` token.

## Traps

- **A project is missing from the dashboard**: its root `meta.json` lacks `"type": "project"`, or it sits more than four folders below the root.
- **A workspace shows as `stray`**: its label matches no project's first workspace label.
- **A routine prints nothing or fails on `&&`**: it needs a shell; move it to a script.
- **Routines did not start**: they start only when a workspace is built with `--start` or with `y` in the dashboard, and only in panes created by that build. An open workspace is never typed into.
- **Another machine shows as `offline`**: `ssh <target> run --version` must work without a password and print a version; the PATH of a command sent over SSH is not the PATH of a terminal there.
- **A view lists nothing**: its rules are combined with *and*; a project must pass all of them. Check the spelling against `run projects --list`, and that the tag or group is in the project's own `meta.json`, not an app's.
- **`-c/--cible` and `-e/--env`** load legacy `.env` files and are on their way out; apps with a `.env.schema` never use them.
