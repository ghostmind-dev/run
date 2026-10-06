import { assertEquals } from 'jsr:@std/assert';
import { join } from 'node:path';
import { discoverProjects } from '../lib/projects.tsx';

async function writeMeta(folder: string, meta: Record<string, unknown>) {
  await Deno.mkdir(folder, { recursive: true });
  await Deno.writeTextFile(join(folder, 'meta.json'), JSON.stringify(meta));
}

Deno.test('discoverProjects lists project roots and counts their apps', async () => {
  const root = await Deno.makeTempDir();

  try {
    await writeMeta(join(root, 'studio', 'music'), {
      id: 'a',
      name: 'music',
      type: 'project',
      tags: ['audio'],
      groups: ['band'],
      herdr: { workspaces: [{ label: 'music', tabs: [] }] },
    });
    await writeMeta(join(root, 'studio', 'music', 'ui'), {
      id: 'b',
      name: 'ui',
      type: 'app',
    });
    await writeMeta(join(root, 'labo', 'notes'), {
      id: 'c',
      name: 'notes',
      type: 'project',
    });
    // Neither a project nor below one: never listed
    await writeMeta(join(root, 'labo', 'loose'), { id: 'd', name: 'loose' });
    await writeMeta(join(root, 'labo', 'notes', 'node_modules', 'dep'), {
      id: 'e',
      name: 'dep',
      type: 'project',
    });

    const projects = await discoverProjects(root);

    assertEquals(
      projects.map(({ name, folder, label, apps, tags, groups }) => ({
        name,
        folder,
        label,
        apps,
        tags,
        groups,
      })),
      [
        {
          name: 'notes',
          folder: 'labo',
          label: null,
          apps: [],
          tags: [],
          groups: [],
        },
        {
          name: 'music',
          folder: 'studio',
          label: 'music',
          apps: ['ui'],
          tags: ['audio'],
          groups: ['band'],
        },
      ]
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
