import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const execFileAsync = promisify(execFile);

test("@claim:release-integrity-files creates checksums and source-bound metadata for every installer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mailroom-release-"));
  const commit = "819de0b9569e68e9f76ff1455fa40a1a1b4005d1";
  const assets = [
    "Reminder.Mailroom_0.3.0_amd64.AppImage",
    "Reminder.Mailroom_0.3.0_amd64.deb",
    "Reminder.Mailroom-0.3.0-1.x86_64.rpm",
    "Reminder.Mailroom_0.3.0_x64_en-US.msi",
    "Reminder.Mailroom_0.3.0_aarch64.dmg",
    "Reminder.Mailroom_0.3.0_x64.dmg",
  ];
  try {
    await Promise.all(assets.map((name) => writeFile(join(directory, name), `fixture:${name}`)));
    await execFileAsync(process.execPath, ["scripts/release-manifest.mjs", directory, "B-Divyesh/sf-reminder-mailroom", "v0.3.0", commit], { cwd: process.cwd() });

    const sums = await readFile(join(directory, "SHA256SUMS"), "utf8");
    const manifest = JSON.parse(await readFile(join(directory, "latest.json"), "utf8")) as { version: string; sourceCommit: string; platforms: Record<string, { url: string; sha256: string }> };
    expect(manifest.version).toBe("v0.3.0");
    expect(manifest.sourceCommit).toBe(commit);
    expect(Object.keys(manifest.platforms).sort()).toEqual(["linux", "linux_deb", "linux_rpm", "macos_arm64", "macos_x64", "windows"]);
    for (const asset of assets) {
      const expected = createHash("sha256").update(`fixture:${asset}`).digest("hex");
      expect(sums).toContain(`${expected}  ${asset}`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
