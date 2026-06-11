import * as LibPgQueryAST from "@ts-safeql/sql-ast";
import { PgColRow, PgViewsBySchemaAndName } from "./generate";
import {
  getNonNullableColumns,
  getOutputColumnKey,
  isColumnNonNullable,
} from "./utils/get-nonnullable-columns";
import {
  FlattenedRelationWithJoins,
  flattenRelationsWithJoinsMap,
  getRelationsWithJoins,
  isRelationNullableDueToJoin,
} from "./utils/get-relations-with-joins";

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
  nonNullableViewColumns?: Set<string>;
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
  pgViewsBySchemaAndName: PgViewsBySchemaAndName;
  pgAggregateNames: Set<string>;
  relations: FlattenedRelationWithJoins[];
  visitedViews?: Set<string>;
};

export function getSources({
  select,
  prevSources,
  nonNullableColumns,
  pgColsBySchemaAndTableName,
  pgViewsBySchemaAndName,
  pgAggregateNames,
  relations,
  visitedViews,
}: SourcesOptions) {
  const nonNullableViewColumnsCache = new Map<string, Set<string> | undefined>();

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
        pgViewsBySchemaAndName,
        pgAggregateNames,
        prevSources,
        nonNullableColumns,
        relations,
        visitedViews,
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
        nonNullableViewColumns: getNonNullableViewColumns({ schemaName, viewName: realTableName }),
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

    if (node.RangeSubselect?.subquery?.SelectStmt !== undefined) {
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
          pgViewsBySchemaAndName,
          pgAggregateNames,
          relations,
          visitedViews,
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
              isNotNull: nested.isNotNull && !isRelationNullableDueToJoin(relations, source.name),
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
                const isNullableDueToRelation = isRelationNullableDueToJoin(relations, source.name);

                if (isNullableDueToRelation && column.isNotNull) {
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
                const isNullableDueToRelation = isRelationNullableDueToJoin(relations, source.name);

                if (isNullableDueToRelation) {
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

  function resolveColumn(col: PgColRow, source: TableSelectSource): ResolvedColumn {
    const keyForNullability = source.alias ? source.alias : source.original;
    const isNullableDueToRelation = isRelationNullableDueToJoin(relations, keyForNullability);
    const isNotNullBasedOnAST =
      nonNullableColumns.has(col.colName) ||
      nonNullableColumns.has(`${source.name}.${col.colName}`);
    const isNotNullInTable = col.colNotNull;
    const isNotNullInView = source.nonNullableViewColumns?.has(col.colName) ?? false;
    const isNonNullable =
      isNotNullBasedOnAST || ((isNotNullInTable || isNotNullInView) && !isNullableDueToRelation);

    return { column: col, isNotNull: isNonNullable };
  }

  function computeNonNullableViewColumns(
    viewKey: string,
    schemaName: string,
    viewName: string,
  ): Set<string> | undefined {
    const viewSelect = pgViewsBySchemaAndName.get(schemaName)?.get(viewName);

    if (viewSelect === undefined || visitedViews?.has(viewKey)) {
      return undefined;
    }

    const childVisited = new Set([...(visitedViews ?? []), viewKey]);
    const nonNullable = new Set<string>();

    for (const { name, isNotNull } of analyzeSelectNonNull(viewSelect, childVisited)) {
      if (isNotNull && name !== undefined) {
        nonNullable.add(name);
      }
    }

    return nonNullable;
  }

  function getNonNullableViewColumns(params: {
    schemaName: string;
    viewName: string;
  }): Set<string> | undefined {
    const viewKey = `${params.schemaName}.${params.viewName}`;

    if (nonNullableViewColumnsCache.has(viewKey)) {
      return nonNullableViewColumnsCache.get(viewKey);
    }

    const result = computeNonNullableViewColumns(viewKey, params.schemaName, params.viewName);
    nonNullableViewColumnsCache.set(viewKey, result);
    return result;
  }

  /**
   * Per-column non-null analysis of a view body. A set-operation column is non-null
   * only if every branch proves it (sound for UNION/INTERSECT, conservative for EXCEPT);
   * output names come from the leftmost branch, matching PostgreSQL.
   */
  function analyzeSelectNonNull(
    select: LibPgQueryAST.SelectStmt,
    visited: Set<string>,
  ): { name: string | undefined; isNotNull: boolean }[] {
    const { op, larg, rarg } = select;

    if (
      op !== undefined &&
      op !== LibPgQueryAST.SetOperation.SETOP_NONE &&
      larg !== undefined &&
      rarg !== undefined
    ) {
      const left = analyzeSelectNonNull(larg, visited);
      const right = analyzeSelectNonNull(rarg, visited);

      return left.map((column, index) => ({
        name: column.name,
        isNotNull: column.isNotNull && (right[index]?.isNotNull ?? false),
      }));
    }

    return analyzePlainSelectNonNull(select, visited);
  }

  function analyzePlainSelectNonNull(
    select: LibPgQueryAST.SelectStmt,
    visited: Set<string>,
  ): { name: string | undefined; isNotNull: boolean }[] {
    const parsed: LibPgQueryAST.ParseResult = {
      version: 0,
      stmts: [{ stmt: { SelectStmt: select }, stmtLocation: 0, stmtLen: 0 }],
    };

    const resolver = getSources({
      pgColsBySchemaAndTableName,
      pgViewsBySchemaAndName,
      pgAggregateNames,
      select,
      prevSources: undefined,
      nonNullableColumns: getNonNullableColumns(parsed, { aggregateNames: pgAggregateNames }),
      relations: flattenRelationsWithJoinsMap(getRelationsWithJoins(parsed)),
      visitedViews: visited,
    });

    const resolveColumnRefNonNull = (columnRef: LibPgQueryAST.ColumnRef): boolean => {
      const fields = columnRef.fields ?? [];
      const names = fields.map((f) => f.String?.sval).filter((s): s is string => s !== undefined);

      if (names.length === 0 || names.length !== fields.length) {
        return false;
      }

      const resolved =
        names.length === 1
          ? resolver.getNestedResolvedTargetField({ kind: "unknown", field: names[0] })
          : resolver.getNestedResolvedTargetField({
              kind: "column",
              table: names[names.length - 2],
              column: names[names.length - 1],
            });

      return resolved?.isNotNull ?? false;
    };

    return (select.targetList ?? []).map((target) => {
      const resTarget = target.ResTarget;

      if (resTarget === undefined) {
        return { name: undefined, isNotNull: false };
      }

      const columnRef = resTarget.val?.ColumnRef;

      if (columnRef !== undefined) {
        const names = (columnRef.fields ?? [])
          .map((f) => f.String?.sval)
          .filter((s): s is string => s !== undefined);

        return {
          name: resTarget.name ?? names[names.length - 1],
          isNotNull: resolveColumnRefNonNull(columnRef),
        };
      }

      return {
        name: getOutputColumnKey(resTarget.name, resTarget.val),
        isNotNull: isColumnNonNullable({
          val: resTarget.val,
          root: parsed,
          aggregateNames: pgAggregateNames,
          resolveColumnRefNonNull,
        }),
      };
    });
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
