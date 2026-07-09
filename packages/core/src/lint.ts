import { extname } from "node:path";
import { applyFixes } from "markdownlint";
import { lint as markdownlint, readConfig } from "markdownlint/sync";
import type { Configuration } from "markdownlint";
import { parse as parseYaml } from "yaml";
import type { ConversionWarning } from "@chm-md/shared";
import { buildStyleProfile, defaultLintConfig } from "./style-profile.js";

export interface LintMarkdownOptions {
  markdown: string;
  sourcePath?: string;
  config?: Configuration;
  fix?: boolean;
}

export interface LintMarkdownResult {
  markdown: string;
  warnings: ConversionWarning[];
  fixed: boolean;
}

const yamlParser = (content: string): Configuration => parseYaml(content) as Configuration;

/** Resolve lint config from an optional user file path. */
export function resolveLintConfig(configPath?: string): Configuration {
  if (!configPath) {
    return defaultLintConfig();
  }
  return loadMarkdownlintConfig(configPath);
}

/** Load a markdownlint config file (JSON or YAML). */
export function loadMarkdownlintConfig(path: string): Configuration {
  const extension = extname(path).toLowerCase();
  if (extension === ".yaml" || extension === ".yml") {
    return readConfig(path, [yamlParser]);
  }
  return readConfig(path);
}

function violationsToWarnings(
  violations: ReturnType<typeof markdownlint>[string] | undefined,
  sourcePath?: string,
): ConversionWarning[] {
  if (!violations) {
    return [];
  }
  return violations.map((violation) => ({
    code: `markdownlint-${violation.ruleNames[0] ?? "unknown"}`,
    message: violation.ruleDescription,
    sourcePath,
    details: {
      lineNumber: violation.lineNumber,
      ruleNames: violation.ruleNames,
    },
  }));
}

/** Run markdownlint and optionally apply autofixes. */
export function lintMarkdown(options: LintMarkdownOptions): LintMarkdownResult {
  const config = options.config ?? defaultLintConfig();
  const results = markdownlint({
    strings: { content: options.markdown },
    config,
  });

  let markdown = options.markdown;
  let fixed = false;
  const contentResults = results.content;

  if (options.fix && contentResults && contentResults.length > 0) {
    const fixedMarkdown = applyFixes(markdown, contentResults);
    if (fixedMarkdown !== markdown) {
      markdown = fixedMarkdown;
      fixed = true;
      const rerun = markdownlint({
        strings: { content: markdown },
        config,
      });
      return {
        markdown,
        warnings: violationsToWarnings(rerun.content, options.sourcePath),
        fixed,
      };
    }
  }

  return {
    markdown,
    warnings: violationsToWarnings(contentResults, options.sourcePath),
    fixed,
  };
}

export { buildStyleProfile, defaultLintConfig, defaultStyleProfile } from "./style-profile.js";
export type { MarkdownStyleProfile } from "./style-profile.js";

/** Load config from path if provided, else default. */
export function loadConfigFromPath(configPath?: string): Configuration {
  return resolveLintConfig(configPath);
}
