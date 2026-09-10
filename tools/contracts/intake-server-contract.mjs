import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const MANIFEST_FILE_NAME = "manifest.json";
const OPENAPI_FILE_NAME = "openapi.json";
const INTAKE_FILE_NAME = "intake.json";
const GENERATOR_IDENTITY = "openapi-typescript@7.13.0";
const VALIDATOR_IDENTITY = "ajv@8.20.0";
const M6_SCHEMA_CLOSURE_OPERATION_IDS = Object.freeze([
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "H1",
  "H2",
  "U1",
]);
// M9 selectively vendors the realtime protocol/frame schemas and only the
// three M9 recovery fixtures out of the upstream bundle's larger fixture set
// (c2-*/c4-* server-side fixtures and other lifecycle fixtures stay
// upstream-only). Every path below is still covered by the whole-bundle
// checksum verified in verifyUpstreamBundleChecksum before any byte is
// mirrored, so selective vendoring never weakens provenance.
export const SELECTIVE_M9_VENDORED_ARTIFACTS = Object.freeze([
  "fixtures/mobile-sync-handoff.json",
  "fixtures/realtime-lifecycle.json",
  "fixtures/unknown-event-recovery.json",
  "realtime/client-frame.schema.json",
  "realtime/message.created.schema.json",
  "realtime/protocol.json",
  "realtime/server-frame.schema.json",
  "realtime/topic.created.schema.json",
]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeJson(value) {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeJson(value[key])]),
  );
}

export function canonicalizeJson(value) {
  return `${JSON.stringify(normalizeJson(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireArrayOfStrings(value, label) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  return value;
}

function assertArtifactPathIsContained(artifactPath, upstreamContractRoot) {
  if (isAbsolute(artifactPath) || artifactPath.split("/").includes("..")) {
    throw new Error(
      `Upstream artifact path escapes the contract root: ${artifactPath}`,
    );
  }
  const resolvedPath = resolve(upstreamContractRoot, artifactPath);
  const relativeToRoot = relative(upstreamContractRoot, resolvedPath);
  if (
    relativeToRoot.startsWith("..") ||
    isAbsolute(relativeToRoot) ||
    relativeToRoot.split(sep).includes("..")
  ) {
    throw new Error(
      `Upstream artifact path escapes the contract root: ${artifactPath}`,
    );
  }
  return resolvedPath;
}

async function readUpstreamArtifactBytes(
  artifactPath,
  upstreamContractRoot,
  manifestWithoutChecksum,
) {
  if (artifactPath === MANIFEST_FILE_NAME) {
    return Buffer.from(canonicalizeCompact(manifestWithoutChecksum), "utf8");
  }
  const resolvedPath = assertArtifactPathIsContained(
    artifactPath,
    upstreamContractRoot,
  );
  let fileStat;
  try {
    fileStat = await stat(resolvedPath);
  } catch {
    throw new Error(`Upstream artifact is missing: ${artifactPath}`);
  }
  if (!fileStat.isFile()) {
    throw new Error(`Upstream artifact is not a regular file: ${artifactPath}`);
  }
  return readFile(resolvedPath);
}

function canonicalizeCompact(value) {
  return JSON.stringify(normalizeJson(value));
}

async function verifyUpstreamBundleChecksum(
  upstreamManifest,
  upstreamContractRoot,
) {
  const artifacts = requireArrayOfStrings(
    upstreamManifest.artifacts,
    "manifest.artifacts",
  );
  const expectedChecksum = requireNonEmptyString(
    upstreamManifest.sha256,
    "manifest.sha256",
  );
  requireNonEmptyString(
    upstreamManifest.checksum_algorithm,
    "manifest.checksum_algorithm",
  );

  const manifestWithoutChecksum = { ...upstreamManifest };
  delete manifestWithoutChecksum.sha256;

  const sortedArtifacts = [...artifacts].sort();
  if (new Set(sortedArtifacts).size !== sortedArtifacts.length) {
    throw new Error("manifest.artifacts contains duplicate entries.");
  }

  const chunks = [];
  for (const artifactPath of sortedArtifacts) {
    const bytes = await readUpstreamArtifactBytes(
      artifactPath,
      upstreamContractRoot,
      manifestWithoutChecksum,
    );
    chunks.push(Buffer.from(artifactPath, "utf8"));
    chunks.push(Buffer.from([0]));
    chunks.push(Buffer.from(String(bytes.length), "utf8"));
    chunks.push(Buffer.from([0]));
    chunks.push(bytes);
  }

  const actualChecksum = sha256(Buffer.concat(chunks));
  if (actualChecksum !== expectedChecksum) {
    throw new Error(
      `Upstream bundle checksum mismatch: expected ${expectedChecksum}, computed ${actualChecksum}.`,
    );
  }

  return { artifactCount: sortedArtifacts.length, artifacts: sortedArtifacts };
}

async function writeStagedFiles(files) {
  const stagedFiles = files.map(({ path, contents }) => ({
    contents,
    path,
    temporaryPath: `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`,
  }));

  try {
    await Promise.all(
      stagedFiles.map(({ contents, temporaryPath }) =>
        typeof contents === "string"
          ? writeFile(temporaryPath, contents, "utf8")
          : writeFile(temporaryPath, contents),
      ),
    );
    await Promise.all(
      stagedFiles.map(({ path, temporaryPath }) => rename(temporaryPath, path)),
    );
  } catch (error) {
    await Promise.all(
      stagedFiles.map(({ temporaryPath }) =>
        rm(temporaryPath, { force: true }),
      ),
    );
    throw error;
  }
}

/**
 * Reads the upstream jamye-server contract bundle (read-only), verifies its
 * documented checksum algorithm over the exact artifact inventory declared
 * in its manifest (rejecting missing/escaping paths and any content drift),
 * then mirrors openapi.json and manifest.json plus the selectively vendored
 * M9 realtime protocol/frame schemas and recovery fixtures
 * (SELECTIVE_M9_VENDORED_ARTIFACTS) byte-identically into the local snapshot
 * and writes one intake record, including a per-artifact sha256 map
 * (selective_vendor_sha256) the checker uses to detect local tampering. The
 * upstream manifest's own fields (including server_commit: "dirty") are
 * preserved verbatim; the actual local source Git revision is recorded
 * separately in the intake record.
 */
export async function intakeServerContract({
  upstreamContractRoot,
  localContractRoot,
  sourceGitRevision,
}) {
  const resolvedUpstreamRoot = resolve(upstreamContractRoot);
  const resolvedLocalRoot = resolve(localContractRoot);
  requireNonEmptyString(sourceGitRevision, "sourceGitRevision");

  const upstreamManifestPath = join(resolvedUpstreamRoot, MANIFEST_FILE_NAME);
  const upstreamManifest = JSON.parse(
    await readFile(upstreamManifestPath, "utf8"),
  );
  const upstreamOpenapiPath = join(resolvedUpstreamRoot, OPENAPI_FILE_NAME);
  const upstreamOpenapiBytes = await readFile(upstreamOpenapiPath);
  const upstreamManifestBytes = await readFile(upstreamManifestPath);

  const { artifactCount, artifacts } = await verifyUpstreamBundleChecksum(
    upstreamManifest,
    resolvedUpstreamRoot,
  );

  const openapi = JSON.parse(upstreamOpenapiBytes.toString("utf8"));
  const upstreamContractVersion = requireNonEmptyString(
    openapi?.info?.version,
    "openapi.info.version",
  );
  if (upstreamContractVersion !== upstreamManifest.contract_version) {
    throw new Error(
      "openapi.info.version does not match manifest.contract_version.",
    );
  }

  const missingSelectiveArtifacts = SELECTIVE_M9_VENDORED_ARTIFACTS.filter(
    (artifactPath) => !artifacts.includes(artifactPath),
  );
  if (missingSelectiveArtifacts.length > 0) {
    throw new Error(
      `Upstream manifest does not declare the selectively vendored artifact(s): ${missingSelectiveArtifacts.join(", ")}.`,
    );
  }
  const selectiveVendoredFiles = await Promise.all(
    SELECTIVE_M9_VENDORED_ARTIFACTS.map(async (artifactPath) => ({
      bytes: await readFile(
        assertArtifactPathIsContained(artifactPath, resolvedUpstreamRoot),
      ),
      path: artifactPath,
    })),
  );
  const selectiveVendorSha256 = Object.fromEntries(
    selectiveVendoredFiles.map(({ bytes, path }) => [path, sha256(bytes)]),
  );

  const intake = normalizeJson({
    checksum_algorithm: upstreamManifest.checksum_algorithm,
    generator_identity: GENERATOR_IDENTITY,
    intake_kind: "server-snapshot",
    schema_closure_operation_ids: [...M6_SCHEMA_CLOSURE_OPERATION_IDS],
    selective_vendor_sha256: selectiveVendorSha256,
    source_git_revision: sourceGitRevision,
    upstream_artifact_count: artifactCount,
    upstream_bundle_sha256: upstreamManifest.sha256,
    upstream_bundle_verified: true,
    upstream_contract_version: upstreamContractVersion,
    upstream_manifest_sha256: sha256(upstreamManifestBytes),
    upstream_openapi_sha256: sha256(upstreamOpenapiBytes),
    upstream_server_commit: upstreamManifest.server_commit,
    validator_identity: VALIDATOR_IDENTITY,
  });

  await mkdir(resolvedLocalRoot, { recursive: true });
  await mkdir(join(resolvedLocalRoot, "fixtures"), { recursive: true });
  await mkdir(join(resolvedLocalRoot, "realtime"), { recursive: true });
  await writeStagedFiles([
    {
      contents: upstreamOpenapiBytes,
      path: join(resolvedLocalRoot, OPENAPI_FILE_NAME),
    },
    {
      contents: upstreamManifestBytes,
      path: join(resolvedLocalRoot, MANIFEST_FILE_NAME),
    },
    ...selectiveVendoredFiles.map(({ bytes, path }) => ({
      contents: bytes,
      path: join(resolvedLocalRoot, ...path.split("/")),
    })),
    {
      contents: canonicalizeJson(intake),
      path: join(resolvedLocalRoot, INTAKE_FILE_NAME),
    },
  ]);

  return {
    intake,
    mirroredFiles: [
      OPENAPI_FILE_NAME,
      MANIFEST_FILE_NAME,
      ...SELECTIVE_M9_VENDORED_ARTIFACTS,
    ],
  };
}

function defaultPaths() {
  const repositoryRoot = resolve(
    fileURLToPath(new URL("../..", import.meta.url)),
  );
  return {
    localContractRoot: join(repositoryRoot, "contracts/server"),
    upstreamContractRoot: resolve(repositoryRoot, "../jamye-server/contracts"),
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const { localContractRoot, upstreamContractRoot } = defaultPaths();
  const sourceGitRevision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: upstreamContractRoot,
    encoding: "utf8",
  }).trim();
  const result = await intakeServerContract({
    localContractRoot,
    sourceGitRevision,
    upstreamContractRoot,
  });
  process.stdout.write(`${canonicalizeJson(result.intake)}`);
}
