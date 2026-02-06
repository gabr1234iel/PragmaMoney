/**
 * PragmaMoney OpenClaw Extension
 *
 * This is a no-op extension entry point. PragmaMoney tools are exposed via
 * the `pragma-agent` CLI binary + SKILL.md, not via the plugin tool API.
 * OpenClaw's agent reads SKILL.md and runs CLI commands via bash.
 */

export default function register(_api: unknown): void {
  // Tools are provided via the pragma-agent CLI, not the plugin API.
  // See skills/pragma-money/SKILL.md for usage.
}
