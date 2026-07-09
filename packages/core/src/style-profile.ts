import type { Configuration } from "markdownlint";

export interface MarkdownStyleProfile {
  headingStyle: "atx" | "setext";
  bulletListMarker: "-" | "*" | "+";
  emDelimiter: "*" | "_";
  strongDelimiter: "**" | "__";
  codeBlockStyle: "fenced" | "indented";
  expandTabs: boolean;
  tabWidth: number;
  trimTrailingWhitespace: boolean;
  ensureFinalNewline: boolean;
  demoteDuplicateH1: boolean;
  ensureBlankLineBeforeHeadings: boolean;
  collapseExcessBlankLines: boolean;
}

/** Built-in CHM-friendly markdownlint defaults. */
export function defaultLintConfig(): Configuration {
  return {
    default: true,
    MD001: false,
    MD013: false,
    MD033: false,
    MD041: false,
  };
}

function isRuleEnabled(config: Configuration, rule: string): boolean {
  const value = config[rule];
  if (value === false) {
    return false;
  }
  if (value === true) {
    return true;
  }
  if (typeof value === "object" && value !== null) {
    return true;
  }
  if (config.default === true) {
    return true;
  }
  return false;
}

function ruleOptionString(config: Configuration, rule: string, key: string, fallback: string): string {
  const value = config[rule];
  if (typeof value === "object" && value !== null && key in value) {
    const option = (value as Record<string, unknown>)[key];
    return typeof option === "string" ? option : fallback;
  }
  return fallback;
}

function ruleOptionNumber(config: Configuration, rule: string, key: string, fallback: number): number {
  const value = config[rule];
  if (typeof value === "object" && value !== null && key in value) {
    const option = (value as Record<string, unknown>)[key];
    return typeof option === "number" ? option : fallback;
  }
  return fallback;
}

/** Derive Turndown/post-process options from a markdownlint configuration. */
export function buildStyleProfile(config: Configuration): MarkdownStyleProfile {
  const md003Style = ruleOptionString(config, "MD003", "style", "atx");
  const md004Style = ruleOptionString(config, "MD004", "style", "dash");

  const bulletMap: Record<string, "-" | "*" | "+"> = {
    dash: "-",
    asterisk: "*",
    plus: "+",
    consistent: "-",
    sublist: "-",
  };

  const md049Style = ruleOptionString(config, "MD049", "style", "consistent");
  const md050Style = ruleOptionString(config, "MD050", "style", "consistent");
  const md046Style = ruleOptionString(config, "MD046", "style", "fenced");

  return {
    headingStyle: md003Style === "setext" ? "setext" : "atx",
    bulletListMarker: bulletMap[md004Style] ?? "-",
    emDelimiter: md049Style === "underscore" ? "_" : "*",
    strongDelimiter: md050Style === "underscore" ? "__" : "**",
    codeBlockStyle: md046Style === "indented" ? "indented" : "fenced",
    expandTabs: isRuleEnabled(config, "MD010"),
    tabWidth: ruleOptionNumber(config, "MD010", "spaces_per_tab", 2),
    trimTrailingWhitespace: isRuleEnabled(config, "MD009"),
    ensureFinalNewline: isRuleEnabled(config, "MD047"),
    demoteDuplicateH1: isRuleEnabled(config, "MD025"),
    ensureBlankLineBeforeHeadings: isRuleEnabled(config, "MD022"),
    collapseExcessBlankLines: isRuleEnabled(config, "MD012"),
  };
}

/** Default style profile when lint is disabled. */
export function defaultStyleProfile(): MarkdownStyleProfile {
  return buildStyleProfile(defaultLintConfig());
}
