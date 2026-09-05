import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'node:test';

const root = path.resolve(__dirname, '..');
const readJson = (relativePath: string): Record<string, any> => JSON.parse(
  fs.readFileSync(path.join(root, relativePath), 'utf8'),
);

it('package and Homey manifest versions stay aligned', () => {
  const packageJson = readJson('package.json');
  const homeyCompose = readJson('.homeycompose/app.json');
  const appJson = readJson('app.json');
  const packageLock = readJson('package-lock.json');
  const expectedVersion = homeyCompose.version;

  assert.deepEqual({
    packageJson: packageJson.version,
    homeyCompose: homeyCompose.version,
    appJson: appJson.version,
    packageLock: packageLock.version,
    packageLockRoot: packageLock.packages?.['']?.version,
  }, {
    packageJson: expectedVersion,
    homeyCompose: expectedVersion,
    appJson: expectedVersion,
    packageLock: expectedVersion,
    packageLockRoot: expectedVersion,
  });
});

it('changelog has an entry for the current version', () => {
  const { version } = readJson('.homeycompose/app.json');
  const changelog = readJson('.homeychangelog.json');

  assert.equal(typeof changelog[version]?.en, 'string');
});
