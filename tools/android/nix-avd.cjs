"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn, spawnSync } = require("node:child_process");

const REPOSITORY_ROOT = path.resolve(__dirname, "../..");
const REPOSITORY_SPEC_PATH = path.join(
  REPOSITORY_ROOT,
  "nix/android-avd-spec.json",
);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid Android AVD specification field: ${label}.`);
  }
  return value;
}

function requireStringValue(value, label) {
  if (typeof value !== "string") {
    throw new Error(`Invalid Android AVD specification field: ${label}.`);
  }
  return value;
}

function loadSpec(specPath = process.env.JAMYE_ANDROID_AVD_SPEC) {
  const resolvedPath = specPath || REPOSITORY_SPEC_PATH;
  const parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  if (
    parsed.schemaVersion !== 1 ||
    !isPlainObject(parsed.systemImage) ||
    !isPlainObject(parsed.emulator) ||
    !isPlainObject(parsed.skin) ||
    !isPlainObject(parsed.skin.files) ||
    !isPlainObject(parsed.hardware)
  ) {
    throw new Error("Unsupported Android AVD specification schema.");
  }

  requireString(parsed.name, "name");
  requireString(parsed.device, "device");
  for (const key of [
    "api",
    "type",
    "abi",
    "revision",
    "extensionLevel",
    "isBaseSdk",
  ]) {
    requireString(parsed.systemImage[key], `systemImage.${key}`);
  }
  for (const key of ["packageVersion", "runtimeVersion", "buildId"]) {
    requireString(parsed.emulator[key], `emulator.${key}`);
  }
  for (const key of ["repository", "commit", "path"]) {
    requireString(parsed.skin[key], `skin.${key}`);
  }
  for (const [fileName, metadata] of Object.entries(parsed.skin.files)) {
    if (!isPlainObject(metadata)) {
      throw new Error(
        `Invalid Android AVD specification field: skin.files.${fileName}.`,
      );
    }
    requireString(metadata.sourceHash, `skin.files.${fileName}.sourceHash`);
    requireString(
      metadata.contentSha256,
      `skin.files.${fileName}.contentSha256`,
    );
  }
  for (const [key, value] of Object.entries(parsed.hardware)) {
    requireStringValue(value, `hardware.${key}`);
  }
  return parsed;
}

function parseIni(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function serializeIni(values) {
  return `${Object.keys(values)
    .sort()
    .map((key) => `${key}=${values[key]}`)
    .join("\n")}\n`;
}

function expectedAvdConfig(spec) {
  const { systemImage } = spec;
  return {
    ...spec.hardware,
    AvdId: spec.name,
    "abi.type": systemImage.abi,
    "avd.ini.displayname": spec.name,
    "avd.ini.encoding": "UTF-8",
    "image.sysdir.1": `system-images/android-${systemImage.api}/${systemImage.type}/${systemImage.abi}/`,
    "skin.path": path.posix.join("skins", spec.hardware["skin.name"]),
    target: `android-${systemImage.api}`,
  };
}

function expectedPointerConfig(spec, avdDirectory) {
  return {
    "avd.ini.encoding": "UTF-8",
    path: avdDirectory,
    target: `android-${spec.systemImage.api}`,
  };
}

function diffExpectedValues(actual, expected) {
  return Object.entries(expected)
    .filter(([key, value]) => actual[key] !== value)
    .map(([key, value]) => ({
      key,
      expected: value,
      actual: Object.prototype.hasOwnProperty.call(actual, key)
        ? actual[key]
        : "<missing>",
    }));
}

function requireEnvironment(name, env) {
  return requireString(env[name], `environment.${name}`);
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

function resolveAvdPaths(spec, avdHome) {
  return {
    pointerPath: path.join(avdHome, `${spec.name}.ini`),
    avdDirectory: path.join(avdHome, `${spec.name}.avd`),
  };
}

function assertIsolatedState(context) {
  const expectedStateHome = path.resolve(
    context.env.XDG_STATE_HOME || path.join(context.home, ".local/state"),
    "jamye-app/android",
  );
  const expectedAvdHome = path.join(context.stateHome, "avd");
  const expectedGradleHome = path.resolve(
    context.env.XDG_CACHE_HOME || path.join(context.home, ".cache"),
    "jamye-app/gradle",
  );
  const expectedPaths = {
    JAMYE_ANDROID_STATE_HOME: expectedStateHome,
    ANDROID_USER_HOME: path.join(context.stateHome, "user"),
    ANDROID_EMULATOR_HOME: path.join(context.stateHome, "emulator"),
    ANDROID_AVD_HOME: expectedAvdHome,
    GRADLE_USER_HOME: expectedGradleHome,
  };
  for (const [name, expected] of Object.entries(expectedPaths)) {
    if (path.resolve(requireEnvironment(name, context.env)) !== expected) {
      throw new Error(`${name} must equal ${expected}.`);
    }
  }
  if (
    context.stateHome === os.homedir() ||
    context.stateHome === REPOSITORY_ROOT ||
    isWithin(REPOSITORY_ROOT, context.stateHome) ||
    context.stateHome.startsWith("/nix/store/")
  ) {
    throw new Error(
      "Android mutable state is not in the isolated user state root.",
    );
  }
}

function resolveContext(env = process.env) {
  if (!env.IN_NIX_SHELL) {
    throw new Error(
      "Enter `nix develop path:.` before managing the project AVD.",
    );
  }
  const spec = loadSpec(env.JAMYE_ANDROID_AVD_SPEC);
  const home = path.resolve(requireEnvironment("HOME", env));
  const sdkRoot = path.resolve(requireEnvironment("ANDROID_HOME", env));
  const sdkRootAlias = path.resolve(
    requireEnvironment("ANDROID_SDK_ROOT", env),
  );
  if (sdkRoot !== sdkRootAlias || !sdkRoot.startsWith("/nix/store/")) {
    throw new Error(
      "ANDROID_HOME and ANDROID_SDK_ROOT must identify the same Nix SDK.",
    );
  }

  const context = {
    env,
    spec,
    home,
    sdkRoot,
    stateHome: path.resolve(
      requireEnvironment("JAMYE_ANDROID_STATE_HOME", env),
    ),
    avdHome: path.resolve(requireEnvironment("ANDROID_AVD_HOME", env)),
  };
  const expectedSystemImage = `system-images;android-${spec.systemImage.api};${spec.systemImage.type};${spec.systemImage.abi}`;
  if (
    requireEnvironment("JAMYE_ANDROID_AVD_SYSTEM_IMAGE", env) !==
    expectedSystemImage
  ) {
    throw new Error(
      "JAMYE_ANDROID_AVD_SYSTEM_IMAGE differs from the approved specification.",
    );
  }
  requireEnvironment("JAMYE_EXPECTED_CMDLINE_TOOLS", env);
  assertIsolatedState(context);
  return { ...context, ...resolveAvdPaths(spec, context.avdHome) };
}

function requireRegularPath(targetPath, label, kind = "file", fileSystem = fs) {
  const stat = fileSystem.lstatSync(targetPath);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink.`);
  if (kind === "file" && !stat.isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }
  if (kind === "directory" && !stat.isDirectory()) {
    throw new Error(`${label} must be a directory.`);
  }
  if (kind === "executable") {
    if (!stat.isFile()) throw new Error(`${label} must be a regular file.`);
    fileSystem.accessSync(targetPath, fs.constants.X_OK);
  }
}

function requireNixSdkPath(context, targetPath, label, kind, fileSystem = fs) {
  const absolutePath = path.resolve(targetPath);
  if (!isWithin(context.sdkRoot, absolutePath)) {
    throw new Error(`${label} must stay inside the Nix Android SDK.`);
  }

  const resolvedPath = fileSystem.realpathSync(absolutePath);
  if (!resolvedPath.startsWith(`/nix/store${path.sep}`)) {
    throw new Error(`${label} resolves outside /nix/store.`);
  }

  const stat = fileSystem.statSync(absolutePath);
  if (kind === "directory" && !stat.isDirectory()) {
    throw new Error(`${label} target must be a directory.`);
  }
  if ((kind === "file" || kind === "executable") && !stat.isFile()) {
    throw new Error(`${label} target must be a regular file.`);
  }
  if (kind === "executable") {
    try {
      fileSystem.accessSync(absolutePath, fs.constants.X_OK);
    } catch {
      throw new Error(`${label} target must be executable.`);
    }
  }
  return resolvedPath;
}

function readIniFile(targetPath, label, fileSystem = fs) {
  requireRegularPath(targetPath, label, "file", fileSystem);
  return parseIni(fileSystem.readFileSync(targetPath, "utf8"));
}

function readNixSdkIniFile(context, targetPath, label) {
  requireNixSdkPath(context, targetPath, label, "file");
  return parseIni(fs.readFileSync(targetPath, "utf8"));
}

function formatDiff(label, diffs) {
  return [
    `${label} does not match the approved specification:`,
    ...diffs.map(
      ({ key, expected, actual }) =>
        `- ${key}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`,
    ),
  ].join("\n");
}

function systemImageDirectory(context) {
  const { api, type, abi } = context.spec.systemImage;
  return path.join(
    context.sdkRoot,
    "system-images",
    `android-${api}`,
    type,
    abi,
  );
}

function avdManagerPath(context) {
  return path.join(
    context.sdkRoot,
    "cmdline-tools",
    context.env.JAMYE_EXPECTED_CMDLINE_TOOLS,
    "bin",
    "avdmanager",
  );
}

function verifySystemImage(context) {
  const imageDirectory = systemImageDirectory(context);
  requireNixSdkPath(
    context,
    imageDirectory,
    "Nix Android system image",
    "directory",
  );
  const properties = readNixSdkIniFile(
    context,
    path.join(imageDirectory, "source.properties"),
    "Nix Android system-image metadata",
  );
  const image = context.spec.systemImage;
  const diffs = diffExpectedValues(properties, {
    "AndroidVersion.ApiLevel": image.api,
    "AndroidVersion.ExtensionLevel": image.extensionLevel,
    "AndroidVersion.IsBaseSdk": image.isBaseSdk,
    "Pkg.Revision": image.revision,
    "SystemImage.Abi": image.abi,
    "SystemImage.TagId": image.type,
  });
  if (diffs.length > 0) throw new Error(formatDiff("System image", diffs));
  verifyNixStoreSkin(context);
}

function verifyNixStoreSkin(context, fileSystem = fs) {
  const skinPath = path.join(
    context.sdkRoot,
    "skins",
    context.spec.hardware["skin.name"],
  );
  const entryStat = fileSystem.lstatSync(skinPath);
  if (!entryStat.isSymbolicLink() && !entryStat.isDirectory()) {
    throw new Error("Nix Pixel 9 skin must be a directory or symlink.");
  }

  const resolvedPath = requireNixSdkPath(
    context,
    skinPath,
    "Nix Pixel 9 skin",
    "directory",
    fileSystem,
  );

  for (const [fileName, metadata] of Object.entries(
    context.spec.skin.files,
  ).sort(([left], [right]) => left.localeCompare(right))) {
    const filePath = path.join(skinPath, fileName);
    const fileStat = fileSystem.lstatSync(filePath);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      throw new Error(
        `Nix Pixel 9 skin file ${fileName} must be a regular file.`,
      );
    }
    const actualSha256 = crypto
      .createHash("sha256")
      .update(fileSystem.readFileSync(filePath))
      .digest("hex");
    if (actualSha256 !== metadata.contentSha256) {
      throw new Error(
        `Nix Pixel 9 skin file ${fileName} content hash differs from the approved specification.`,
      );
    }
  }

  return { skinPath, resolvedPath };
}

function verifyDeviceProfile(context) {
  const avdManager = avdManagerPath(context);
  requireNixSdkPath(context, avdManager, "Nix avdmanager", "executable");
  const devices = execFileSync(avdManager, ["list", "device", "-c"], {
    encoding: "utf8",
    env: context.env,
  });
  if (!devices.split(/\r?\n/u).includes(context.spec.device)) {
    throw new Error(
      `Nix command-line tools do not provide device profile ${context.spec.device}.`,
    );
  }
}

function verifyEmulator(context) {
  const emulatorPath = path.join(context.sdkRoot, "emulator", "emulator");
  const resolvedEmulatorPath = requireNixSdkPath(
    context,
    emulatorPath,
    "Nix Android Emulator",
    "executable",
  );
  const output = execFileSync(emulatorPath, ["-version"], {
    encoding: "utf8",
    env: context.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const version = output.match(
    /Android emulator version ([^ ]+) \(build_id ([^)]+)\)/u,
  );
  if (
    !version ||
    version[1] !== context.spec.emulator.runtimeVersion ||
    version[2] !== context.spec.emulator.buildId
  ) {
    throw new Error(
      "Nix Android Emulator runtime version or build ID differs from the approved specification.",
    );
  }
  return path.dirname(resolvedEmulatorPath);
}

function findRunningEmulatorCommand(
  spec,
  sdkRoot,
  processList,
  resolvedEmulatorRoot = path.join(sdkRoot, "emulator"),
) {
  const marker = ` -avd ${spec.name}`;
  const candidates = processList
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.includes(" -avd ") && line.includes("/emulator/"));

  const canonicalRuntimeRoot = path.resolve(resolvedEmulatorRoot);
  if (!canonicalRuntimeRoot.startsWith(`/nix/store${path.sep}`)) {
    throw new Error(
      "Resolved Android Emulator runtime must stay in /nix/store.",
    );
  }
  const allowedRoots = [
    path.resolve(sdkRoot, "emulator"),
    canonicalRuntimeRoot,
  ];
  const foreign = candidates.find((command) => {
    const executable = path.resolve(command.split(/\s+/u)[0]);
    return !allowedRoots.some((root) => isWithin(root, executable));
  });
  if (foreign) {
    throw new Error(
      `An Android Emulator is running outside the Nix SDK: ${foreign.split(/\s+/u)[0]}.`,
    );
  }
  return candidates.find((command) => command.includes(marker)) || null;
}

function verifyRunningEmulatorOrigin(context, resolvedEmulatorRoot) {
  const processList = execFileSync("/bin/ps", ["-axo", "command="], {
    encoding: "utf8",
  });
  return findRunningEmulatorCommand(
    context.spec,
    context.sdkRoot,
    processList,
    resolvedEmulatorRoot,
  );
}

function verifyAvd(context, fileSystem = fs) {
  requireRegularPath(
    context.avdDirectory,
    "Project AVD",
    "directory",
    fileSystem,
  );
  const config = readIniFile(
    path.join(context.avdDirectory, "config.ini"),
    "Project AVD config",
    fileSystem,
  );
  const configDiffs = diffExpectedValues(
    config,
    expectedAvdConfig(context.spec),
  );
  if (configDiffs.length > 0) {
    throw new Error(formatDiff("Project AVD config", configDiffs));
  }

  const pointer = readIniFile(
    context.pointerPath,
    "Project AVD pointer",
    fileSystem,
  );
  const pointerDiffs = diffExpectedValues(
    pointer,
    expectedPointerConfig(context.spec, context.avdDirectory),
  );
  if (pointerDiffs.length > 0) {
    throw new Error(formatDiff("Project AVD pointer", pointerDiffs));
  }
}

function verify(context = resolveContext()) {
  verifySystemImage(context);
  verifyDeviceProfile(context);
  const resolvedEmulatorRoot = verifyEmulator(context);
  verifyRunningEmulatorOrigin(context, resolvedEmulatorRoot);
  verifyAvd(context);
  console.log(`nix-avd: PASS (${context.spec.name})`);
  return context;
}

function ensureDirectory(targetPath, label) {
  fs.mkdirSync(targetPath, { recursive: true });
  requireRegularPath(targetPath, label, "directory");
}

function requireCompleteAvdState(context, fileSystem = fs) {
  const pointerExists = fileSystem.existsSync(context.pointerPath);
  const directoryExists = fileSystem.existsSync(context.avdDirectory);
  if (!pointerExists && !directoryExists) {
    throw new Error(
      "Project AVD does not exist; run `bun tools/android/nix-avd.cjs create` first.",
    );
  }
  if (!pointerExists || !directoryExists) {
    throw new Error(
      "A partial project AVD exists; inspect it before any recovery action.",
    );
  }
}

function updateCreatedAvd(context, fileSystem = fs) {
  requireCompleteAvdState(context, fileSystem);
  requireRegularPath(
    context.avdDirectory,
    "Project AVD",
    "directory",
    fileSystem,
  );
  const configPath = path.join(context.avdDirectory, "config.ini");
  const config = readIniFile(configPath, "Project AVD config", fileSystem);
  const pointer = readIniFile(
    context.pointerPath,
    "Project AVD pointer",
    fileSystem,
  );
  const nextConfig = serializeIni({
    ...config,
    ...expectedAvdConfig(context.spec),
  });
  const nextPointer = serializeIni({
    ...pointer,
    ...expectedPointerConfig(context.spec, context.avdDirectory),
  });

  fileSystem.writeFileSync(configPath, nextConfig, "utf8");
  fileSystem.writeFileSync(context.pointerPath, nextPointer, "utf8");
  verifyAvd(context, fileSystem);
}

function reconcileAvdFiles(context, fileSystem = fs) {
  updateCreatedAvd(context, fileSystem);
  return context;
}

function requireStoppedAvd(spec, runningCommand) {
  if (runningCommand) {
    throw new Error(
      `Project AVD ${spec.name} must be stopped before reconcile.`,
    );
  }
}

function reconcile(context = resolveContext()) {
  verifySystemImage(context);
  verifyDeviceProfile(context);
  const resolvedEmulatorRoot = verifyEmulator(context);
  const runningCommand = verifyRunningEmulatorOrigin(
    context,
    resolvedEmulatorRoot,
  );
  requireStoppedAvd(context.spec, runningCommand);
  reconcileAvdFiles(context);
  console.log(`nix-avd: PASS (reconciled ${context.spec.name})`);
  return context;
}

function create(context = resolveContext()) {
  verifySystemImage(context);
  verifyDeviceProfile(context);
  const resolvedEmulatorRoot = verifyEmulator(context);
  verifyRunningEmulatorOrigin(context, resolvedEmulatorRoot);
  const pointerExists = fs.existsSync(context.pointerPath);
  const directoryExists = fs.existsSync(context.avdDirectory);
  if (pointerExists || directoryExists) {
    if (pointerExists && directoryExists) return verify(context);
    throw new Error(
      "A partial project AVD exists; inspect it before any recovery action.",
    );
  }

  ensureDirectory(context.stateHome, "Android state root");
  ensureDirectory(context.avdHome, "Android AVD home");
  ensureDirectory(
    path.dirname(context.env.ANDROID_USER_HOME),
    "Android user-home parent",
  );
  ensureDirectory(context.env.ANDROID_USER_HOME, "Android user home");
  ensureDirectory(context.env.ANDROID_EMULATOR_HOME, "Android Emulator home");

  const avdManager = avdManagerPath(context);
  requireNixSdkPath(context, avdManager, "Nix avdmanager", "executable");
  const result = spawnSync(
    avdManager,
    [
      "create",
      "avd",
      "--name",
      context.spec.name,
      "--package",
      context.env.JAMYE_ANDROID_AVD_SYSTEM_IMAGE,
      "--device",
      context.spec.device,
    ],
    {
      encoding: "utf8",
      env: context.env,
      input: "no\n",
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (result.status !== 0) {
    throw new Error(`avdmanager exited with status ${result.status}.`);
  }

  updateCreatedAvd(context);
  return verify(context);
}

function selectRunningAvdSerial(avdName, candidates) {
  const matches = candidates.filter(
    (candidate) => candidate.avdName === avdName,
  );
  if (matches.length > 1) {
    throw new Error(
      `Multiple running Emulators expose project AVD ${avdName}; refusing an ambiguous operation.`,
    );
  }
  return matches[0]?.serial ?? null;
}

function runningAvdSerial(context) {
  const adb = path.join(context.sdkRoot, "platform-tools", "adb");
  requireNixSdkPath(context, adb, "Nix adb", "executable");
  const devices = execFileSync(adb, ["devices"], {
    encoding: "utf8",
    env: context.env,
  });
  const candidates = [];
  for (const line of devices.split(/\r?\n/u)) {
    const [serial, state] = line.trim().split(/\s+/u);
    if (!serial?.startsWith("emulator-") || state !== "device") continue;
    try {
      const name = execFileSync(adb, ["-s", serial, "emu", "avd", "name"], {
        encoding: "utf8",
        env: context.env,
      }).split(/\r?\n/u)[0];
      candidates.push({ serial, avdName: name });
    } catch {
      // Ignore an emulator that disappears while the device list is inspected.
    }
  }
  return selectRunningAvdSerial(context.spec.name, candidates);
}

function start(context = verify()) {
  const existingSerial = runningAvdSerial(context);
  if (existingSerial) {
    console.log(`nix-avd: already running (${existingSerial})`);
    return { context, serial: existingSerial, pid: null };
  }

  const logDirectory = path.join(context.stateHome, "logs");
  ensureDirectory(logDirectory, "Android Emulator log directory");
  const logPath = path.join(logDirectory, `${context.spec.name}.log`);
  const logFd = fs.openSync(logPath, "a");
  const emulatorPath = path.join(context.sdkRoot, "emulator", "emulator");
  let child;
  try {
    child = spawn(emulatorPath, ["-avd", context.spec.name], {
      detached: true,
      env: context.env,
      stdio: ["ignore", logFd, logFd],
    });
  } finally {
    fs.closeSync(logFd);
  }
  child.unref();
  console.log(`nix-avd: started pid=${child.pid} log=${logPath}`);
  return { context, serial: null, pid: child.pid };
}

function stop(context = verify()) {
  const serial = runningAvdSerial(context);
  if (!serial) {
    throw new Error(
      `Project AVD ${context.spec.name} is not running; refusing an unscoped stop.`,
    );
  }

  const adb = path.join(context.sdkRoot, "platform-tools", "adb");
  requireNixSdkPath(context, adb, "Nix adb", "executable");
  execFileSync(adb, ["-s", serial, "emu", "kill"], {
    encoding: "utf8",
    env: context.env,
  });
  console.log(`nix-avd: stopped ${context.spec.name} (${serial})`);
  return { context, serial };
}

function usage() {
  return "Usage: bun tools/android/nix-avd.cjs <verify|create|reconcile|start|stop>";
}

function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (rest.length > 0) throw new Error(usage());
  if (command === "verify") return verify();
  if (command === "create") return create();
  if (command === "reconcile") return reconcile();
  if (command === "start") return start();
  if (command === "stop") return stop();
  throw new Error(usage());
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`nix-avd: FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  diffExpectedValues,
  expectedAvdConfig,
  expectedPointerConfig,
  findRunningEmulatorCommand,
  loadSpec,
  main,
  parseIni,
  reconcileAvdFiles,
  requireNixSdkPath,
  requireStoppedAvd,
  resolveAvdPaths,
  selectRunningAvdSerial,
  serializeIni,
  verifyNixStoreSkin,
};
