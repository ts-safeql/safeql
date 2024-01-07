import { LibPgQueryAST, assertNever, fmap } from "@ts-safeql/shared";
import { PgColRow } from "./generate";
import { FlattenedRelationWithJoins } from "./utils/get-relations-with-joins";

export type SourcesResolver = ReturnType<typeof getSources>;

type SourcesOptions = {
  select: LibPgQueryAST.SelectStmt;
  nonNullableColumns: Set<string>;
  pgColsByTableName: Map<string, PgColRow[]>;
  relations: FlattenedRelationWithJoins[];
};

export type ResolvedColumn = {
  column: PgColRow;
  isNotNull: boolean;
};

type TargetField =
  | { kind: "unknown"; field: string }
  | { kind: "column"; table: string; column: string };

export function getSources({
  pgColsByTableName,
  relations,
  select,
  nonNullableColumns,
}: SourcesOptions) {
  const { columns, sources: sourcesEntries } = getColumnSources(select.fromClause ?? []);
  const sources = new Map(sourcesEntries);

  function getAllResolvedColumns() {
    return columns.map((x) => resolveColumn(x.column));
  }

  function getResolvedColumnsInTable(sourceName: string) {
    return columns.filter((x) => x.source.name === sourceName).map((x) => resolveColumn(x.column));
  }

  function getColumnByTableAndColumnName(p: { table: string; column: string }) {
    const columnSource = columns.find((x) => {
      if (x.column.colName !== p.column) {
        return false;
      }

      switch (x.source.kind) {
        case "table":
          return (x.source.alias ?? x.source.name) === p.table;
        case "subselect":
          return x.source.name === p.table;
      }
    });

    if (columnSource === undefined) {
      return null;
    }

    return resolveColumn(columnSource.column);
  }

  function getColumnsByTargetField(field: TargetField): ResolvedColumn[] | null {
    switch (field.kind) {
      case "column": {
        return fmap(getColumnByTableAndColumnName(field), (x) => [x]);
      }
      case "unknown": {
        const source = sources.get(field.field);

        if (source !== undefined) {
          return columns.filter((x) => x.source === source).map((x) => resolveColumn(x.column));
        }

        for (const { column } of columns) {
          if (column.colName === field.field) {
            return [resolveColumn(column)];
          }
        }

        return null;
      }
    }
  }

  function checkIsNullableDueToRelation(column: PgColRow) {
    const findByJoin = relations.find((x) => x.joinRelName === column.tableName);

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

    const findByRel = relations.filter((x) => x.relName === column.tableName);

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

  function resolveColumn(col: PgColRow): ResolvedColumn {
    const isNullableDueToRelation = checkIsNullableDueToRelation(col);
    const isNotNullBasedOnAST = nonNullableColumns.has(col.colName);
    const isNotNullInTable = col.colNotNull;

    const isNonNullable = isNotNullBasedOnAST || (isNotNullInTable && !isNullableDueToRelation);

    return { column: col, isNotNull: isNonNullable };
  }

  type SelectSource =
    | { kind: "table"; name: string; original: string; alias?: string }
    | { kind: "subselect"; name: string };

  type ColumnWithSource = {
    column: PgColRow;
    source: SelectSource;
  };

  function getColumnSources(nodes: LibPgQueryAST.Node[]): {
    columns: ColumnWithSource[];
    sources: [string, SelectSource][];
  } {
    const columns: ColumnWithSource[] = [];
    const sources: [string, SelectSource][] = [];

    for (const node of nodes) {
      if (node.RangeVar !== undefined) {
        const source: SelectSource = {
          kind: "table",
          original: node.RangeVar.relname,
          name: node.RangeVar.alias?.aliasname ?? node.RangeVar.relname,
          alias: node.RangeVar.alias?.aliasname,
        };

        sources.push([source.name, source]);

        for (const column of pgColsByTableName.get(source.original) ?? []) {
          columns.push({ column, source });
        }
      }

      if (node.JoinExpr?.larg !== undefined) {
        const resolved = getColumnSources([node.JoinExpr.larg]);
        columns.push(...resolved.columns);
        sources.push(...resolved.sources);
      }

      if (node.JoinExpr?.rarg !== undefined) {
        const resolved = getColumnSources([node.JoinExpr.rarg]);
        columns.push(...resolved.columns);
        sources.push(...resolved.sources);
      }

      if (node.RangeSubselect?.subquery?.SelectStmt?.fromClause !== undefined) {
        const source: SelectSource = {
          kind: "subselect",
          name: node.RangeSubselect.alias?.aliasname ?? "subselect",
        };

        sources.push([source.name, source]);

        const resolvedColumns = getColumnSources(
          node.RangeSubselect.subquery.SelectStmt.fromClause
        ).columns.map((x) => x.column);

        for (const column of resolvedColumns) {
          columns.push({ column, source });
        }
      }
    }

    return { columns, sources };
  }

  return {
    getResolvedColumnsInTable: getResolvedColumnsInTable,
    getAllResolvedColumns: getAllResolvedColumns,
    getColumnsByTargetField: getColumnsByTargetField,
    sources: sources,
  };
}
