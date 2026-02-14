import mysql from "mysql2/promise";
import type { IDatabaseConnection } from "./database-adapter";

export interface MySQLTypeRow {
  schemaName: string;
  typeName: string;
  typeCode: number;
}

export interface MySQLColRow {
  schemaName: string;
  tableName: string;
  colName: string;
  colType: string; // Data type name (varchar, int, etc.)
  colTypeCode: number; // Type code (obtained from prepared statement)
  colNullable: boolean;
  colDefault: string | null;
  colKey: string; // PRI, UNI, MUL, etc.
  colExtra: string; // auto_increment, etc.
  ordinalPosition: number; // Column order
}

export async function getMysqlCols(connection: IDatabaseConnection): Promise<MySQLColRow[]> {
  const [rows] = await connection.queryRaw<[mysql.RowDataPacket[], mysql.FieldPacket[]]>(`
    SELECT
      TABLE_SCHEMA as schemaName,
      TABLE_NAME as tableName,
      COLUMN_NAME as colName,
      DATA_TYPE as colType,
      0 as colTypeCode,
      IF(IS_NULLABLE = 'YES', true, false) as colNullable,
      COLUMN_DEFAULT as colDefault,
      COLUMN_KEY as colKey,
      EXTRA as colExtra,
      ORDINAL_POSITION as ordinalPosition
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `);

  return rows as MySQLColRow[];
}

interface EnumColumnRow extends mysql.RowDataPacket {
  tableName: string;
  columnName: string;
  columnType: string;
}

export async function getMysqlEnumTypeValues(
  connection: IDatabaseConnection,
): Promise<Map<string, { table: string; column: string; values: string[] }>> {
  const [rows] = await connection.queryRaw<[EnumColumnRow[], mysql.FieldPacket[]]>(`
    SELECT
      TABLE_NAME as tableName,
      COLUMN_NAME as columnName,
      COLUMN_TYPE as columnType
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND DATA_TYPE = 'enum'
  `);

  const map = new Map<string, { table: string; column: string; values: string[] }>();

  for (const row of rows) {
    // Extract ENUM values from COLUMN_TYPE: enum('value1','value2','value3')
    const match = row.columnType.match(/enum\((.*)\)/i);
    if (match) {
      const valuesStr = match[1];
      // Extract values enclosed in quotes
      const values = valuesStr.split(",").map((v: string) => v.trim().replace(/^'|'$/g, ""));

      const key = `${row.tableName}.${row.columnName}`;
      map.set(key, {
        table: row.tableName,
        column: row.columnName,
        values,
      });
    }
  }

  return map;
}

interface TableRow extends mysql.RowDataPacket {
  tableName: string;
}

export async function getMysqlTables(connection: IDatabaseConnection): Promise<string[]> {
  const [rows] = await connection.queryRaw<[TableRow[], mysql.FieldPacket[]]>(`
    SELECT TABLE_NAME as tableName
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `);
  return rows.map((row) => row.tableName);
}

interface ViewRow extends mysql.RowDataPacket {
  viewName: string;
}

export async function getMysqlViews(connection: IDatabaseConnection): Promise<string[]> {
  const [rows] = await connection.queryRaw<[ViewRow[], mysql.FieldPacket[]]>(`
    SELECT TABLE_NAME as viewName
    FROM INFORMATION_SCHEMA.VIEWS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME
  `);
  return rows.map((row) => row.viewName);
}

export async function getMysqlTableColumnsFromPreparedStatement(
  connection: IDatabaseConnection,
  tableName: string,
): Promise<
  Array<{
    name: string;
    typeCode: number;
    length: number;
    nullable: boolean;
  }>
> {
  const metadata = await connection.prepare(`SELECT * FROM \`${tableName}\` LIMIT 0`);

  return metadata.columns.map((col) => ({
    name: col.name,
    typeCode: typeof col.type === "number" ? col.type : 0,
    length: col.length,
    nullable: col.nullable,
  }));
}

// Retrieve column information for all tables and views from Prepared Statements and integrate it with INFORMATION_SCHEMA data.
export async function enrichMysqlColsWithTypeCode(
  connection: IDatabaseConnection,
  cols: MySQLColRow[],
): Promise<MySQLColRow[]> {
  // Group by table
  const tableMap = new Map<string, MySQLColRow[]>();
  for (const col of cols) {
    const key = col.tableName;
    if (!tableMap.has(key)) {
      tableMap.set(key, []);
    }
    tableMap.get(key)!.push(col);
  }

  // Get type codes for each table
  const enrichedCols: MySQLColRow[] = [];

  for (const [tableName, tableCols] of tableMap.entries()) {
    try {
      const preparedCols = await getMysqlTableColumnsFromPreparedStatement(connection, tableName);

      // Match by column name
      const colMap = new Map(preparedCols.map((c) => [c.name, c]));

      for (const col of tableCols) {
        const preparedCol = colMap.get(col.colName);
        if (preparedCol) {
          enrichedCols.push({
            ...col,
            colTypeCode: preparedCol.typeCode,
          });
        } else {
          // If no match, keep as is
          enrichedCols.push(col);
        }
      }
    } catch (error) {
      // If error, keep as is
      console.warn(`Failed to get prepared statement metadata for table ${tableName}:`, error);
      enrichedCols.push(...tableCols);
    }
  }

  return enrichedCols;
}
