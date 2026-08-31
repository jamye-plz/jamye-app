import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildBootstrapContractArtifacts,
  canonicalizeJson,
} from "./generate-bootstrap-contract.mjs";

const GENERATED_FILE_NAME = "bootstrap-api.ts";
const LOCK_FILE_NAME = "contract.lock";
const MANIFEST_FILE_NAME = "manifest.json";

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readJson(path) {
  const text = await readOptional(path);
  return text === null ? null : JSON.parse(text);
}

export async function checkBootstrapContract({
  baselineLockPath,
  contractRoot,
  generatedDirectory,
}) {
  const artifacts = await buildBootstrapContractArtifacts({
    contractRoot,
    generatedDirectory,
  });
  const baselineLock = await readJson(
    baselineLockPath
      ? resolve(baselineLockPath)
      : join(artifacts.resolvedContractRoot, LOCK_FILE_NAME),
  );

  if (
    baselineLock &&
    baselineLock.contract_version === artifacts.lock.contract_version &&
    baselineLock.breaking_shape_sha256 !== artifacts.lock.breaking_shape_sha256
  ) {
    return {
      reason: "breaking-shape-changed-without-version-bump",
      status: "incompatible",
    };
  }

  const expectedFiles = [
    [
      join(artifacts.resolvedContractRoot, MANIFEST_FILE_NAME),
      canonicalizeJson(artifacts.manifest),
    ],
    [
      join(artifacts.resolvedContractRoot, LOCK_FILE_NAME),
      canonicalizeJson(artifacts.lock),
    ],
    [
      join(artifacts.generatedDirectory, GENERATED_FILE_NAME),
      artifacts.generatedSource,
    ],
  ];
  const actualFiles = await Promise.all(
    expectedFiles.map(async ([path, expected]) => ({
      actual: await readOptional(path),
      expected,
    })),
  );

  if (actualFiles.some(({ actual, expected }) => actual !== expected)) {
    return { status: "drift" };
  }

  return { status: "ok" };
}

function defaultPaths() {
  const repositoryRoot = resolve(
    fileURLToPath(new URL("../..", import.meta.url)),
  );
  return {
    contractRoot: join(repositoryRoot, "contracts/bootstrap"),
    generatedDirectory: join(repositoryRoot, "src/core/contracts/generated"),
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const result = await checkBootstrapContract(defaultPaths());
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "ok") process.exitCode = 1;
}
