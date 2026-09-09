const { execFileSync } = jest.requireActual("node:child_process") as {
  execFileSync(
    file: string,
    args: string[],
    options: {
      cwd: string;
      encoding: "utf8";
      env: Record<string, string>;
      timeout: number;
      killSignal: "SIGKILL";
      stdio: "pipe";
    },
  ): string;
};

function runDependencyCheck(source: string): void {
  execFileSync(process.execPath, ["--input-type=commonjs", "-e", source], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {},
    timeout: 5000,
    killSignal: "SIGKILL",
    stdio: "pipe",
  });
}

describe("dependency security and actual consumer compatibility", () => {
  test("Redocly's YAML loader counts empty merge sources toward its CPU budget", () => {
    runDependencyCheck(`
      const assert = require('node:assert/strict');
      const { createRequire } = require('node:module');
      const fromRedocly = createRequire(require.resolve('@redocly/openapi-core'));
      const yaml = fromRedocly('js-yaml');
      assert.throws(
        () => yaml.load('source: &source [{}, {}, {}]\\nresult: { <<: *source }', {
          maxTotalMergeKeys: 1,
        }),
        /maxTotalMergeKeys/,
      );
      assert.deepEqual(yaml.load('base: &base { enabled: true }\\ncopy: { <<: *base }'), {
        base: { enabled: true }, copy: { enabled: true },
      });
    `);
  });

  test("all YAML consumers retain compatible safe configuration parsing", () => {
    runDependencyCheck(`
      const assert = require('node:assert/strict');
      const { createRequire } = require('node:module');
      for (const parent of ['@redocly/openapi-core', '@istanbuljs/load-nyc-config', '@eslint/eslintrc', '@expo/xcpretty']) {
        const yaml = createRequire(require.resolve(parent))('js-yaml');
        const document = { include: ['src/**/*.ts'], coverage: true, threshold: 80 };
        assert.deepEqual(yaml.load(yaml.dump(document)), document);
        assert.throws(() => yaml.load('value: !!js/function "function () {}"'));
      }
    `);
  });

  test.each(["v3", "v5"])(
    "xcode's UUID dependency rejects an undersized output buffer in %s",
    (method) => {
      runDependencyCheck(`
        const assert = require('node:assert/strict');
        const { createRequire } = require('node:module');
        const uuid = createRequire(require.resolve('xcode'))('uuid');
        const method = ${JSON.stringify(method)};
        const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
        const buffer = new Uint8Array(8).fill(170);
        assert.throws(() => uuid[method]('security-regression', namespace, buffer, 4), RangeError);
        assert.deepEqual(Array.from(buffer), Array(8).fill(170));
        assert.throws(() => uuid[method]('security-regression', namespace, new Uint8Array(16), -1), RangeError);
        const valid = new Uint8Array(20);
        uuid[method]('security-regression', namespace, valid, 4);
        assert.equal(uuid.stringify(valid.slice(4)), uuid[method]('security-regression', namespace));
      `);
    },
  );

  test("xcode still generates unique uppercase 24-character project identifiers", () => {
    runDependencyCheck(`
      const assert = require('node:assert/strict');
      const project = require('xcode').project('not-written.pbxproj');
      project.hash = { project: { objects: {} } };
      const ids = Array.from({ length: 30 }, () => project.generateUuid());
      assert.equal(new Set(ids).size, ids.length);
      for (const id of ids) assert.match(id, /^[A-F0-9]{24}$/);
    `);
  });

  test("query-string handles a long malformed callback value without recursive CPU exhaustion", () => {
    runDependencyCheck(`
      const assert = require('node:assert/strict');
      const query = require('query-string');
      const malformed = '%80'.repeat(10000);
      assert.equal(query.parse('state=' + malformed).state, malformed);
    `);
  });

  test("the decoder does not recombine bytes across a decoded percent separator", () => {
    runDependencyCheck(`
      const assert = require('node:assert/strict');
      const query = require('query-string');
      assert.equal(query.parse('state=%84%D7%25%88%90').state, '%84%D7%%88%90');
    `);
  });

  test("query-string preserves callback, Korean, plus, fragment and one-pass decoding behavior", () => {
    runDependencyCheck(`
      const assert = require('node:assert/strict');
      const query = require('query-string');
      const callback = query.parseUrl('jamye://oauth/google?code=test%2Bcode&state=test-state');
      assert.equal(callback.url, 'jamye://oauth/google');
      assert.deepEqual({ ...callback.query }, { code: 'test+code', state: 'test-state' });
      assert.equal(query.parse('name=%EA%B0%80%EB%82%98+%EB%8B%A4').name, '가나 다');
      assert.equal(query.parse('state=%2520').state, '%20');
      assert.equal(query.parseUrl('jamye://oauth/kakao#name+suffix', {
        parseFragmentIdentifier: true,
      }).fragmentIdentifier, 'name suffix');
      assert.equal(query.parse('state=%E0%80%80').state, '%E0%80%80');
    `);
  });
});
