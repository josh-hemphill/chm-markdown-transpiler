export declare const fixturePath: string;
/** Ensure the PowerCollections.chm integration fixture exists on disk. */
export declare function ensurePowerCollectionsFixture(): Promise<string>;
/** True when integration tests should run against the real CHM fixture. */
export declare function hasPowerCollectionsFixture(): boolean;
/** Skip integration tests when fixture is missing outside CI (CI must download or commit it). */
export declare function shouldSkipFixtureTest(): boolean;
//# sourceMappingURL=ensure-fixture.d.ts.map