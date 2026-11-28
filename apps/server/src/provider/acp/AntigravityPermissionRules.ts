// @effect-diagnostics nodeBuiltinImport:off - agy's permission requests are answered synchronously,
// so the rules file is read directly rather than through the FileSystem service.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import {
  parseAntigravityPermissionRules,
  type AntigravityPermissionRules,
} from "./AntigravityAcpSupport.ts";

const NO_RULES: AntigravityPermissionRules = { allow: [], deny: [] };

/**
 * Reads the rules from `<profileDirectory>/antigravity-acp/settings.json`, again only after the
 * file changes. Permission answers are synchronous, so this reads the small file directly.
 */
export function antigravityPermissionRulesReader(
  profileDirectory: string | undefined,
): () => AntigravityPermissionRules {
  if (profileDirectory === undefined) return () => NO_RULES;
  const settingsPath = NodePath.join(profileDirectory, "antigravity-acp", "settings.json");
  let cached: { readonly modifiedMs: number; readonly rules: AntigravityPermissionRules } | null =
    null;
  return () => {
    try {
      const modifiedMs = NodeFS.statSync(settingsPath).mtimeMs;
      if (cached?.modifiedMs !== modifiedMs) {
        cached = {
          modifiedMs,
          rules: parseAntigravityPermissionRules(NodeFS.readFileSync(settingsPath, "utf8")),
        };
      }
      return cached.rules;
    } catch {
      return NO_RULES;
    }
  };
}
