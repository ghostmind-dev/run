# @ghostmind/run

`run` operates a folder full of projects from the terminal. It has three commands:

| Command | What it does |
|---|---|
| `run projects` | A full-screen dashboard: every project, its herdr workspace, its git state. Open, start and close workspaces from it |
| `run routine <name>` | Runs a named command from the folder's `meta.json` |
| `run herdr …` | Builds and closes herdr workspaces from the command line |

Everything `run` knows comes from a `meta.json` file in each project.

- [Install](#install)
- [Quick start](#quick-start)
- [The dashboard](#the-dashboard)
- [Views](#views)
- [For scripts and agents](#for-scripts-and-agents)
- [Settings](#settings)
- [Routines](#routines)
- [Herdr workspaces](#herdr-workspaces)
- [meta.json reference](#metajson-reference)
- [Command reference](#command-reference)
- [Claude skill](#claude-skill)

## Install

`run` needs [Deno](https://deno.com) 2. The dashboard and the `herdr` commands also need `herdr` and `git` on the PATH.

```bash
deno install --allow-all --global --name run jsr:@ghostmind/run/cmd
```

Tell `run` where your projects are, in your shell profile:

```bash
export RUN_PROJECT=/path/to/projects
```

Without it, `run projects` uses the folder it is started from.

## Quick start

1. Give a project a `meta.json` at its root:

   ```json
   {
     "id": "aB3dE6gH9jK2",
     "name": "music",
     "type": "project",
     "routines": { "dev": "npm run dev" },
     "herdr": {
       "workspaces": [{
         "label": "music",
         "tabs": [{
           "label": "dev",
           "prefix": false,
           "layout": "compact",
           "compact": {
             "type": "vertical",
             "panes": [
               { "name": "server", "routine": "dev" },
               { "name": "shell" }
             ]
           }
         }]
       }]
     }
   }
   ```

2. Run `run projects` in a herdr pane. The project is listed as `closed`.
3. Press `enter` on it (the Open button). Answer `y` to start its routines.

The workspace is built in the background with two panes, and `npm run dev` is running in the first.

## The dashboard

`run projects` lists every project under the root and refreshes every 2 seconds.

A **project** is a folder whose `meta.json` has `"type": "project"`. Folders with `"type": "app"` below it are its apps: they are counted, not listed. The scan goes four folders deep.

### Columns

| Column | Meaning |
|---|---|
| NAME | The `name` of the project's `meta.json` |
| FOLDER | The top-level folder it sits in |
| ORG | The GitHub organization or user its repository is pushed to, from the `origin` remote. `none`: no repository, or no remote yet |
| BRANCH | The checked-out git branch. `no git`: not a repository. `<name> (local)`: no remote. `<sha> detached`: no branch |
| CHANGES | A number: uncommitted files. `↑n`: commits not pushed. `↓n`: commits not pulled, as of the last fetch. `clean`: nothing pending. `-`: no repository |
| STATUS | See below |
| TABS, PANES | The size of the open workspace |
| AGENTS | How many coding agents in the workspace are working, out of how many it holds (`1 of 2`). `-`: none |
| APPS | How many apps the project has |
| GROUPS, TAGS | From the project's `meta.json`. TAGS lists the tags in `meta.json` order, as many whole ones as fit, then `+n`: click the tags or press `i` to see them all |

### Status

Status only describes herdr.

| Status | Meaning |
|---|---|
| `open` | The project has a workspace open in herdr |
| `focused` | Open, and it is the workspace on screen |
| `here` | Open, and it is the workspace the dashboard runs in. It is never closed from the dashboard |
| `closed` | No workspace |
| `no herdr` | The project defines no workspace |
| `stray` | A herdr workspace whose label matches no project |

A workspace belongs to a project by its **label**. Changing folder inside a pane changes nothing.

### Buttons

Move between buttons with `tab` or the left and right arrows, press with `enter`, or click.

| Button | Effect |
|---|---|
| **Open** | Builds the workspace of each closed target, in the background. It never switches you to it. On a project that is already open, it shows its panes |
| **Close** | Closes the workspace, which stops everything running in its panes. Asks first |
| **Close others** | Closes every open workspace except the targets and `here`, strays included. Asks first |

The **target** is the row under the cursor, or every marked row when some are marked.

When an Open builds a workspace whose panes name a routine, the dashboard lists them and asks: `y` starts them, `n` opens the panes empty.

### Keys

| Key | Action |
|---|---|
| up, down, `j`, `k`, wheel | Move. A click selects a row |
| `enter` | Press the focused button. `1`, `2`, `3` press a button directly |
| `space` | Mark a row. `A` marks every row in view |
| `p` | Show the panes of an open project |
| `v` | Pick a saved view. `[` and `]` step through them, `0` returns to all projects |
| `t` | Pick a tag or a group: `enter` narrows the table to it, `o` opens all its closed projects |
| `a` | Only open projects |
| `/` | Search by name, folder, tag or group |
| `o` | Sort by the next column, then by none; `O` reverses the direction. A click on a column title does the same |
| `esc` | Clear the search, the tag or group, and the marks. The view stays |
| `,` | Choose the columns of the screen in view |
| shift+`,` | Theme and other settings of the whole dashboard |
| `T` | Next theme |
| `r` | Rescan the folders and reread the settings file |
| `R` | Restart the dashboard, picking up a new version of `run` |
| `?` | List every key |
| `q` | Quit |

### The panes of an open project

`p` on an open project lists its tabs. Each line shows how many panes the tab has, how many name a routine, and how many are running something.

- `enter` goes into a tab and lists its panes: the routine each one names, and what is running in it now (`idle`, a command, or an agent and its state).
- `f` switches to one list of every pane, and back.
- `s` starts the selected line: a pane's routine, or every pane of a tab. `S` starts every idle pane that names a routine.
- `enter` on a pane lists the routines of the `meta.json` its tab comes from, and runs the one you pick.
- `esc` goes back.

Only an idle shell is ever typed into. A pane that is already running something is skipped.

## Views

A view is a saved rule for which projects the table lists. Use views to keep a long list down to what you are working on. The header always names the view in force. `all`, every project, is the default one and cannot be deleted.

Views are written in the settings file, `~/.config/run/projects.json`. The dashboard applies and deletes them; it does not create them. In the views list, `e` opens the file.

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
| `tags` | It has at least one of these tags |
| `groups` | It belongs to at least one of these groups |
| `folders` | It sits in one of these top-level folders |
| `orgs` | Its repository is pushed to one of these organizations or users. `none` takes the projects with no remote |
| `openOnly` | It has a workspace open in herdr |
| `changes` | `"pending"`: it has uncommitted files or commits to push or pull. `"clean"`: it has none. A folder with no repository passes neither |
| `status` | Its STATUS is one of these: `open` (which also takes `focused` and `here`), `closed`, `no herdr`, `stray` |

A project is listed when it passes every rule the view gives. A rule left out lets everything through.

- **Apply:** `]` or `[` to step through the views, or `v` to pick one.
- **Back to everything:** `0`.
- **It stays applied.** Searching with `/`, `a` and `t` only look inside the view, and `esc` does not remove it.
- **Start in one:** `"startView"` in the file, or `run projects --view <name>`.
- **Check one:** `run projects --list --view <name>` prints exactly what it lists.

## For scripts and agents

`run projects --json` prints everything the dashboard knows, as JSON: each project's name, status, path, folder, organization and repository, branch, changes, tags, groups, apps, routines, workspace tabs and open workspace. Add `--view <name>` to limit it to a saved view, and `--panes` to include what every pane of the open projects is running.

```bash
# projects with something to commit or push
run projects --json | jq -r '.projects[] | select(.changes != "clean" and .changes != null) | .name'
```

## Settings

`~/.config/run/projects.json` holds what the dashboard remembers:

| Key | Set with | Meaning |
|---|---|---|
| `theme` | `T`, or shift+`,` | `navy`, `paper`, `forest`, `graphite`, or `terminal` (follows the terminal's own colours) |
| `panes` | `f` in the pane view, or shift+`,` | Whether the pane view opens by tab (`tabs`) or as one list (`flat`) |
| `hidden` | `,` on each screen | The columns left out, per screen: `projects`, `tabs`, `panes`, `flat` |
| `sort` | `o`, `O`, or a click on a column title | The column each screen is sorted by |
| `views`, `startView` | Editing the file | See [Views](#views) |

## Routines

A routine is a named command in a folder's `meta.json`:

```json
"routines": {
  "dev": "skaffold dev",
  "migrate": "bash scripts/migrate.sh"
}
```

`run routine dev` runs it from that folder. With no name, `run routine` asks which one.

- **There is no shell.** The command is split on spaces. Anything with `cd`, `&&`, pipes, quotes or redirects belongs in a script: write `scripts/migrate.sh` and make the routine `bash scripts/migrate.sh`.
- `run routine a b` runs several routines at once.
- `run -p <folder> routine <name>` runs a routine of another folder.

## Herdr workspaces

One project is one herdr workspace, named by `label`. The project's `meta.json` and each of its apps' contribute tabs to it.

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
          { "name": "logs" },
          { "name": "shell", "description": "ad-hoc commands" }
        ]
      }
    }]
  }]
}
```

- **Compact types:** `single` (1 pane), `vertical` and `horizontal` (2), `main-side` (3), `two-by-two` (4).
- **Folder:** a pane starts in the folder of the `meta.json` that defines its tab.
- **`routine`:** the routine the pane usually runs. One per pane. It only runs when asked: `--start` on the command line, or `y` in the dashboard.
- **`prefix`:** `false` keeps the tab's label as written; otherwise it is prefixed with the app's name.
- **`focus`:** on a pane or a tab, it chooses what is active inside the workspace and never moves you there. On the workspace itself, it takes you to it when built from the command line.

The full schema, with the `sections` and `grid` layouts, is in [`meta/schema.json`](meta/schema.json).

## meta.json reference

| Key | Meaning |
|---|---|
| `id` | A random identifier, 12 characters |
| `name` | The name shown in the dashboard |
| `type` | `project` at the root of a project, `app` for a service below it |
| `description` | What it is |
| `tags` | Words describing the project |
| `groups` | Names of the sets of projects it is worked on with, wherever their folders are |
| `routines` | Named commands; see [Routines](#routines) |
| `herdr` | The workspace; see [Herdr workspaces](#herdr-workspaces) |
| `port` | The port the app uses |

## Command reference

```
run [options] [command]

  -v, --version              show version information
  -p, --path <path>          run the command as if started in that folder
  -c, --cible <env context>  legacy: load .env.<context> (being removed)
  -e, --env <env path>       legacy: folder to load .env files from (being removed)
```

```
run projects [options]

  --root <path>   folder holding the projects (default: $RUN_PROJECT, else the current folder)
  --list          print the table once instead of opening the dashboard
  --json          print everything the dashboard knows as JSON, for scripts and agents
  --panes         with --json: add what each pane of the open projects runs
  --view <name>   start in a saved view (default: startView in the settings file)
  --theme <name>  navy, paper, forest, graphite or terminal (default: the last one chosen)
  --dry-run       show what each action would do without doing it
```

```
run herdr init <label> [options]    build the workspace; tabs that exist are skipped

  --all        build from every meta.json of the project
  --start      type each new pane's routine into it
  --reset      close the workspace first
  --no-focus   stay on the current workspace whatever the config says

run herdr attach [label]            attach to herdr, focusing a workspace
run herdr terminate <label>         close a workspace
run herdr list                      list open workspaces
```

```
run routine [name...]               run routines of the current folder
```

## Troubleshooting

| What you see | Why |
|---|---|
| A project is missing from the dashboard | Its root `meta.json` lacks `"type": "project"`, or it sits more than four folders below the root |
| A workspace shows as `stray` | Its label matches no project's workspace label, or its project's folder is gone |
| A routine fails on `&&` or prints nothing | It needs a shell: move it to a script |
| Routines did not start | They start only when a workspace is built with `--start` or with `y` in the dashboard, and only in panes created by that build |
| A view lists nothing | Its rules are combined with *and*. Check the spelling with `run projects --list` |

## Claude skill

The repository ships a Claude plugin whose skill teaches an agent the dashboard, views, routines, herdr workspaces and `meta.json`:

```
/plugin install run --marketplace ghostmind-dev/run
```

## License

MIT
