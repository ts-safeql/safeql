export const colTypes = [
  "int2",
  "int4",
  "int8",
  "smallint",
  "int",
  "bigint",
  "real",
  "float4",
  "float",
  "float8",
  "numeric",
  "decimal",
  "smallserial",
  "serial",
  "bigserial",
  "uuid",
  "text",
  "varchar",
  "char",
  "bpchar",
  "citext",
  "bit",
  "bool",
  "boolean",
  "date",
  "timestamp",
  "timestamptz",
  "time",
  "timetz",
  "interval",
  "inet",
  "cidr",
  "macaddr",
  "macaddr8",
  "money",
  "void",
  "json",
  "jsonb",
  "bytea",
] as const;

export type ColType = typeof colTypes[number];

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
  time: "Date",
  timetz: "Date",
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
