export const defaultTypeMapping = {
  int2: "number",
  int4: "number",
  int8: "string",
  smallint: "number",
  int: "number",
  bigint: "string",

  real: "number",
  float4: "number",
  float: "number",
  float8: "number",
  numeric: "string",
  decimal: "number",

  smallserial: "number",
  serial: "number",
  bigserial: "string",

  uuid: "string",
  text: "string",
  varchar: "string",
  char: "string",
  bpchar: "string",
  citext: "string",

  bit: "boolean",
  bool: "boolean",
  boolean: "boolean",

  date: "Date",
  timestamp: "Date",
  timestamptz: "Date",
  time: "string",
  timetz: "string",
  interval: "string",

  inet: "string",
  cidr: "string",
  macaddr: "string",
  macaddr8: "string",

  money: "number",
  void: "void",

  json: "any",
  jsonb: "any",

  bytea: "any",

  null: "null",
} as const;

export const defaultTypesMap = new Map<string, string>(Object.entries(defaultTypeMapping));
