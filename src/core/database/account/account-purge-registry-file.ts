import { File, Paths } from "expo-file-system";

import type { AccountPurgeRegistryFile } from "./account-purge-registry";

export const ACCOUNT_PURGE_REGISTRY_FILENAME =
  "account-local-data-purge-v1.json";
const STAGING_SUFFIX = ".tmp";

/**
 * The registry lives in the documents directory: it shares its lifetime with
 * the account databases (both vanish with the app) and holds nothing secret.
 * SecureStore is deliberately not used -- iOS keeps it across reinstalls,
 * which would leave entries without a database.
 */
export function createAccountPurgeRegistryFile(): AccountPurgeRegistryFile {
  return {
    async read() {
      const file = new File(Paths.document, ACCOUNT_PURGE_REGISTRY_FILENAME);
      if (!file.exists) return null;
      return file.text();
    },
    async write(contents) {
      const target = new File(Paths.document, ACCOUNT_PURGE_REGISTRY_FILENAME);
      const staging = new File(
        Paths.document,
        `${ACCOUNT_PURGE_REGISTRY_FILENAME}${STAGING_SUFFIX}`,
      );
      // Stage next to the target, then replace it in one move so a crash
      // leaves either the old or the new registry, never a torn one.
      staging.create({ overwrite: true });
      staging.write(contents);
      await staging.move(target, { overwrite: true });
    },
  };
}
