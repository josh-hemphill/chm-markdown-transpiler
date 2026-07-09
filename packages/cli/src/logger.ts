import type { PipelinePhase } from "@chm-md/shared";

export type LogLevel = "quiet" | "normal" | "verbose" | "debug";

export interface CliLogger {
  info(message: string): void;
  verbose(message: string): void;
  debug(message: string): void;
  error(message: string, error?: unknown): void;
  phaseStart(phase: PipelinePhase): void;
  phaseEnd(phase: PipelinePhase, detail?: string): void;
}

export interface CreateCliLoggerOptions {
  level: LogLevel;
  stderr?: (message: string) => void;
  stdout?: (message: string) => void;
}

const PHASE_LABELS: Record<PipelinePhase, string> = {
  extract: "extracting",
  convert: "converting HTML",
  write: "writing project",
  emit: "emitting site",
};

/** Create a CLI logger with level-gated output. */
export function createCliLogger(options: CreateCliLoggerOptions): CliLogger {
  const stderr = options.stderr ?? ((message: string) => console.error(message));
  const stdout = options.stdout ?? ((message: string) => console.log(message));
  const level = options.level;

  const shouldInfo = level === "normal" || level === "verbose" || level === "debug";
  const shouldVerbose = level === "verbose" || level === "debug";
  const shouldDebug = level === "debug";

  return {
    info(message: string) {
      if (shouldInfo) {
        stdout(message);
      }
    },
    verbose(message: string) {
      if (shouldVerbose) {
        stdout(message);
      }
    },
    debug(message: string) {
      if (shouldDebug) {
        stderr(message);
      }
    },
    error(message: string, error?: unknown) {
      stderr(message);
      if (level === "debug" && error instanceof Error && error.stack) {
        stderr(error.stack);
      }
    },
    phaseStart(phase: PipelinePhase) {
      if (shouldInfo) {
        stdout(`${PHASE_LABELS[phase]}…`);
      }
    },
    phaseEnd(phase: PipelinePhase, detail?: string) {
      if (shouldVerbose) {
        stdout(detail ? `  ${PHASE_LABELS[phase]}: ${detail}` : `  ${PHASE_LABELS[phase]} done`);
      }
    },
  };
}

/** Resolve effective log level from CLI flags. */
export function resolveLogLevel(flags: {
  quiet?: boolean;
  verbose?: boolean;
  debug?: boolean;
}): LogLevel {
  if (flags.quiet) {
    return "quiet";
  }
  if (flags.debug) {
    return "debug";
  }
  if (flags.verbose) {
    return "verbose";
  }
  return "normal";
}

/** Format seconds with one decimal place. */
export function formatDurationMs(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}
