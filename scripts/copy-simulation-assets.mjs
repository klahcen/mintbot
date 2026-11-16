import { copyFile, mkdir } from 'node:fs/promises';
const source = new URL('../src/simulation/', import.meta.url);
const target = new URL('../dist/src/simulation/', import.meta.url);
await mkdir(target, { recursive: true });
for (const asset of ['intent-schema.sql', 'intent-migration-007.sql']) {
  await copyFile(new URL(asset, source), new URL(asset, target));
}
