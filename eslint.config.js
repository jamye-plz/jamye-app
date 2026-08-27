const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

const TRANSPORT_ENFORCED_FILES = [
  "app.config.ts",
  "src/**/*.ts",
  "src/**/*.tsx",
];
const ROUTE_FILES = ["src/app/**/*.ts", "src/app/**/*.tsx"];
const SCREEN_AND_COMPONENT_FILES = [
  "src/features/**/ui/**/*.ts",
  "src/features/**/ui/**/*.tsx",
  "src/shared/ui/**/*.ts",
  "src/shared/ui/**/*.tsx",
];
const NODE_COMMONJS_TOOL_FILES = ["tools/**/*.cjs"];

const FORBIDDEN_TRANSPORT_GLOBALS = [
  {
    name: "fetch",
    message:
      "Direct fetch(...) is forbidden by quality_contract.transport_enforcement.",
  },
  {
    name: "XMLHttpRequest",
    message:
      "XMLHttpRequest is forbidden by quality_contract.transport_enforcement.",
  },
  {
    name: "WebSocket",
    message:
      "WebSocket is forbidden by quality_contract.transport_enforcement.",
  },
  {
    name: "EventSource",
    message:
      "EventSource is forbidden by quality_contract.transport_enforcement.",
  },
  {
    name: "NetInfo",
    message: "NetInfo is forbidden by quality_contract.transport_enforcement.",
  },
];

const FORBIDDEN_TRANSPORT_PROPERTIES = [
  {
    object: "global",
    property: "fetch",
    message:
      "global.fetch is forbidden by quality_contract.transport_enforcement.",
  },
  {
    object: "globalThis",
    property: "fetch",
    message:
      "globalThis.fetch is forbidden by quality_contract.transport_enforcement.",
  },
  {
    object: "window",
    property: "fetch",
    message:
      "window.fetch is forbidden by quality_contract.transport_enforcement.",
  },
];

const FORBIDDEN_TRANSPORT_MODULES = [
  "http",
  "node:http",
  "https",
  "node:https",
  "net",
  "node:net",
  "tls",
  "node:tls",
  "dgram",
  "node:dgram",
  "undici",
  "expo-network",
  "@react-native-community/netinfo",
];

const FORBIDDEN_HTTP_CLIENT_MODULES = [
  "axios",
  "ky",
  "cross-fetch",
  "node-fetch",
  "isomorphic-fetch",
  "whatwg-fetch",
];

const FORBIDDEN_PERSISTENCE_MODULES = [
  "expo-sqlite",
  "react-native-sqlite-storage",
  "realm",
  "@nozbe/watermelondb",
  "@react-native-async-storage/async-storage",
  "expo-secure-store",
  "expo-auth-session",
  "expo-notifications",
];

const RESERVED_CORE_HTTP_NETWORK_PATTERNS = [
  "**/core/http",
  "**/core/http/**",
  "**/core/network",
  "**/core/network/**",
];

const RESERVED_CORE_ROUTE_IMPLEMENTATION_PATTERNS = [
  "**/core/database",
  "**/core/database/**",
  "**/core/realtime",
  "**/core/realtime/**",
  "**/core/auth",
  "**/core/auth/**",
  "**/core/storage",
  "**/core/storage/**",
  "**/core/logging",
  "**/core/logging/**",
];

function toRestrictedImportPaths(names, message) {
  return names.map((name) => ({ name, message }));
}

function toRestrictedImportPatterns(patterns, message) {
  return patterns.map((group) =>
    typeof group === "string" ? { group: [group], message } : group,
  );
}

function globPatternToRegExp(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern.startsWith("**/", index)) {
      source += "(?:.*/)?";
      index += 2;
    } else if (pattern.startsWith("**", index)) {
      source += ".*";
      index += 1;
    } else if (pattern[index] === "*") {
      source += "[^/]*";
    } else {
      source += pattern[index].replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

function toPatternMatchers(patterns) {
  return patterns.map((pattern) => globPatternToRegExp(pattern));
}

const noCoverageIgnoreDirectivesRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Istanbul/c8/v8 coverage-ignore directive comments across the measured application coverage denominator.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        const sourceCode =
          typeof context.sourceCode !== "undefined"
            ? context.sourceCode
            : context.getSourceCode();
        for (const comment of sourceCode.getAllComments()) {
          if (/(istanbul|c8|v8)\s+ignore/i.test(comment.value)) {
            context.report({
              loc: comment.loc,
              message:
                "Coverage-ignore directives (istanbul/c8/v8 ignore) are forbidden in the measured coverage scope.",
            });
          }
        }
      },
    };
  },
};

const noRestrictedTransportRequireRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow require(...) and dynamic import(...) of forbidden transport/persistence modules and reserved core implementation patterns (static import coverage lives in no-restricted-imports).",
    },
    schema: [
      {
        type: "object",
        properties: {
          modules: { type: "array", items: { type: "string" } },
          patterns: { type: "array", items: { type: "string" } },
          message: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = context.options[0] || {};
    const modules = Array.isArray(options.modules) ? options.modules : [];
    const patternMatchers = toPatternMatchers(
      Array.isArray(options.patterns) ? options.patterns : [],
    );
    const message =
      options.message ||
      "This module is forbidden by quality_contract.transport_enforcement.";

    function isForbiddenLiteral(node) {
      if (!node || node.type !== "Literal" || typeof node.value !== "string")
        return false;
      if (modules.includes(node.value)) return true;
      return patternMatchers.some((matcher) => matcher.test(node.value));
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments.length > 0 &&
          isForbiddenLiteral(node.arguments[0])
        ) {
          context.report({ node, message });
        }
      },
      ImportExpression(node) {
        if (isForbiddenLiteral(node.source)) {
          context.report({ node, message });
        }
      },
    };
  },
};

const localRestrictionsPlugin = {
  rules: {
    "no-coverage-ignore-directives": noCoverageIgnoreDirectivesRule,
    "no-restricted-transport-require": noRestrictedTransportRequireRule,
  },
};

module.exports = defineConfig([
  ...expoConfig,
  {
    files: NODE_COMMONJS_TOOL_FILES,
    languageOptions: {
      globals: { __dirname: "readonly" },
    },
  },
  {
    files: TRANSPORT_ENFORCED_FILES,
    linterOptions: { noInlineConfig: true },
    plugins: { local: localRestrictionsPlugin },
    rules: {
      "no-restricted-globals": ["error", ...FORBIDDEN_TRANSPORT_GLOBALS],
      "no-restricted-properties": ["error", ...FORBIDDEN_TRANSPORT_PROPERTIES],
      "no-restricted-imports": [
        "error",
        {
          paths: toRestrictedImportPaths(
            FORBIDDEN_TRANSPORT_MODULES,
            "Direct network transport modules are forbidden by quality_contract.transport_enforcement.",
          ),
        },
      ],
      "local/no-restricted-transport-require": [
        "error",
        {
          modules: FORBIDDEN_TRANSPORT_MODULES,
          message:
            "require(...)/import(...) of network transport modules is forbidden by quality_contract.transport_enforcement.",
        },
      ],
      "local/no-coverage-ignore-directives": "error",
    },
  },
  {
    files: SCREEN_AND_COMPONENT_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: toRestrictedImportPaths(
            [...FORBIDDEN_TRANSPORT_MODULES, ...FORBIDDEN_HTTP_CLIENT_MODULES],
            "Screens/components must not import HTTP clients or transport wrappers directly.",
          ),
          patterns: toRestrictedImportPatterns(
            RESERVED_CORE_HTTP_NETWORK_PATTERNS,
            "Screens/components must not import a core HTTP/network module directly.",
          ),
        },
      ],
      "local/no-restricted-transport-require": [
        "error",
        {
          modules: [
            ...FORBIDDEN_TRANSPORT_MODULES,
            ...FORBIDDEN_HTTP_CLIENT_MODULES,
          ],
          patterns: RESERVED_CORE_HTTP_NETWORK_PATTERNS,
          message:
            "Screens/components must not require/dynamically import HTTP clients, transport wrappers, or a core HTTP/network module.",
        },
      ],
    },
  },
  {
    files: ROUTE_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: toRestrictedImportPaths(
            [...FORBIDDEN_TRANSPORT_MODULES, ...FORBIDDEN_PERSISTENCE_MODULES],
            "Routes must not import DB/realtime/auth/storage/persistence clients directly.",
          ),
          patterns: toRestrictedImportPatterns(
            RESERVED_CORE_ROUTE_IMPLEMENTATION_PATTERNS,
            "Routes must not import DB/realtime/auth/storage/logger implementation modules directly.",
          ),
        },
      ],
      "local/no-restricted-transport-require": [
        "error",
        {
          modules: [
            ...FORBIDDEN_TRANSPORT_MODULES,
            ...FORBIDDEN_PERSISTENCE_MODULES,
          ],
          patterns: RESERVED_CORE_ROUTE_IMPLEMENTATION_PATTERNS,
          message:
            "Routes must not require/dynamically import DB/realtime/auth/storage/logger/persistence clients or implementation modules.",
        },
      ],
    },
  },
]);
