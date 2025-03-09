import { assertNever, fmap } from "@ts-safeql/shared";
import * as LibPgQueryAST from "@ts-safeql/sql-ast";
import { PgColRow } from "./generate";
import { FlattenedRelationWithJoins } from "./utils/get-relations-with-joins";

export type SourcesResolver = ReturnType<typeof getSources>;

type SourcesOptions = {
  select: LibPgQueryAST.SelectStmt;
  prevSources?: Map<string, SelectSource>;
  nonNullableColumns: Set<string>;
  pgColsBySchemaAndTableName: Map<string, Map<string, PgColRow[]>>;
  relations: FlattenedRelationWithJoins[];
};

export type ResolvedColumn = {
  column: PgColRow;
  isNotNull: boolean;
};

type SelectSource =
  | {
      kind: "table";
      schemaName: string;
      name: string;
      original: string;
      alias?: string;
      columns: ResolvedColumn[];
    }
  | { kind: "cte" | "subselect"; name: string; sources: SourcesResolver };

type TargetField =
  | { kind: "unknown"; field: string }
  | { kind: "column"; table: string; column: string };

export function getSources({
  pgColsBySchemaAndTableName,
  relations,
  prevSources,
  select,
  nonNullableColumns,
}: SourcesOptions) {
  const ctes = getColumnCTEs(select.withClause?.ctes ?? []);
  const sources: Map<string, SelectSource> = new Map([
    ...(prevSources?.entries() ?? []),
    ...getColumnSources(select).entries(),
  ]);

  function getSourceColumns(source: SelectSource) {
    switch (source.kind) {
      case "cte":
      case "subselect":
        return [];
      case "table":
        return source.columns.map((column) => ({ column, source }));
    }
  }

  function getAllResolvedColumns(): { column: ResolvedColumn; source: SelectSource }[] {
    return [...sources.values()].map(getSourceColumns).flat();
  }

  function getResolvedColumnsInTable(sourceName: string): ResolvedColumn[] {
    return fmap(sources.get(sourceName), getSourceColumns)?.map((x) => x.column) ?? [];
  }

  function getColumnByTableAndColumnName(p: {
    table: string;
    column: string;
  }): ResolvedColumn | null {
    const source = sources.get(p.table);

    if (source === undefined) {
      return null;
    }

    const resolved = getSourceColumns(source).find((x) => x.column.column.colName === p.column);

    return resolved?.column ?? null;
  }

  function getColumnsByTargetField(field: TargetField): ResolvedColumn[] | null {
    switch (field.kind) {
      case "column": {
        return fmap(getColumnByTableAndColumnName(field), (x) => [x]);
      }
      case "unknown": {
        const source = sources.get(field.field);

        if (source !== undefined) {
          return getSourceColumns(source).map((x) => x.column);
        }

        for (const { column } of getAllResolvedColumns()) {
          if (column.column.colName === field.field) {
            return [column];
          }
        }

        return null;
      }
    }
  }

  function checkIsNullableDueToRelation(tableName: string): boolean {
    const findByJoin = relations.find((x) => (x.alias ?? x.joinRelName) === tableName);

    if (findByJoin !== undefined) {
      switch (findByJoin.joinType) {
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
          assertNever(findByJoin.joinType);
      }
    }

    const findByRel = relations.filter((x) => x.relName === tableName);

    for (const rel of findByRel) {
      switch (rel.joinType) {
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
          assertNever(rel.joinType);
      }
    }

    return false;
  }

  function resolveColumn(col: PgColRow, tableName: string): ResolvedColumn {
    const isNullableDueToRelation = checkIsNullableDueToRelation(tableName);
    const isNotNullBasedOnAST =
      nonNullableColumns.has(col.colName) || nonNullableColumns.has(`${tableName}.${col.colName}`);
    const isNotNullInTable = col.colNotNull;

    const isNonNullable = isNotNullBasedOnAST || (isNotNullInTable && !isNullableDueToRelation);

    return { column: col, isNotNull: isNonNullable };
  }

  function resolveRangeVarSchema(node: LibPgQueryAST.RangeVar): string {
    if (node.schemaname !== undefined) {
      return node.schemaname;
    }

    if (pgColsBySchemaAndTableName.get("public")?.has(node.relname)) {
      return "public";
    }

    for (const [schemaName, cols] of pgColsBySchemaAndTableName) {
      if (cols.has(node.relname)) {
        return schemaName;
      }
    }

    return "public";
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

  function getNodeColumnAndSources(node: LibPgQueryAST.Node): SelectSource[] {
    if (node.RangeVar !== undefined) {
      const cte = ctes.get(node.RangeVar.relname);

      if (cte !== undefined) {
        return [{ kind: "cte", name: node.RangeVar.relname, sources: cte }];
      }

      const schemaName = resolveRangeVarSchema(node.RangeVar);
      const realTableName = node.RangeVar.relname;
      const tableName = node.RangeVar.alias?.aliasname ?? realTableName;
      const tableColumns = pgColsBySchemaAndTableName.get(schemaName)?.get(realTableName) ?? [];

      return [
        {
          kind: "table",
          schemaName: schemaName,
          original: realTableName,
          name: node.RangeVar.alias?.aliasname ?? node.RangeVar.relname,
          alias: node.RangeVar.alias?.aliasname,
          columns: tableColumns.map((col) => resolveColumn(col, tableName)),
        },
      ];
    }

    const sources: SelectSource[] = [];

    if (node.JoinExpr?.larg !== undefined) {
      sources.push(...getNodeColumnAndSources(node.JoinExpr.larg));
    }

    if (node.JoinExpr?.rarg !== undefined) {
      sources.push(...getNodeColumnAndSources(node.JoinExpr.rarg));
    }

    if (node.RangeSubselect?.subquery?.SelectStmt?.fromClause !== undefined) {
      sources.push({
        kind: "subselect",
        name: node.RangeSubselect.alias?.aliasname ?? "subselect",
        sources: getSources({
          nonNullableColumns,
          pgColsBySchemaAndTableName,
          relations,
          prevSources: new Map([
            ...(prevSources?.entries() ?? []),
            ...sources.map((x) => [x.name, x] as const),
          ]),
          select: node.RangeSubselect.subquery.SelectStmt,
        }),
      });
    }

    return sources;
  }

  function getColumnSources(nodes: LibPgQueryAST.SelectStmt): Map<string, SelectSource> {
    const fromClause = (nodes.fromClause ?? [])
      .map(getNodeColumnAndSources)
      .flat()
      .map((x) => [x.name, x] as const);

    return new Map(fromClause);
  }

  return {
    getNodeColumnAndSources: getNodeColumnAndSources,
    getResolvedColumnsInTable: getResolvedColumnsInTable,
    getAllResolvedColumns: getAllResolvedColumns,
    getColumnsByTargetField: getColumnsByTargetField,
    sources: sources,
  };
}
