# run

This folder has two jobs.

1. **It is the `run` CLI** (Deno, `run/`): the projects dashboard, routines, herdr workspaces, `meta.json`. The `run` skill (`plugin/skills/run/SKILL.md`) documents it; the installed `run` command executes this source directly.
2. **It is the entrypoint of the whole Ghostmind ecosystem.** Work on any project often starts in a session here: creating a project, opening its space, moving a repo, shipping, checking what is clean, handing a task to another session. Things are run from here; the `system` plugin holds the rules they follow.

## Working across projects from here

- **Discover, don't remember.** Nothing here lists the projects or what they do, on purpose: it would go stale. At the start of a question about the ecosystem, run `run projects --json` (every project with its path, org, repo, branch, changes, tags, groups, apps, routines and open workspace), then read the `README.md` and `CLAUDE.md` of the project the question is about.
- All projects are folders at the root of `/Volumes/Projects`.
- Load the `system` skill before building or changing a project; a new one is `/system:new-app`.
- A project's own work continues in its own space. Open it with `run herdr init <project> --all`, and hand over through the agent channel (`toolkits:agent-channel-write`) so the session there has the context.
- A feature idea for another project goes in that project's own notes (its `README.md` "next" section or equivalent), not here.
- Ask before changing shared infrastructure; prod changes go through a merge to `main` in the project's repo.
