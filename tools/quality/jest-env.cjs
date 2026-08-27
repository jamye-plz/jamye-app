"use strict";

const path = require("node:path");

module.exports = function loadJestEnvironment() {
  process.loadEnvFile(path.resolve(__dirname, "../..", ".env"));
};
