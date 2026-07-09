import { createWriteStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
const rootDir = fileURLToPath(new URL(".", import.meta.url));
export const fixturePath = join(rootDir, "PowerCollections.chm");
const fixtureUrl = "https://raw.githubusercontent.com/dmihal/chmlib-ts/master/fixtures/PowerCollections.chm";
/** Ensure the PowerCollections.chm integration fixture exists on disk. */
export async function ensurePowerCollectionsFixture() {
    if (existsSync(fixturePath)) {
        return fixturePath;
    }
    await mkdir(dirname(fixturePath), { recursive: true });
    const response = await fetch(fixtureUrl);
    if (!response.ok || !response.body) {
        const message = `Failed to download fixture CHM: ${response.status}`;
        if (process.env.CI === "true") {
            throw new Error(message);
        }
        throw new Error(message);
    }
    await pipeline(response.body, createWriteStream(fixturePath));
    return fixturePath;
}
/** True when integration tests should run against the real CHM fixture. */
export function hasPowerCollectionsFixture() {
    return existsSync(fixturePath);
}
/** Skip integration tests when fixture is missing outside CI (CI must download or commit it). */
export function shouldSkipFixtureTest() {
    return !hasPowerCollectionsFixture() && process.env.CI !== "true";
}
//# sourceMappingURL=ensure-fixture.js.map