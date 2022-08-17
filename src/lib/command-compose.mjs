import { $, which, sleep, cd, fs } from 'zx';
import { detectScriptsDirectory } from '../utils/divers.mjs';

////////////////////////////////////////////////////////////////////////////////
// MUTE BY DEFAULT
////////////////////////////////////////////////////////////////////////////////

$.verbose = false;

////////////////////////////////////////////////////////////////////////////////
// COMPOSE DEFAULT CONFIG
////////////////////////////////////////////////////////////////////////////////

const composeGroupDefault = {
  root: 'app',
};

////////////////////////////////////////////////////////////////////////////////
// COMPOSE GROUP RUN COMMAND
////////////////////////////////////////////////////////////////////////////////

async function composeGroupRun(composeGroupSelected) {
  // $.verbose = true;

  const ENV = `${process.env.ENV}`;
  const GCP_PROJECT_NAME = `${process.env.GCP_PROJECT_NAME}`;

  const currentPath = process.cwd();

  const { compose, type, name } = await fs.readJsonSync('meta.json');

  const { root } = { ...composeGroupDefault, ...compose };

  const composePath = `${currentPath}/${root}`;

  const { stdout: apps } = await $`ls ${composePath}`;

  // remove \n from apps
  let appsArray = apps.split('\n');
  // remove last element from appsArray
  appsArray.pop();
  // remove element === "dvd-command" from appsArray
  appsArray = appsArray.filter(function (item) {
    return item !== 'dvc-command';
  });

  appsArray = appsArray.filter(function (item) {
    return item !== 'meta.json';
  });

  let groupeStructure = {};
  for (let app of appsArray) {
    let { name, compose } = await fs.readJsonSync(
      `${process.env.SRC}/app/${app}/meta.json`
    );
    let { group } = compose;
    // verify if propertie exists in groupeStructure
    for (let groupeName of group) {
      if (groupeStructure[groupeName] === undefined) {
        groupeStructure[groupeName] = [name];
        continue;
      }
      groupeStructure[groupeName].push(name);
    }
  }

  // Should print table with group name on the y axis and apps on the x axis
  // the data structure is:
  // console.table({
  //   admin: { app1: true, app2: false },
  //   dev: { app1: true, app2: false },
  // });

  if (composeGroupSelected === undefined) {
    console.table(groupeStructure);
    return;
  }

  let groupDetails = groupeStructure[composeGroupSelected];
  if (groupDetails === undefined) {
    console.log(`group ${composeGroupSelected} not found`);
    return;
  }

  let composeCommand = '';
  for (let app of groupDetails) {
    let DOCKERFILE = `${composePath}/${app}/app/Dockerfile.${ENV}`;
    let DOCKER_CONTEXT = `${composePath}/${app}/app/`;
    $.verbose = true;
    await $`docker build -t gcr.io/${GCP_PROJECT_NAME}/${app}:local -f ${DOCKERFILE} ${DOCKER_CONTEXT}`;

    await sleep(1000);

    await $`docker push gcr.io/${GCP_PROJECT_NAME}/${app}:local`;
    composeCommand += '-f';
    composeCommand += `${app}/compose.yaml`;
  }

  cd(composePath);

  await $`docker-compose ${composeCommand} up`;
}
////////////////////////////////////////////////////////////////////////////////
// MAIN ENTRY POINT
////////////////////////////////////////////////////////////////////////////////

export default async function commandCompose(program) {
  const compose = program.command('compose');
  compose.description('run docker compose');
  const composeGroup = compose.command('group');
  const composeGroupUp = composeGroup.command('up');
  // const composeGroupDown = composeGroup.command("down");
  // const composeGroupList = composeGroup.command("list");
  composeGroupUp
    .description('run multiple docker compose')
    .argument('[name]', 'group to run')
    .action(composeGroupRun);
}
