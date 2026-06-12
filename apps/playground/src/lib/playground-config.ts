import type { IdentiferCase } from "@ts-safeql/shared";

export interface PlaygroundConfig {
  tag: string;
  fieldTransform: IdentiferCase | undefined;
  nullAsOptional: boolean;
  nullAsUndefined: boolean;
  overrides: { types?: Record<string, string>; columns?: Record<string, string> } | undefined;
  skipTypeAnnotations: boolean;
}

export const DEFAULT_PLAYGROUND_CONFIG: PlaygroundConfig = {
  tag: "sql",
  fieldTransform: undefined,
  nullAsOptional: false,
  nullAsUndefined: false,
  overrides: { types: {} },
  skipTypeAnnotations: false,
};

const FIELD_TRANSFORMS: readonly IdentiferCase[] = ["snake", "camel", "pascal", "screaming snake"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTag(targets: unknown): string {
  if (!Array.isArray(targets)) {
    return DEFAULT_PLAYGROUND_CONFIG.tag;
  }

  for (const target of targets) {
    // Ignore empty tags — they'd match nearly any template literal and break lint targeting.
    if (isRecord(target) && typeof target.tag === "string" && target.tag.trim() !== "") {
      return target.tag;
    }
  }

  return DEFAULT_PLAYGROUND_CONFIG.tag;
}

function readFieldTransform(value: unknown): IdentiferCase | undefined {
  return FIELD_TRANSFORMS.find((transform) => transform === value);
}

function pickStrings(record: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }

  return result;
}

function readOverrides(value: unknown): PlaygroundConfig["overrides"] {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    types: isRecord(value.types) ? pickStrings(value.types) : undefined,
    columns: isRecord(value.columns) ? pickStrings(value.columns) : undefined,
  };
}

export interface ParsedConfig {
  config: PlaygroundConfig;
  error?: string;
}

export function parsePlaygroundConfig(raw: string): ParsedConfig {
  if (!raw.trim()) {
    return { config: DEFAULT_PLAYGROUND_CONFIG };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      config: DEFAULT_PLAYGROUND_CONFIG,
      error: `Invalid config JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!isRecord(parsed)) {
    return { config: DEFAULT_PLAYGROUND_CONFIG, error: "Config must be a JSON object" };
  }

  return {
    config: {
      tag: readTag(parsed.targets),
      fieldTransform: readFieldTransform(parsed.fieldTransform),
      nullAsOptional: parsed.nullAsOptional === true,
      nullAsUndefined: parsed.nullAsUndefined === true,
      overrides: readOverrides(parsed.overrides),
      skipTypeAnnotations: parsed.skipTypeAnnotations === true,
    },
  };
}
