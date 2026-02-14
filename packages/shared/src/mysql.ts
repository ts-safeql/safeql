// MySQL の columnType コードを TypeScript 型にマッピング
// 参照: https://dev.mysql.com/doc/dev/mysql-server/latest/field__types_8h.html

export const mysqlTypeMapping = {
  // Int
  1: "number", // TINYINT
  2: "number", // SMALLINT
  3: "number", // INT
  8: "string", // BIGINT (JavaScript の number の範囲外のため string)
  9: "number", // MEDIUMINT

  // Floating Point
  4: "number", // FLOAT
  5: "number", // DOUBLE
  246: "string", // DECIMAL (精度保持のため string)

  // Char
  249: "string", // TINYTEXT
  250: "string", // MEDIUMTEXT
  251: "string", // LONGTEXT
  252: "string", // BLOB/TEXT
  253: "string", // VARCHAR
  254: "string", // CHAR

  // Date and Time
  7: "Date", // TIMESTAMP
  10: "Date", // DATE
  11: "string", // TIME
  12: "Date", // DATETIME
  13: "number", // YEAR

  // Other
  15: "string", // VARCHAR (alias)
  16: "boolean", // BIT
  245: "any", // JSON
  247: "string", // ENUM
  248: "string", // SET
  255: "string", // GEOMETRY
} as const;

export const mysqlTypesMap = new Map<number, string>(
  Object.entries(mysqlTypeMapping).map(([k, v]) => [parseInt(k), v]),
);

// Mapping from MySQL type codes to PostgreSQL type codes.
export const mysqlTypeCodeToColType = new Map<number, string>([
  [1, "int"], // TINYINT
  [2, "smallint"], // SMALLINT
  [3, "int"], // INT
  [8, "bigint"], // BIGINT
  [9, "int"], // MEDIUMINT
  [4, "float"], // FLOAT
  [5, "float"], // DOUBLE
  [246, "decimal"], // DECIMAL/NEWDECIMAL
  [253, "varchar"], // VARCHAR
  [254, "char"], // CHAR
  [252, "text"], // TEXT (BLOB/TEXT)
  [7, "timestamp"], // TIMESTAMP
  [10, "date"], // DATE
  [11, "time"], // TIME
  [12, "timestamp"], // DATETIME
  [13, "int"], // YEAR
  [245, "json"], // JSON
]);

// Mapping from MySQL type names to TypeScript types
export const mysqlTypeNameMapping = {
  // Int
  tinyint: "number",
  smallint: "number",
  mediumint: "number",
  int: "number",
  integer: "number",
  bigint: "string",

  // Floating Point
  float: "number",
  double: "number",
  decimal: "string",
  numeric: "string",

  // Char
  char: "string",
  varchar: "string",
  tinytext: "string",
  text: "string",
  mediumtext: "string",
  longtext: "string",

  // Binary
  binary: "any",
  varbinary: "any",
  tinyblob: "any",
  blob: "any",
  mediumblob: "any",
  longblob: "any",

  // Date and Time
  date: "Date",
  datetime: "Date",
  timestamp: "Date",
  time: "string",
  year: "number",

  // Other
  bit: "boolean",
  json: "any",
  enum: "string",
  set: "string",
  geometry: "string",
  point: "string",
  linestring: "string",
  polygon: "string",
  multipoint: "string",
  multilinestring: "string",
  multipolygon: "string",
  geometrycollection: "string",
} as const;

export const mysqlTypeNamesMap = new Map<string, string>(Object.entries(mysqlTypeNameMapping));
