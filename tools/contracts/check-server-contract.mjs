import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildServerContractArtifactsForCheck,
  canonicalizeJson,
} from "./generate-server-contract.mjs";

const GENERATED_FILE_NAME = "server-api.ts";
const LOCK_FILE_NAME = "contract.lock";
const MANIFEST_FILE_NAME = "manifest.json";
const INTAKE_FILE_NAME = "intake.json";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readOptional(path, { asBuffer = false } = {}) {
  try {
    return asBuffer ? await readFile(path) : await readFile(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readOptionalJson(path) {
  const text = await readOptional(path);
  return text === null ? null : JSON.parse(text);
}

/**
 * Self-contained, read-only drift check: never reads the sibling
 * jamye-server checkout and never mutates the checked-in snapshot or
 * generated output. Reports whether the preserved intake snapshot
 * (openapi.json/manifest.json), the generated type boundary, and the
 * generation lock are mutually consistent.
 */
export async function checkServerContract({
  contractRoot,
  generatedDirectory,
}) {
  const resolvedContractRoot = resolve(contractRoot);
  const intake = await readOptionalJson(
    join(resolvedContractRoot, INTAKE_FILE_NAME),
  );
  if (!intake) {
    return { reason: "intake-record-missing", status: "error" };
  }

  const manifestBytes = await readOptional(
    join(resolvedContractRoot, MANIFEST_FILE_NAME),
    { asBuffer: true },
  );
  if (
    manifestBytes === null ||
    sha256(manifestBytes) !== intake.upstream_manifest_sha256
  ) {
    return { reason: "upstream-manifest-drift", status: "tampered" };
  }
  const currentManifest = JSON.parse(manifestBytes.toString("utf8"));
  if (currentManifest.server_commit !== intake.upstream_server_commit) {
    return { reason: "upstream-manifest-drift", status: "tampered" };
  }

  const artifacts = await buildServerContractArtifactsForCheck({
    contractRoot,
    generatedDirectory,
  });
  if (artifacts.lock.source_sha256 !== intake.upstream_openapi_sha256) {
    return { reason: "upstream-openapi-drift", status: "tampered" };
  }

  const expectedFiles = [
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
    contractRoot: join(repositoryRoot, "contracts/server"),
    generatedDirectory: join(
      repositoryRoot,
      "src/core/contracts/generated/server",
    ),
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const result = await checkServerContract(defaultPaths());
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "ok") process.exitCode = 1;
}
