import { describe, expect, it } from "vitest";
import { createCliLogger, resolveLogLevel } from "./logger.js";

describe("createCliLogger", () => {
  it("suppresses info output in quiet mode", () => {
    const lines: string[] = [];
    const logger = createCliLogger({
      level: "quiet",
      stdout: (message) => lines.push(message),
    });

    logger.info("hidden");
    logger.verbose("hidden");
    logger.debug("hidden");

    expect(lines).toEqual([]);
  });

  it("allows verbose output only at verbose level", () => {
    const lines: string[] = [];
    const normal = createCliLogger({
      level: "normal",
      stdout: (message) => lines.push(message),
    });
    normal.verbose("hidden");
    expect(lines).toEqual([]);

    const verbose = createCliLogger({
      level: "verbose",
      stdout: (message) => lines.push(message),
    });
    verbose.verbose("shown");
    expect(lines).toEqual(["shown"]);
  });

  it("resolves debug as highest detail level", () => {
    expect(resolveLogLevel({ debug: true })).toBe("debug");
    expect(resolveLogLevel({ quiet: true, verbose: true })).toBe("quiet");
  });
});
