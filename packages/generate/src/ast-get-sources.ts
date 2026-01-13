import { assertNever } from "@ts-safeql/shared";
import * as LibPgQueryAST from "@ts-safeql/sql-ast";
import { PgColRow } from "./generate";
import { FlattenedRelationWithJoins } from "./utils/get-relations-with-joins";

export type SourcesResolver = ReturnType<typeof getSources>;

export type ResolvedColumn = {
  column: PgColRow;
  isNotNull: boolean;
};

type TableSelectSource = {
  kind: "table";
  schemaName: string;
  name: string;
  original: string;
  alias?: string;
  columns: Map<string, ResolvedColumn>;
};

type CteSubselectSource = {
  kind: "cte" | "subselect";
  name: string;
  sources: SourcesResolver;
};

type SelectSource = TableSelectSource | CteSubselectSource;

export type TargetField =
  | { kind: "unknown"; field: string }
  | { kind: "column"; table: string; column: string };

type SourcesOptions = {
  select: LibPgQueryAST.SelectStmt;
  prevSources?: Map<string, SelectSource>;
  nonNullableColumns: Set<string>;
  pgColsBySchemaAndTableName: Map<string, Map<string, PgColRow[]>>;
  relations: FlattenedRelationWithJoins[];
};

export function getSources({
  select,
  prevSources,
  nonNullableColumns,
  pgColsBySchemaAndTableName,
  relations,
}: SourcesOptions) {
  const relationsByAlias = new Map<string, FlattenedRelationWithJoins>();
  const relationsByRelName = new Map<string, FlattenedRelationWithJoins[]>();

  for (const rel of relations) {
    const key = rel.alias ?? rel.joinRelName;

    if (key) {
      relationsByAlias.set(key, rel);
    }

    if (!relationsByRelName.has(rel.relName)) {
      relationsByRelName.set(rel.relName, []);
    }

    relationsByRelName.get(rel.relName)!.push(rel);
  }

  const tableToSchema = new Map<string, string>();

  const publicCols = pgColsBySchemaAndTableName.get("public");

  if (publicCols) {
    for (const tableName of publicCols.keys()) {
      tableToSchema.set(tableName, "public");
    }
  }

  for (const [schemaName, cols] of pgColsBySchemaAndTableName) {
    if (schemaName === "public") break;

    for (const tableName of cols.keys()) {
      if (!tableToSchema.has(tableName)) {
        tableToSchema.set(tableName, schemaName);
      }
    }
  }

  function getColumnCTEs(ctes: LibPgQueryAST.Node[]): Map<string, SourcesResolver> {
    const map = new Map<string, SourcesResolver>();

    for (const cte of ctes) {
      if (cte.CommonTableExpr?.ctequery?.SelectStmt === undefined) continue;
      if (cte.CommonTableExpr?.ctename === undefined) continue;

      const resolver = getSources({
        pgColsBySchemaAndTableName,
        prevSources,
        nonNullableColumns,
        relations,
        select: cte.CommonTableExpr.ctequery.SelectStmt,
      });

      map.set(cte.CommonTableExpr.ctename, resolver);
    }

    return map;
  }

  const ctes = getColumnCTEs(select.withClause?.ctes ?? []);

  const cteSources = new Map(
    Array.from(ctes.entries()).map(([name, resolver]) => [
      name,
      { kind: "cte", name, sources: resolver } as const,
    ]),
  );

  function resolveRangeVarSchema(node: LibPgQueryAST.RangeVar): string {
    switch (true) {
      case node.schemaname !== undefined:
        return node.schemaname;

      case pgColsBySchemaAndTableName.get("public")?.has(node.relname):
        return "public";

      default:
        for (const [schemaName, cols] of pgColsBySchemaAndTableName) {
          if (cols.has(node.relname)) {
            return schemaName;
          }
        }

        return "public";
    }
  }

  function getNodeColumnAndSources(node: LibPgQueryAST.Node): SelectSource[] {
    if (node.RangeVar !== undefined) {
      const cteResolver = ctes.get(node.RangeVar.relname);

      if (cteResolver !== undefined) {
        return [{ kind: "cte", name: node.RangeVar.relname, sources: cteResolver }];
      }

      const inheritedSource = prevSources?.get(node.RangeVar.relname);

      if (inheritedSource?.kind === "cte" || inheritedSource?.kind === "subselect") {
        return [inheritedSource];
      }

      const schemaName = resolveRangeVarSchema(node.RangeVar);
      const realTableName = node.RangeVar.relname;
      const tableName = node.RangeVar.alias?.aliasname ?? realTableName;
      const tableColsArray = pgColsBySchemaAndTableName.get(schemaName)?.get(realTableName) ?? [];

      const tableSource: TableSelectSource = {
        kind: "table",
        schemaName,
        original: realTableName,
        name: tableName,
        alias: node.RangeVar.alias?.aliasname,
        columns: new Map(),
      };

      for (const col of tableColsArray) {
        tableSource.columns.set(col.colName, resolveColumn(col, tableSource));
      }

      return [tableSource];
    }

    const sourcesArr: SelectSource[] = [];

    if (node.JoinExpr?.larg !== undefined) {
      sourcesArr.push(...getNodeColumnAndSources(node.JoinExpr.larg));
    }

    if (node.JoinExpr?.rarg !== undefined) {
      sourcesArr.push(...getNodeColumnAndSources(node.JoinExpr.rarg));
    }

    if (node.RangeSubselect?.subquery?.SelectStmt?.fromClause !== undefined) {
      const combinedPrevSources = new Map([
        ...(prevSources?.entries() ?? []),
        ...sourcesArr.map((x) => [x.name, x] as const),
      ]);

      sourcesArr.push({
        kind: "subselect",
        name: node.RangeSubselect.alias?.aliasname ?? "subselect",
        sources: getSources({
          nonNullableColumns,
          pgColsBySchemaAndTableName,
          relations,
          prevSources: combinedPrevSources,
          select: node.RangeSubselect.subquery.SelectStmt,
        }),
      });
    }

    return sourcesArr;
  }

  function getColumnSources(stmt: LibPgQueryAST.SelectStmt): Map<string, SelectSource> {
    const fromClauseSources: [string, SelectSource][] = [];

    for (const node of stmt.fromClause ?? []) {
      const nodes = getNodeColumnAndSources(node);

      for (const nodeSource of nodes) {
        fromClauseSources.push([nodeSource.name, nodeSource]);
      }
    }

    return new Map(fromClauseSources);
  }

  const sources: Map<string, SelectSource> = new Map([
    ...(prevSources?.entries() ?? []),
    ...getColumnSources(select).entries(),
    ...cteSources.entries(),
  ]);

  const cachedColumnsMap = new WeakMap<
    SelectSource,
    { column: ResolvedColumn; source: SelectSource }[]
  >();

  function getSourceColumns(
    source: SelectSource,
  ): { column: ResolvedColumn; source: SelectSource }[] {
    if (cachedColumnsMap.has(source)) {
      return cachedColumnsMap.get(source)!;
    }

    let result: { column: ResolvedColumn; source: SelectSource }[] = [];

    switch (source.kind) {
      case "table":
        result = Array.from(source.columns.values()).map((col) => ({
          column: col,
          source,
        }));
        break;

      case "cte":
      case "subselect":
        result = [];
        break;
    }

    cachedColumnsMap.set(source, result);
    return result;
  }

  function getAllResolvedColumns(): { column: ResolvedColumn; source: SelectSource }[] {
    const all: { column: ResolvedColumn; source: SelectSource }[] = [];

    for (const source of sources.values()) {
      all.push(...getSourceColumns(source));
    }

    return all;
  }

  const allResolved = getAllResolvedColumns();

  const columnIndex = new Map<string, { column: ResolvedColumn; source: SelectSource }>();
  const unknownColumnIndex = new Map<string, { column: ResolvedColumn; source: SelectSource }[]>();

  for (const entry of allResolved) {
    const key = `${entry.source.name}.${entry.column.column.colName}`;
    columnIndex.set(key, entry);

    const unknownKey = entry.column.column.colName;

    if (!unknownColumnIndex.has(unknownKey)) {
      unknownColumnIndex.set(unknownKey, []);
    }

    unknownColumnIndex.get(unknownKey)!.push(entry);
  }

  function getColumnByTableAndColumnName(p: {
    table: string;
    column: string;
  }): ResolvedColumn | null {
    const source = sources.get(p.table);

    if (!source) return null;

    switch (source.kind) {
      case "table":
        return source.columns.get(p.column) || null;
      default:
        return null;
    }
  }

  function getResolvedColumnsInTable(sourceName: string): ResolvedColumn[] {
    const source = sources.get(sourceName);

    if (!source) return [];

    return getSourceColumns(source).map((x) => x.column);
  }

  function getNestedResolvedTargetField(field: TargetField): ResolvedColumn | null {
    switch (field.kind) {
      case "column": {
        const key = `${field.table}.${field.column}`;

        if (columnIndex.has(key)) {
          return columnIndex.get(key)?.column ?? null;
        }

        break;
      }
      case "unknown": {
        if (unknownColumnIndex.has(field.field)) {
          const candidates = unknownColumnIndex.get(field.field)!;
          if (candidates.length > 0) return candidates[0]?.column ?? null;
        }
        break;
      }
    }

    for (const source of sources.values()) {
      switch (source.kind) {
        case "cte":
        case "subselect": {
          const nested = source.sources.getNestedResolvedTargetField(field);
          if (nested) {
            return {
              ...nested,
              isNotNull: nested.isNotNull && !checkIsNullableDueToRelation(source.name),
            };
          }
          break;
        }
        case "table": {
          const key = field.kind === "column" ? field.column : field.field;
          const column = source.columns.get(key);
          if (column) return column;
          break;
        }
      }
    }

    return null;
  }

  function getColumnsByTargetField(field: TargetField): ResolvedColumn[] | null {
    switch (field.kind) {
      case "column": {
        const result = getColumnByTableAndColumnName(field);

        if (result !== null) {
          return [result];
        }

        for (const source of sources.values()) {
          switch (source.kind) {
            case "subselect": {
              const column = source.sources.getNestedResolvedTargetField(field);
              if (column) {
                // Check if this subselect is part of a LEFT JOIN or FULL JOIN
                const isNullableDueToRelation = checkIsNullableDueToRelation(source.name);
                if (isNullableDueToRelation && column.isNotNull) {
                  // Make the column nullable if it's from a left/full joined subselect
                  return [{ ...column, isNotNull: false }];
                }
                return [column];
              }
              break;
            }
            default:
              break;
          }
        }
        return null;
      }
      case "unknown": {
        const source = sources.get(field.field);

        if (source !== undefined) {
          return getSourceColumns(source).map((x) => x.column);
        }

        const foundColumn = getNestedResolvedTargetField(field);

        if (foundColumn) {
          return [foundColumn];
        }

        for (const source of sources.values()) {
          switch (source.kind) {
            case "subselect": {
              const columns = source.sources.getColumnsByTargetField(field);
              if (columns) {
                // Check if this subselect is part of a LEFT JOIN or FULL JOIN
                const isNullableDueToRelation = checkIsNullableDueToRelation(source.name);
                if (isNullableDueToRelation) {
                  // Make columns nullable if they're from a left/full joined subselect
                  return columns.map((col) => (col.isNotNull ? { ...col, isNotNull: false } : col));
                }
                return columns;
              }
              break;
            }

            default:
              break;
          }
        }

        return null;
      }
    }
  }

  function checkIsNullableDueToRelation(key: string): boolean {
    const rel = relationsByAlias.get(key);
    if (rel !== undefined) {
      switch (rel.joinType) {
        case LibPgQueryAST.JoinType.JOIN_LEFT:
        case LibPgQueryAST.JoinType.JOIN_FULL:
          return true;
        case LibPgQueryAST.JoinType.JOIN_TYPE_UNDEFINED:
        case LibPgQueryAST.JoinType.JOIN_INNER:
        case LibPgQueryAST.JoinType.JOIN_RIGHT:
        case LibPgQueryAST.JoinType.JOIN_SEMI:
        case LibPgQueryAST.JoinType.JOIN_ANTI:
        case LibPgQueryAST.JoinType.JOIN_UNIQUE_OUTER:
        case LibPgQueryAST.JoinType.JOIN_UNIQUE_INNER:
        case LibPgQueryAST.JoinType.UNRECOGNIZED:
          return false;
        default:
          return assertNever(rel.joinType);
      }
    }

    for (const relation of relationsByRelName.get(key) ?? []) {
      switch (relation.joinType) {
        case LibPgQueryAST.JoinType.JOIN_RIGHT:
        case LibPgQueryAST.JoinType.JOIN_FULL:
          return true;
        case LibPgQueryAST.JoinType.JOIN_TYPE_UNDEFINED:
        case LibPgQueryAST.JoinType.JOIN_INNER:
        case LibPgQueryAST.JoinType.JOIN_LEFT:
        case LibPgQueryAST.JoinType.JOIN_SEMI:
        case LibPgQueryAST.JoinType.JOIN_ANTI:
        case LibPgQueryAST.JoinType.JOIN_UNIQUE_OUTER:
        case LibPgQueryAST.JoinType.JOIN_UNIQUE_INNER:
        case LibPgQueryAST.JoinType.UNRECOGNIZED:
          return false;
        default:
          return assertNever(relation.joinType);
      }
    }

    return false;
  }

  function resolveColumn(col: PgColRow, source: TableSelectSource): ResolvedColumn {
    const keyForNullability = source.alias ? source.alias : source.original;
    const isNullableDueToRelation = checkIsNullableDueToRelation(keyForNullability);
    const isNotNullBasedOnAST =
      nonNullableColumns.has(col.colName) ||
      nonNullableColumns.has(`${source.name}.${col.colName}`);
    const isNotNullInTable = col.colNotNull;
    const isNonNullable = isNotNullBasedOnAST || (isNotNullInTable && !isNullableDueToRelation);

    return { column: col, isNotNull: isNonNullable };
  }

  return {
    getNodeColumnAndSources,
    getResolvedColumnsInTable,
    getAllResolvedColumns,
    getColumnsByTargetField,
    getNestedResolvedTargetField,
    sources,
  };
}
