import type { ParserServices, ParserServicesWithTypeInformation } from "@typescript-eslint/utils";

export function hasParserServicesWithTypeInformation(
  parser: Partial<ParserServices> | undefined,
): parser is ParserServicesWithTypeInformation {
  return parser !== undefined && parser.program !== null && parser.program !== undefined;
}
