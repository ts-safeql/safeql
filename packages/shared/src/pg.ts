export const defaultTypeMapping = {
  // Integer types
  int2: "number",
  int4: "number",
  int8: "string",
  smallint: "number",
  int: "number",
  bigint: "string",

  // Precision types
  real: "number",
  float4: "number",
  float: "number",
  float8: "number",
  numeric: "number",
  decimal: "number",

  // Serial types
  smallserial: "number",
  serial: "number",
  bigserial: "string",

  // Common string types
  uuid: "string",
  text: "string",
  varchar: "string",
  char: "string",
  bpchar: "string",
  citext: "string",

  // Bool types
  bit: "boolean",
  bool: "boolean",
  boolean: "boolean",

  // Dates and times
  date: "Date",
  timestamp: "Date",
  timestamptz: "Date",
  time: "string",
  timetz: "string",
  interval: "string",

  // Network address types
  inet: "string",
  cidr: "string",
  macaddr: "string",
  macaddr8: "string",

  // Extra types
  money: "number",
  void: "void",

  // JSON types
  json: "any",
  jsonb: "any",

  // Bytes
  bytea: "any",
} as const;
