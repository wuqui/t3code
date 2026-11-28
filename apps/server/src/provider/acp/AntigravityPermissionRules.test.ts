// @effect-diagnostics nodeBuiltinImport:off - the reader under test uses node:fs directly.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";

import { antigravityPermissionRulesReader } from "./AntigravityPermissionRules.ts";

describe("antigravityPermissionRulesReader", () => {
  it("reads the profile's rules and rereads them after the file changes", () => {
    const profile = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "agy-rules-"));
    try {
      const read = antigravityPermissionRulesReader(profile);
      expect(read()).toEqual({ allow: [], deny: [] });

      const settings = NodePath.join(profile, "antigravity-acp", "settings.json");
      NodeFS.mkdirSync(NodePath.dirname(settings), { recursive: true });
      NodeFS.writeFileSync(
        settings,
        JSON.stringify({ permissions: { allow: ["mcp(ticktick/search)"], deny: [] } }),
      );
      expect(read().allow).toEqual(["mcp(ticktick/search)"]);

      NodeFS.writeFileSync(
        settings,
        JSON.stringify({ permissions: { allow: [], deny: ["mcp(fastmail/send_email)"] } }),
      );
      NodeFS.utimesSync(settings, 1_800_000_000, 1_800_000_000);
      expect(read()).toEqual({ allow: [], deny: ["mcp(fastmail/send_email)"] });
    } finally {
      NodeFS.rmSync(profile, { recursive: true, force: true });
    }
  });

  it("reads no rules without a profile directory", () => {
    expect(antigravityPermissionRulesReader(undefined)()).toEqual({ allow: [], deny: [] });
  });
});
