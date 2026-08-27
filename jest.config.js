module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/tests"],
  globalSetup: "<rootDir>/tools/quality/jest-env.cjs",
  passWithNoTests: false,
  coverageDirectory: "<rootDir>/coverage",
  collectCoverageFrom: ["app.config.ts", "src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
  coverageThreshold: {
    global: { statements: 80, branches: 80, functions: 80, lines: 80 },
  },
};
