import { ensurePowerCollectionsFixture } from "./ensure-fixture.js";

export default async function globalSetup(): Promise<void> {
  await ensurePowerCollectionsFixture();
}
