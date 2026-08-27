type AvdSpec = {
  schemaVersion: number;
  name: string;
  device: string;
  systemImage: {
    api: string;
    extensionLevel: string;
    isBaseSdk: string;
    type: string;
    abi: string;
    revision: string;
  };
  emulator: {
    packageVersion: string;
    runtimeVersion: string;
    buildId: string;
  };
  skin: {
    repository: string;
    commit: string;
    path: string;
    files: Record<
      string,
      {
        sourceHash: string;
        contentSha256: string;
      }
    >;
  };
  hardware: Record<string, string>;
};

type IniDiff = { key: string; expected: string; actual: string };

type FileStat = {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
};

type NixSdkPathFileSystem = {
  accessSync(path: string, mode: number): void;
  realpathSync(path: string): string;
  statSync(path: string): FileStat;
};

type SkinFileSystem = {
  lstatSync(path: string): FileStat;
  readFileSync(path: string): Uint8Array;
  realpathSync(path: string): string;
  statSync(path: string): FileStat;
};

type AvdContext = {
  spec: AvdSpec;
  sdkRoot: string;
  pointerPath: string;
  avdDirectory: string;
};

type AvdStateFileSystem = {
  existsSync(path: string): boolean;
  lstatSync(path: string): FileStat;
  readFileSync(path: string, encoding: "utf8"): string;
  writeFileSync(path: string, contents: string, encoding: "utf8"): void;
};

type NixAvdModule = {
  diffExpectedValues(
    actual: Record<string, string>,
    expected: Record<string, string>,
  ): IniDiff[];
  expectedAvdConfig(spec: AvdSpec): Record<string, string>;
  expectedPointerConfig(
    spec: AvdSpec,
    avdDirectory: string,
  ): Record<string, string>;
  findRunningEmulatorCommand(
    spec: AvdSpec,
    sdkRoot: string,
    processList: string,
    resolvedEmulatorRoot?: string,
  ): string | null;
  loadSpec(specPath: string): AvdSpec;
  main(argv: string[]): unknown;
  parseIni(contents: string): Record<string, string>;
  reconcileAvdFiles(
    context: AvdContext,
    fileSystem: AvdStateFileSystem,
  ): AvdContext;
  requireNixSdkPath(
    context: { sdkRoot: string },
    targetPath: string,
    label: string,
    kind: "directory" | "executable" | "file",
    fileSystem: NixSdkPathFileSystem,
  ): string;
  requireStoppedAvd(spec: AvdSpec, runningCommand: string | null): void;
  resolveAvdPaths(
    spec: AvdSpec,
    avdHome: string,
  ): { pointerPath: string; avdDirectory: string };
  serializeIni(values: Record<string, string>): string;
  selectRunningAvdSerial(
    avdName: string,
    candidates: { serial: string; avdName: string }[],
  ): string | null;
  verifyNixStoreSkin(
    context: { sdkRoot: string; spec: AvdSpec },
    fileSystem: SkinFileSystem,
  ): { skinPath: string; resolvedPath: string };
};

const tool = jest.requireActual<NixAvdModule>(
  "../../tools/android/nix-avd.cjs",
);
const specPath = `${process.cwd()}/nix/android-avd-spec.json`;

describe("M3 Nix-owned Android AVD contract", () => {
  test("pins every native-build SDK component without writable auto-install fallbacks", () => {
    const { readFileSync } = jest.requireActual("node:fs") as {
      readFileSync: (path: string, encoding: "utf8") => string;
    };
    const versions = readFileSync(
      `${process.cwd()}/nix/toolchain-versions.nix`,
      "utf8",
    );
    const composition = readFileSync(
      `${process.cwd()}/nix/android-sdk.nix`,
      "utf8",
    );
    const devShell = readFileSync(`${process.cwd()}/nix/dev-shell.nix`, "utf8");
    const diagnostic = readFileSync(
      `${process.cwd()}/tools/diagnostics/toolchain-check.sh`,
      "utf8",
    );

    expect(versions).toContain('buildTools = "36.0.0";');
    expect(versions).toContain('agpDefaultBuildTools = "35.0.0";');
    expect(versions).toContain('cmake = "3.22.1";');
    expect(versions).toContain('ndk = "27.1.12297006";');
    expect(composition).toContain("androidVersions.agpDefaultBuildTools");
    expect(composition).toContain("androidVersions.buildTools");
    expect(composition).toContain("includeCmake = true;");
    expect(composition).toContain("cmakeVersions = [ androidVersions.cmake ];");
    expect(composition).toContain("includeNDK = true;");
    expect(composition).toContain("ndkVersions = [ androidVersions.ndk ];");
    expect(devShell).toContain(
      "JAMYE_EXPECTED_AGP_DEFAULT_BUILD_TOOLS = androidVersions.agpDefaultBuildTools;",
    );
    expect(devShell).toContain(
      "JAMYE_EXPECTED_ANDROID_NDK = androidVersions.ndk;",
    );
    expect(devShell).toContain(
      "JAMYE_EXPECTED_ANDROID_CMAKE = androidVersions.cmake;",
    );
    expect(devShell).not.toMatch(/\bCMAKE_VERSION\s*=/);
    expect(devShell).toContain("unset ANDROID_NDK_HOME ANDROID_NDK_ROOT");
    expect(devShell).not.toMatch(/ANDROID_NDK_(?:HOME|ROOT)\s*=/);
    expect(diagnostic).toContain(
      'local ndk_dir="$root/ndk/$JAMYE_EXPECTED_ANDROID_NDK"',
    );
    expect(diagnostic).toContain(
      "property_value \"$ndk_dir/source.properties\" 'Pkg.Revision'",
    );
    expect(diagnostic).toContain(
      'check_android_build_tools_revision "$root" "$JAMYE_EXPECTED_AGP_DEFAULT_BUILD_TOOLS"',
    );
    expect(diagnostic).toContain(
      'local cmake_dir="$root/cmake/$JAMYE_EXPECTED_ANDROID_CMAKE"',
    );
    expect(diagnostic).toContain('check_android_cmake "$ANDROID_SDK_ROOT"');
    expect(diagnostic).toContain('check_android_ndk "$ANDROID_SDK_ROOT"');
    expect(diagnostic).not.toMatch(/sdkmanager[^\n]*(?:--install|--licenses)/);
  });

  test("parses Android source.properties keys with or without spaces around equals", () => {
    const { execFileSync } = jest.requireActual("node:child_process") as {
      execFileSync(
        command: string,
        args: string[],
        options: { encoding: "utf8" },
      ): string;
    };
    const diagnosticPath = `${process.cwd()}/tools/diagnostics/toolchain-check.sh`;
    const parseRevision = (propertyLine: string) =>
      execFileSync(
        "bash",
        [
          "-c",
          'source "$1"; property_value <(printf "%s\\n" "$2") Pkg.Revision',
          "bash",
          diagnosticPath,
          propertyLine,
        ],
        { encoding: "utf8" },
      ).trim();

    expect(parseRevision("Pkg.Revision=27.1.12297006")).toBe("27.1.12297006");
    expect(parseRevision("Pkg.Revision = 27.1.12297006")).toBe("27.1.12297006");
  });

  test("pins the observed Pixel 9 hardware and package identity", () => {
    const spec = tool.loadSpec(specPath);

    expect(spec).toMatchObject({
      schemaVersion: 1,
      name: "jamye_pixel_9_api_36",
      device: "pixel_9",
      systemImage: {
        api: "36.1",
        extensionLevel: "20",
        isBaseSdk: "true",
        type: "google_apis_playstore",
        abi: "arm64-v8a",
        revision: "4",
      },
      emulator: {
        packageVersion: "37.1.11",
        runtimeVersion: "37.1.11.0",
        buildId: "15917651",
      },
      skin: {
        repository: "https://android.googlesource.com/platform/tools/adt/idea",
        commit: "ffa01542c9913977fa2cb8e518b49b8de0c05c9e",
        path: "artwork/resources/device-art-resources/pixel_9",
        files: {
          layout: {
            sourceHash: "sha256-lKlH/xWX/XP7F57YOUCxcjcoWNZuTTL3+wFOmBPZZvw=",
            contentSha256:
              "fd024b14e9d7c38042be3d2bd4dad0e93fb3d6cfe0e1884a1d15d23063103e4a",
          },
          "back.webp": {
            sourceHash: "sha256-BSNKszMH1hrnQKtJ9KdZSkg+rMVfTVUM9zfFM8KjIZw=",
            contentSha256:
              "d8ed1bcf314de2c293ee7ba7744349fa9233d24d47798189f9660369cae16f2d",
          },
          "mask.webp": {
            sourceHash: "sha256-FvaY99G9szIkcHWH67XtOQtcKVhOUabeuckgHwuzcwg=",
            contentSha256:
              "6f4fb00c5147da694c4d0b3c45c0b580db94b81b77528985b6f30e4c944f1ac4",
          },
        },
      },
      hardware: {
        "disk.dataPartition.size": "10G",
        "hw.cpu.ncore": "4",
        "hw.device.name": "pixel_9",
        "hw.lcd.density": "420",
        "hw.lcd.height": "2424",
        "hw.lcd.width": "1080",
        "hw.ramSize": "2048",
        "sdcard.size": "512M",
      },
    });
  });

  test("keeps the AVD skin path SDK-relative across Nix store changes", () => {
    const spec = tool.loadSpec(specPath);
    const config = tool.expectedAvdConfig(spec);

    expect(config).toMatchObject({
      AvdId: "jamye_pixel_9_api_36",
      "abi.type": "arm64-v8a",
      "image.sysdir.1":
        "system-images/android-36.1/google_apis_playstore/arm64-v8a/",
      "skin.path": "skins/pixel_9",
      target: "android-36.1",
    });
    expect(config).not.toHaveProperty("hw.device.hash2");
    expect(JSON.stringify(config)).not.toContain("/nix/store/");
    expect(JSON.stringify(config)).not.toContain(
      "/Users/example/Library/Android/sdk",
    );
  });

  test("accepts an intentional empty hardware INI value", () => {
    const spec = tool.loadSpec(specPath);

    expect(spec.hardware["fastboot.chosenSnapshotFile"]).toBe("");
  });

  test("accepts only the hash-matched Pixel 9 skin symlink resolved inside the Nix store", () => {
    const { createHash } = jest.requireActual("node:crypto") as {
      createHash(algorithm: "sha256"): {
        update(value: Uint8Array): { digest(encoding: "hex"): string };
      };
    };
    const spec = tool.loadSpec(specPath);
    const contents = Object.fromEntries(
      Object.keys(spec.skin.files).map((fileName) => [
        fileName,
        new TextEncoder().encode(`fixture:${fileName}`),
      ]),
    );
    const files = Object.fromEntries(
      Object.entries(contents).map(([fileName, content]) => [
        fileName,
        {
          ...spec.skin.files[fileName],
          contentSha256: createHash("sha256").update(content).digest("hex"),
        },
      ]),
    );
    const skinPath = "/nix/store/sdk/libexec/android-sdk/skins/pixel_9";
    const directoryStat: FileStat = {
      isDirectory: () => true,
      isFile: () => false,
      isSymbolicLink: () => false,
    };
    const fileStat: FileStat = {
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
    };
    const linkStat: FileStat = {
      isDirectory: () => false,
      isFile: () => false,
      isSymbolicLink: () => true,
    };
    const fileSystem: SkinFileSystem = {
      lstatSync: (targetPath) =>
        targetPath === skinPath ? linkStat : fileStat,
      readFileSync: (targetPath) =>
        contents[targetPath.slice(targetPath.lastIndexOf("/") + 1)],
      realpathSync: () => "/nix/store/pinned-pixel-9-skin",
      statSync: () => directoryStat,
    };
    const context = {
      sdkRoot: "/nix/store/sdk/libexec/android-sdk",
      spec: { ...spec, skin: { ...spec.skin, files } },
    };

    expect(tool.verifyNixStoreSkin(context, fileSystem)).toEqual({
      skinPath,
      resolvedPath: "/nix/store/pinned-pixel-9-skin",
    });
    expect(() =>
      tool.verifyNixStoreSkin(context, {
        ...fileSystem,
        realpathSync: () => "/Users/example/Library/Android/sdk/skins/pixel_9",
      }),
    ).toThrow("resolves outside /nix/store");
    expect(() =>
      tool.verifyNixStoreSkin(context, {
        ...fileSystem,
        readFileSync: () => new TextEncoder().encode("tampered"),
      }),
    ).toThrow("content hash differs");
  });

  test("accepts Nix SDK executable links without allowing foreign or non-executable targets", () => {
    const sdkRoot = "/nix/store/sdk/libexec/android-sdk";
    const executablePath = `${sdkRoot}/cmdline-tools/21.0/bin/avdmanager`;
    const fileStat: FileStat = {
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
    };
    const fileSystem: NixSdkPathFileSystem = {
      accessSync: () => undefined,
      realpathSync: () => "/nix/store/pinned-command-line-tools/bin/avdmanager",
      statSync: () => fileStat,
    };

    expect(
      tool.requireNixSdkPath(
        { sdkRoot },
        executablePath,
        "Nix avdmanager",
        "executable",
        fileSystem,
      ),
    ).toBe("/nix/store/pinned-command-line-tools/bin/avdmanager");
    expect(() =>
      tool.requireNixSdkPath(
        { sdkRoot },
        "/Users/example/Library/Android/sdk/cmdline-tools/bin/avdmanager",
        "Nix avdmanager",
        "executable",
        fileSystem,
      ),
    ).toThrow("must stay inside the Nix Android SDK");
    expect(() =>
      tool.requireNixSdkPath(
        { sdkRoot },
        executablePath,
        "Nix avdmanager",
        "executable",
        {
          ...fileSystem,
          realpathSync: () =>
            "/Users/example/Library/Android/sdk/cmdline-tools/bin/avdmanager",
        },
      ),
    ).toThrow("resolves outside /nix/store");
    expect(() =>
      tool.requireNixSdkPath(
        { sdkRoot },
        executablePath,
        "Nix avdmanager",
        "executable",
        {
          ...fileSystem,
          accessSync: () => {
            throw new Error("EACCES");
          },
        },
      ),
    ).toThrow("target must be executable");
  });

  test("preserves empty INI values and reports exact missing or changed keys", () => {
    const parsed = tool.parseIni(
      "fastboot.chosenSnapshotFile=\nhw.cpu.ncore=2\n# ignored\n",
    );

    expect(parsed).toEqual({
      "fastboot.chosenSnapshotFile": "",
      "hw.cpu.ncore": "2",
    });
    expect(tool.parseIni(tool.serializeIni(parsed))).toEqual(parsed);
    expect(
      tool.diffExpectedValues(parsed, {
        "hw.cpu.ncore": "4",
        "hw.ramSize": "2048",
      }),
    ).toEqual([
      { key: "hw.cpu.ncore", expected: "4", actual: "2" },
      { key: "hw.ramSize", expected: "2048", actual: "<missing>" },
    ]);
  });

  test("reconciles only declarative AVD keys after a Nix SDK store-path change", () => {
    const spec = tool.loadSpec(specPath);
    const context: AvdContext = {
      spec,
      sdkRoot: "/nix/store/new-sdk/libexec/android-sdk",
      pointerPath: "/state/avd/jamye_pixel_9_api_36.ini",
      avdDirectory: "/state/avd/jamye_pixel_9_api_36.avd",
    };
    const configPath = `${context.avdDirectory}/config.ini`;
    const userDataPath = `${context.avdDirectory}/userdata-qemu.img`;
    const snapshotPath = `${context.avdDirectory}/snapshots/default_boot/ram.img`;
    const files = new Map<string, string>([
      [
        configPath,
        [
          "custom.preserved=config-value",
          "hw.cpu.ncore=2",
          "skin.name=pixel_9",
          "skin.path=/nix/store/old-sdk/libexec/android-sdk/skins/pixel_9",
          "",
        ].join("\n"),
      ],
      [
        context.pointerPath,
        [
          "avd.ini.encoding=UTF-8",
          "custom.preserved=pointer-value",
          "path=/state/avd/old-location.avd",
          "target=android-36.1",
          "",
        ].join("\n"),
      ],
      [userDataPath, "opaque-user-data"],
      [snapshotPath, "opaque-snapshot-data"],
    ]);
    const directories = new Set([context.avdDirectory]);
    const writes: string[] = [];
    const directoryStat: FileStat = {
      isDirectory: () => true,
      isFile: () => false,
      isSymbolicLink: () => false,
    };
    const fileStat: FileStat = {
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
    };
    const fileSystem: AvdStateFileSystem = {
      existsSync: (targetPath) =>
        directories.has(targetPath) || files.has(targetPath),
      lstatSync: (targetPath) => {
        if (directories.has(targetPath)) return directoryStat;
        if (files.has(targetPath)) return fileStat;
        throw new Error(`ENOENT: ${targetPath}`);
      },
      readFileSync: (targetPath) => {
        const contents = files.get(targetPath);
        if (contents === undefined) throw new Error(`ENOENT: ${targetPath}`);
        return contents;
      },
      writeFileSync: (targetPath, contents) => {
        writes.push(targetPath);
        files.set(targetPath, contents);
      },
    };

    expect(tool.reconcileAvdFiles(context, fileSystem)).toBe(context);
    expect(tool.parseIni(files.get(configPath) ?? "")).toMatchObject({
      "custom.preserved": "config-value",
      "hw.cpu.ncore": "4",
      "skin.name": "pixel_9",
      "skin.path": "skins/pixel_9",
    });
    expect(tool.parseIni(files.get(context.pointerPath) ?? "")).toMatchObject({
      "custom.preserved": "pointer-value",
      path: context.avdDirectory,
      target: "android-36.1",
    });
    expect(files.get(userDataPath)).toBe("opaque-user-data");
    expect(files.get(snapshotPath)).toBe("opaque-snapshot-data");
    expect(writes).toEqual([configPath, context.pointerPath]);
  });

  test("refuses missing, partial, or running AVD reconciliation", () => {
    const spec = tool.loadSpec(specPath);
    const context: AvdContext = {
      spec,
      sdkRoot: "/nix/store/new-sdk/libexec/android-sdk",
      pointerPath: "/state/avd/jamye_pixel_9_api_36.ini",
      avdDirectory: "/state/avd/jamye_pixel_9_api_36.avd",
    };
    const noWrites: string[] = [];
    const missingFileSystem: AvdStateFileSystem = {
      existsSync: () => false,
      lstatSync: () => {
        throw new Error("unexpected lstat");
      },
      readFileSync: () => {
        throw new Error("unexpected read");
      },
      writeFileSync: (targetPath) => {
        noWrites.push(targetPath);
      },
    };
    const partialFileSystem: AvdStateFileSystem = {
      ...missingFileSystem,
      existsSync: (targetPath) => targetPath === context.pointerPath,
    };

    expect(() => tool.reconcileAvdFiles(context, missingFileSystem)).toThrow(
      "Project AVD does not exist",
    );
    expect(() => tool.reconcileAvdFiles(context, partialFileSystem)).toThrow(
      "A partial project AVD exists",
    );
    expect(() =>
      tool.requireStoppedAvd(
        spec,
        `/nix/store/emulator/qemu-system-aarch64 -avd ${spec.name}`,
      ),
    ).toThrow(`Project AVD ${spec.name} must be stopped before reconcile`);
    expect(tool.requireStoppedAvd(spec, null)).toBeUndefined();
    expect(noWrites).toEqual([]);
  });

  test("resolves the same-name AVD only below the supplied isolated home", () => {
    const spec = tool.loadSpec(specPath);

    expect(tool.resolveAvdPaths(spec, "/state/jamye-app/android/avd")).toEqual({
      pointerPath: "/state/jamye-app/android/avd/jamye_pixel_9_api_36.ini",
      avdDirectory: "/state/jamye-app/android/avd/jamye_pixel_9_api_36.avd",
    });
  });

  test("accepts only the active SDK and its resolved Nix Emulator runtime", () => {
    const spec = tool.loadSpec(specPath);
    const sdkRoot = "/nix/store/example/libexec/android-sdk";
    const resolvedEmulatorRoot =
      "/nix/store/emulator-package/libexec/android-sdk/emulator";
    const sdkCommand = `${sdkRoot}/emulator/qemu/darwin-aarch64/qemu-system-aarch64 -avd ${spec.name}`;
    const resolvedCommand = `${resolvedEmulatorRoot}/qemu/darwin-aarch64/qemu-system-aarch64 -avd ${spec.name}`;

    expect(
      tool.findRunningEmulatorCommand(
        spec,
        sdkRoot,
        sdkCommand,
        resolvedEmulatorRoot,
      ),
    ).toBe(sdkCommand);
    expect(
      tool.findRunningEmulatorCommand(
        spec,
        sdkRoot,
        resolvedCommand,
        resolvedEmulatorRoot,
      ),
    ).toBe(resolvedCommand);
    expect(
      tool.findRunningEmulatorCommand(
        spec,
        sdkRoot,
        "unrelated",
        resolvedEmulatorRoot,
      ),
    ).toBeNull();
    expect(() =>
      tool.findRunningEmulatorCommand(
        spec,
        sdkRoot,
        `/nix/store/unrelated-emulator/libexec/android-sdk/emulator/qemu/darwin-aarch64/qemu-system-aarch64 -avd ${spec.name}`,
        resolvedEmulatorRoot,
      ),
    ).toThrow("outside the Nix SDK");
    expect(() =>
      tool.findRunningEmulatorCommand(
        spec,
        sdkRoot,
        `/Users/example/Library/Android/sdk/emulator/qemu/darwin-aarch64/qemu-system-aarch64 -avd ${spec.name}`,
        resolvedEmulatorRoot,
      ),
    ).toThrow("outside the Nix SDK");
    expect(() =>
      tool.findRunningEmulatorCommand(
        spec,
        sdkRoot,
        "/Users/example/Library/Android/sdk/emulator/qemu/darwin-aarch64/qemu-system-aarch64 -avd unrelated",
        resolvedEmulatorRoot,
      ),
    ).toThrow("outside the Nix SDK");
    expect(() =>
      tool.findRunningEmulatorCommand(
        spec,
        sdkRoot,
        resolvedCommand,
        "/Users/example/Library/Android/sdk/emulator",
      ),
    ).toThrow("must stay in /nix/store");
  });

  test("normalizes Emulator console CRLF before exact AVD-name comparison", () => {
    const { readFileSync } = jest.requireActual("node:fs") as {
      readFileSync: (path: string, encoding: "utf8") => string;
    };
    const diagnostic = readFileSync(
      `${process.cwd()}/tools/diagnostics/toolchain-check.sh`,
      "utf8",
    );

    const avdNameLine = diagnostic
      .split("\n")
      .find((line) => line.includes("emu avd name"));
    expect(avdNameLine).toContain("| head -n 1 | tr -d '\\r'");
  });

  test("selects only one exact project AVD for a bounded stop", () => {
    const spec = tool.loadSpec(specPath);

    expect(
      tool.selectRunningAvdSerial(spec.name, [
        { serial: "emulator-5554", avdName: "unrelated" },
        { serial: "emulator-5556", avdName: spec.name },
      ]),
    ).toBe("emulator-5556");
    expect(tool.selectRunningAvdSerial(spec.name, [])).toBeNull();
    expect(() =>
      tool.selectRunningAvdSerial(spec.name, [
        { serial: "emulator-5554", avdName: spec.name },
        { serial: "emulator-5556", avdName: spec.name },
      ]),
    ).toThrow("Multiple running Emulators expose project AVD");
  });

  test("does not expose delete, wipe, force, or arbitrary path commands", () => {
    const { readFileSync } = jest.requireActual("node:fs") as {
      readFileSync: (path: string, encoding: "utf8") => string;
    };
    const source = readFileSync(
      `${process.cwd()}/tools/android/nix-avd.cjs`,
      "utf8",
    );

    expect(() => tool.main(["delete"])).toThrow(
      "Usage: bun tools/android/nix-avd.cjs <verify|create|reconcile|start|stop>",
    );
    expect(source).toContain('command === "reconcile"');
    expect(source).toContain('command === "stop"');
    expect(source).not.toContain('"--force"');
    expect(source).not.toContain('command === "delete"');
    expect(source).not.toContain('command === "wipe"');
    expect(source).not.toMatch(/(?:rmSync|unlinkSync|rmdirSync)/);
  });
});
