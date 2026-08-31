import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import openapiTS, { astToString } from "openapi-typescript";

const GENERATED_FILE_NAME = "bootstrap-api.ts";
const MANIFEST_FILE_NAME = "manifest.json";
const LOCK_FILE_NAME = "contract.lock";
const OPENAPI_FILE_NAME = "openapi.json";
const REALTIME_SCHEMA_FILE_NAME = "realtime-event.schema.json";
const REALTIME_EVENT_DOCUMENT_REFERENCE = `./${REALTIME_SCHEMA_FILE_NAME}`;
const REALTIME_EVENT_INSTANCE_REFERENCE = `${REALTIME_EVENT_DOCUMENT_REFERENCE}#/$defs/realtimeEvent`;

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
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function listJsonFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return listJsonFiles(path);
      return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
    }),
  );
  return files.flat().sort();
}

function requireRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function normalizeBreakingReference(value) {
  // The bootstrap baseline originally identified this wire schema by its
  // external document. Keep that logical identity stable when OpenAPI points
  // at the document's explicit instance definition for correct type generation.
  return value === REALTIME_EVENT_INSTANCE_REFERENCE
    ? REALTIME_EVENT_DOCUMENT_REFERENCE
    : value;
}

function projectValidationShape(
  schema,
  { includeOptionalProperties = false } = {},
) {
  if (Array.isArray(schema)) {
    return schema.map((item) =>
      projectValidationShape(item, { includeOptionalProperties }),
    );
  }
  if (!isRecord(schema)) return schema;

  const projected = {};
  if ("$ref" in schema) {
    projected.$ref = normalizeBreakingReference(schema.$ref);
  }
  for (const key of [
    "type",
    "nullable",
    "const",
    "enum",
    "format",
    "pattern",
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minItems",
    "maxItems",
    "uniqueItems",
    "minProperties",
    "maxProperties",
    "additionalProperties",
  ]) {
    if (key in schema) projected[key] = projectValidationShape(schema[key]);
  }
  for (const key of ["allOf", "anyOf", "oneOf", "then", "else", "not"]) {
    if (key in schema) {
      projected[key] = projectValidationShape(schema[key], {
        includeOptionalProperties,
      });
    }
  }
  if ("if" in schema) {
    // Conditional selectors may constrain an otherwise optional discriminator.
    // Preserve it even though additive envelope properties stay out of the
    // compatibility projection.
    projected.if = projectValidationShape(schema.if, {
      includeOptionalProperties: true,
    });
  }
  if (Array.isArray(schema.required)) {
    projected.required = [...schema.required].sort();
  }
  if (isRecord(schema.properties)) {
    const propertyNames = includeOptionalProperties
      ? Object.keys(schema.properties)
      : Array.isArray(schema.required)
        ? schema.required
        : [];
    projected.properties = Object.fromEntries(
      [...propertyNames].sort().map((name) => [
        name,
        projectValidationShape(schema.properties[name], {
          includeOptionalProperties,
        }),
      ]),
    );
  }
  if ("items" in schema) {
    projected.items = projectValidationShape(schema.items, {
      includeOptionalProperties,
    });
  }

  return normalizeJson(projected);
}

function findParameter(operation, name, location, required) {
  const parameters = Array.isArray(operation.parameters)
    ? operation.parameters
    : [];
  const parameter = parameters.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.in === location &&
      candidate.name === name &&
      candidate.required === required,
  );
  if (!parameter) {
    throw new Error(`Approved ${location} parameter ${name} is missing.`);
  }
  return parameter;
}

function projectParameter(operation, name, location, required) {
  const parameter = findParameter(operation, name, location, required);
  return {
    in: parameter.in,
    name: parameter.name,
    required: parameter.required,
    schema: projectValidationShape(
      requireRecord(parameter.schema, `${name} schema`),
      {
        includeOptionalProperties: true,
      },
    ),
  };
}

function projectJsonContent(container, label) {
  const content = requireRecord(container.content, `${label} content`);
  const mediaType = requireRecord(content["application/json"], `${label} JSON`);
  return projectValidationShape(
    requireRecord(mediaType.schema, `${label} schema`),
  );
}

function projectResponse(operation, status, label) {
  const responses = requireRecord(operation.responses, `${label} responses`);
  return projectJsonContent(
    requireRecord(responses[status], `${label} ${status}`),
    label,
  );
}

function projectVersionHeader(operation, operationName, contractVersion) {
  const header = projectParameter(
    operation,
    "X-Jamye-Contract-Version",
    "header",
    true,
  );
  if (header.schema.const !== contractVersion) {
    throw new Error(
      `${operationName} X-Jamye-Contract-Version must equal OpenAPI info.version.`,
    );
  }
  return header;
}

function projectBreakingShape(openapi, realtimeSchema, contractVersion) {
  const paths = requireRecord(openapi.paths, "OpenAPI paths");
  const messagePath = requireRecord(
    paths["/bootstrap/v1/conversations/{conversation_id}/messages"],
    "message command path",
  );
  const eventPath = requireRecord(
    paths["/bootstrap/v1/conversations/{conversation_id}/events"],
    "conversation delta path",
  );
  const post = requireRecord(messagePath.post, "message command POST");
  const get = requireRecord(eventPath.get, "conversation delta GET");
  const definitions = requireRecord(realtimeSchema.$defs, "realtime $defs");

  return normalizeJson({
    operations: {
      getConversationDelta: {
        method: "get",
        parameters: [
          projectParameter(get, "conversation_id", "path", true),
          projectVersionHeader(get, "GET", contractVersion),
          projectParameter(get, "after_cursor", "query", false),
          projectParameter(get, "limit", "query", false),
        ],
        path: "/bootstrap/v1/conversations/{conversation_id}/events",
        response200: projectResponse(get, "200", "conversation delta"),
        responseStatuses: Object.keys(
          requireRecord(get.responses, "GET responses"),
        ).sort(),
      },
      postMessageCommand: {
        method: "post",
        parameters: [
          projectParameter(post, "conversation_id", "path", true),
          projectVersionHeader(post, "POST", contractVersion),
        ],
        path: "/bootstrap/v1/conversations/{conversation_id}/messages",
        requestBody: {
          required: post.requestBody?.required === true,
          schema: projectJsonContent(
            requireRecord(post.requestBody, "POST request body"),
            "POST request body",
          ),
        },
        response200: projectResponse(post, "200", "message command"),
        responseStatuses: Object.keys(
          requireRecord(post.responses, "POST responses"),
        ).sort(),
      },
    },
    pathMethods: Object.fromEntries(
      Object.keys(paths)
        .sort()
        .map((path) => [
          path,
          Object.keys(requireRecord(paths[path], `${path} path item`))
            .filter((key) =>
              [
                "get",
                "post",
                "put",
                "patch",
                "delete",
                "head",
                "options",
                "trace",
              ].includes(key),
            )
            .sort(),
        ]),
    ),
    realtime: {
      root: projectValidationShape(
        requireRecord(definitions.realtimeEvent, "realtime event"),
        {
          includeOptionalProperties: true,
        },
      ),
      requiredDefinitions: {
        baseEnvelope: projectValidationShape(
          requireRecord(definitions.baseEnvelope, "base envelope"),
        ),
        messageUpsertPayload: projectValidationShape(
          requireRecord(
            definitions.messageUpsertPayload,
            "message upsert payload",
          ),
        ),
      },
    },
  });
}

function contractVersionFrom(openapi) {
  const info = requireRecord(openapi.info, "OpenAPI info");
  return requireNonEmptyString(info.version, "OpenAPI info.version");
}

async function fixtureHashes(contractRoot) {
  const fixturesRoot = join(contractRoot, "fixtures");
  const fixturePaths = await listJsonFiles(fixturesRoot);
  const hashes = {};

  for (const fixturePath of fixturePaths) {
    const fixtureRelativePath = relative(fixturesRoot, fixturePath).replaceAll(
      "\\",
      "/",
    );
    hashes[fixtureRelativePath] = sha256(
      canonicalizeJson(await readJson(fixturePath)),
    );
  }

  const records = Object.entries(hashes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, hash]) => `${path}\0${hash}\n`)
    .join("");
  return { hashes: normalizeJson(hashes), setHash: sha256(records) };
}

async function buildContractArtifacts({ contractRoot, generatedDirectory }) {
  const resolvedContractRoot = resolve(contractRoot);
  const openapiPath = join(resolvedContractRoot, OPENAPI_FILE_NAME);
  const realtimeSchemaPath = join(
    resolvedContractRoot,
    REALTIME_SCHEMA_FILE_NAME,
  );
  const openapi = await readJson(openapiPath);
  const realtimeSchema = await readJson(realtimeSchemaPath);
  const contractVersion = contractVersionFrom(openapi);
  const sourceHashes = normalizeJson({
    [OPENAPI_FILE_NAME]: sha256(canonicalizeJson(openapi)),
    [REALTIME_SCHEMA_FILE_NAME]: sha256(canonicalizeJson(realtimeSchema)),
  });
  const fixtures = await fixtureHashes(resolvedContractRoot);
  const manifest = normalizeJson({
    contract_version: contractVersion,
    fixtures_sha256: fixtures.setHash,
    generator_identity: "openapi-typescript@7.13.0",
    realtime_schema_sha256: sourceHashes[REALTIME_SCHEMA_FILE_NAME],
    server_commit: null,
    server_provenance_status: "unbound-local-bootstrap",
    server_tag: null,
    source_kind: "repository-local-bootstrap",
    source_sha256: sourceHashes[OPENAPI_FILE_NAME],
    status: "bootstrap",
    validator_identity: "ajv@8.20.0",
  });
  const breakingShape = projectBreakingShape(
    openapi,
    realtimeSchema,
    contractVersion,
  );
  const breakingShapeSha256 = sha256(canonicalizeJson(breakingShape));
  const manifestSha256 = sha256(canonicalizeJson(manifest));
  const contractSha256 = sha256(
    canonicalizeJson({
      fixture_hashes: fixtures.hashes,
      manifest,
      source_hashes: sourceHashes,
    }),
  );
  const lock = normalizeJson({
    breaking_shape_sha256: breakingShapeSha256,
    contract_sha256: contractSha256,
    contract_version: contractVersion,
    fixture_hashes: fixtures.hashes,
    manifest_sha256: manifestSha256,
    source_hashes: sourceHashes,
  });
  const generatedAst = await openapiTS(pathToFileURL(openapiPath), {
    emptyObjectsUnknown: true,
  });
  const generatedSource = [
    "// Generated by openapi-typescript. Do not edit.",
    astToString(generatedAst).trimEnd(),
    "",
  ].join("\n");

  return {
    breakingShape,
    generatedDirectory: resolve(generatedDirectory),
    generatedSource,
    lock,
    manifest,
    resolvedContractRoot,
  };
}

async function writeStagedFiles(files) {
  const stagedFiles = files.map(({ path, contents }) => ({
    contents,
    path,
    temporaryPath: `${path}.tmp-${process.pid}-${randomUUID()}`,
  }));

  try {
    await Promise.all(
      stagedFiles.map(({ contents, temporaryPath }) =>
        writeFile(temporaryPath, contents, "utf8"),
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

export async function generateBootstrapContract({
  contractRoot,
  generatedDirectory,
}) {
  const artifacts = await buildContractArtifacts({
    contractRoot,
    generatedDirectory,
  });

  await mkdir(artifacts.generatedDirectory, { recursive: true });
  await writeStagedFiles([
    {
      contents: canonicalizeJson(artifacts.manifest),
      path: join(artifacts.resolvedContractRoot, MANIFEST_FILE_NAME),
    },
    {
      contents: canonicalizeJson(artifacts.lock),
      path: join(artifacts.resolvedContractRoot, LOCK_FILE_NAME),
    },
    {
      contents: artifacts.generatedSource,
      path: join(artifacts.generatedDirectory, GENERATED_FILE_NAME),
    },
  ]);

  return {
    generatedFiles: [GENERATED_FILE_NAME],
    lock: artifacts.lock,
    manifest: artifacts.manifest,
  };
}

export async function buildBootstrapContractArtifacts(input) {
  return buildContractArtifacts(input);
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
  const result = await generateBootstrapContract(defaultPaths());
  process.stdout.write(`${canonicalizeJson(result)}`);
}
