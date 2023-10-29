# run

global command line interface for development

## install

```bash
npm install @ghostmind-dev/run
```

## local development in a project

#### mount this folder to the project (devcontaine.json)

```json
{
  "mounts": [
    "source=${env:HOME}/projects/dvc-command,target=/home/vscode/dvc-command,type=bind"
  ]
}
```

#### add alias to the bin executable (postcreateCommand)

```bash
cat <<EOT >>~/.zshrc
    alias run="${HOME}/dvc-command/src/bin/cmd.mjs"
EOT
```

#### create a symlink to this folder (postcreateCommand)

```bash
ln -s ${HOME}/dvc-command ${SRC}/app
```

## npm link

- delete package-lock.json
- npm install
- npm link @ghostmind-dev/run

## bugs (or normal behavior)

- needs to use flag --no-reuse for the first act run
- otherwise, act container in bind with previous project

## secrets in action

- should not be defined in run
- should be defined in the project
- should loop over secrets that start with `RUN_ACTION_`
