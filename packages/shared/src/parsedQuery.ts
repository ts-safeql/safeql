/* eslint-disable @typescript-eslint/no-empty-interface */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-namespace */

/**
 * https://transform.tools/json-to-typescript
 */

export declare namespace ParsedQuery {
  export interface Root {
    version: number;
    stmts: Stmt[];
  }

  export interface Stmt {
    stmt: Stmt2;
  }

  export interface Stmt2 {
    SelectStmt?: SelectStmt;
  }

  export interface SelectStmt {
    targetList?: TargetList[];
    fromClause?: FromClause[];
    whereClause?: WhereClause;
    sortClause?: SortClause[];
    limitCount?: LimitCount;
    limitOption?: string;
    op: string;
  }

  export interface TargetList {
    ResTarget: ResTarget;
  }

  export interface ResTarget {
    val: Val;
    location: number;
    name?: string;
  }

  export interface Val {
    ColumnRef?: ColumnRef;
    A_Const?: AConst;
    FuncCall?: FuncCall;
    TypeCast?: TypeCast;
    CoalesceExpr?: CoalesceExpr;
    SubLink?: SubLink;
  }

  export interface ColumnRef {
    fields: Field[];
    location: number;
  }

  export interface Field {
    String?: String;
    A_Star?: AStar;
  }

  export interface String {
    str: string;
  }

  export interface AStar {}

  export interface AConst {
    val: Val2;
    location: number;
  }

  export interface Val2 {
    String?: String;
    Integer?: Integer;
  }

  export interface Integer {
    ival: number;
  }

  export interface FuncCall {
    funcname: Funcname[];
    args?: Arg[];
    location: number;
  }

  export interface Funcname {
    String: String;
  }

  export interface Arg {
    A_Const?: AConst2;
    ColumnRef?: ColumnRef2;
  }

  export interface AConst2 {
    val: Val3;
    location: number;
  }

  export interface Val3 {
    String: String;
  }

  export interface ColumnRef2 {
    fields: Field2[];
    location: number;
  }

  export interface Field2 {
    String: String;
  }

  export interface TypeCast {
    arg: Arg2;
    typeName: TypeName;
    location: number;
  }

  export interface Arg2 {
    A_Const: AConst3;
  }

  export interface AConst3 {
    val: Val4;
    location: number;
  }

  export interface Val4 {
    String: String;
  }

  export interface TypeName {
    names: Name[];
    typemod: number;
    location: number;
  }

  export interface Name {
    String: String;
  }

  export interface CoalesceExpr {
    args: Arg3[];
    location: number;
  }

  export interface Arg3 {
    ColumnRef: ColumnRef3;
  }

  export interface ColumnRef3 {
    fields: Field3[];
    location: number;
  }

  export interface Field3 {
    String: String;
  }

  export interface FromClause {
    JoinExpr?: JoinExpr;
  }

  export interface JoinExpr {
    jointype: "JOIN_INNER" | "JOIN_LEFT" | "JOIN_FULL" | "JOIN_RIGHT" | "JOIN_SEMI" | "JOIN_ANTI";
    larg?: Larg;
    rarg?: Rarg;
    quals?: Quals;
  }

  type LRarg = {
    JoinExpr?: JoinExpr;
    RangeVar?: RangeVar;
  };

  export type Larg = LRarg;
  export type Rarg = LRarg;

  export interface RangeVar {
    relname: string;
    inh: boolean;
    relpersistence: string;
    location: number;
  }

  export interface Quals {
    A_Expr: AExpr;
  }

  export interface AExpr {
    kind: string;
    name: Name[];
    lexpr: Lexpr;
    rexpr: Rexpr;
    location: number;
  }

  export interface Lexpr {
    ColumnRef: ColumnRef8;
  }

  export interface ColumnRef8 {
    fields: Field8[];
    location: number;
  }

  export interface Field8 {
    String: String;
  }

  export interface Rexpr {
    ColumnRef: ColumnRef9;
  }

  export interface ColumnRef9 {
    fields: Field9[];
    location: number;
  }

  export interface Field9 {
    String: String;
  }

  export interface WhereClause {
    BoolExpr: BoolExpr;
  }

  export interface BoolExpr {
    boolop: string;
    args: Arg4[];
    location: number;
  }

  export interface Arg4 {
    BoolExpr: BoolExpr2;
  }

  export interface BoolExpr2 {
    boolop: string;
    args: Arg5[];
    location: number;
  }

  export interface Arg5 {
    A_Expr?: AExpr4;
    NullTest?: NullTest;
    SubLink?: SubLink;
  }

  export interface AExpr4 {
    kind: string;
    name: Name5[];
    lexpr: Lexpr4;
    rexpr: Rexpr4;
    location: number;
  }

  export interface Name5 {
    String: String;
  }

  export interface Lexpr4 {
    ColumnRef: ColumnRef10;
  }

  export interface ColumnRef10 {
    fields: Field10[];
    location: number;
  }

  export interface Field10 {
    String: String;
  }

  export interface Rexpr4 {
    A_Const?: AConst4;
    ParamRef?: ParamRef;
    A_ArrayExpr?: AArrayExpr;
    FuncCall?: FuncCall2;
    List?: List;
  }

  export interface AConst4 {
    val: Val5;
    location: number;
  }

  export interface Val5 {
    String?: String;
    Integer?: Integer;
  }

  export interface ParamRef {
    number: number;
    location: number;
  }

  export interface AArrayExpr {
    elements: Element[];
    location: number;
  }

  export interface Element {
    A_Const: AConst5;
  }

  export interface AConst5 {
    val: Val6;
    location: number;
  }

  export interface Val6 {
    Integer: Integer;
  }

  export interface FuncCall2 {
    funcname: Funcname2[];
    args: Arg6[];
    location: number;
  }

  export interface Funcname2 {
    String: String;
  }

  export interface Arg6 {
    A_Const: AConst6;
  }

  export interface AConst6 {
    val: Val7;
    location: number;
  }

  export interface Val7 {
    String: String;
  }

  export interface List {
    items: Item[];
  }

  export interface Item {
    A_Const: AConst7;
  }

  export interface AConst7 {
    val: Val8;
    location: number;
  }

  export interface Val8 {
    Integer: Integer;
  }

  export interface NullTest {
    arg: Arg7;
    nulltesttype: string;
    location: number;
  }

  export interface Arg7 {
    ColumnRef: ColumnRef11;
  }

  export interface ColumnRef11 {
    fields: Field11[];
    location: number;
  }

  export interface Field11 {
    String: String;
  }

  export interface SubLink {
    subLinkType:
      | "EXISTS_SUBLINK"
      | "ALL_SUBLINK"
      | "ANY_SUBLINK"
      | "ROWCOMPARE_SUBLINK"
      | "EXPR_SUBLINK"
      | "MULTIEXPR_SUBLINK"
      | "ARRAY_SUBLINK"
      | "CTE_SUBLINK";
    testexpr: Testexpr;
    operName: OperName[];
    subselect: Subselect;
    location: number;
  }

  export interface Testexpr {
    ColumnRef: ColumnRef12;
  }

  export interface ColumnRef12 {
    fields: Field12[];
    location: number;
  }

  export interface Field12 {
    String: String;
  }

  export interface OperName {
    String: String;
  }

  export interface Subselect {
    SelectStmt: SelectStmt;
  }

  export interface SortClause {
    SortBy: SortBy;
  }

  export interface SortBy {
    node: Node;
    sortby_dir: string;
    sortby_nulls: string;
    location: number;
  }

  export interface Node {
    ColumnRef: ColumnRef14;
  }

  export interface ColumnRef14 {
    fields: Field14[];
    location: number;
  }

  export interface Field14 {
    String: String;
  }

  export interface LimitCount {
    A_Const: AConst8;
  }

  export interface AConst8 {
    val: Val10;
    location: number;
  }

  export interface Val10 {
    Integer: Integer;
  }
}
