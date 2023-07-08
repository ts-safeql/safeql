/* eslint-disable @typescript-eslint/no-empty-interface  */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-namespace */

// https://raw.githubusercontent.com/pganalyze/libpg_query/f1b475ddcbea7951a7ef825f137abdc54e5a34e4/protobuf/pg_query.proto

export namespace LibPgQueryAST {
  export interface ParseResult {
    version: number;
    stmts: RawStmt[];
  }

  export interface ScanResult {
    version: number;
    tokens: ScanToken[];
  }

  export interface Node {
    Alias?: Alias | undefined;
    RangeVar?: RangeVar | undefined;
    TableFunc?: TableFunc | undefined;
    Var?: Var | undefined;
    Param?: Param | undefined;
    Aggref?: Aggref | undefined;
    GroupingFunc?: GroupingFunc | undefined;
    WindowFunc?: WindowFunc | undefined;
    SubscriptingRef?: SubscriptingRef | undefined;
    FuncExpr?: FuncExpr | undefined;
    NamedArgExpr?: NamedArgExpr | undefined;
    OpExpr?: OpExpr | undefined;
    DistinctExpr?: DistinctExpr | undefined;
    NullIfExpr?: NullIfExpr | undefined;
    ScalarArrayOpExpr?: ScalarArrayOpExpr | undefined;
    BoolExpr?: BoolExpr | undefined;
    SubLink?: SubLink | undefined;
    SubPlan?: SubPlan | undefined;
    AlternativeSubPlan?: AlternativeSubPlan | undefined;
    FieldSelect?: FieldSelect | undefined;
    FieldStore?: FieldStore | undefined;
    RelabelType?: RelabelType | undefined;
    CoerceViaIo?: CoerceViaIO | undefined;
    ArrayCoerceExpr?: ArrayCoerceExpr | undefined;
    ConvertRowtypeExpr?: ConvertRowtypeExpr | undefined;
    CollateExpr?: CollateExpr | undefined;
    CaseExpr?: CaseExpr | undefined;
    CaseWhen?: CaseWhen | undefined;
    CaseTestExpr?: CaseTestExpr | undefined;
    ArrayExpr?: ArrayExpr | undefined;
    RowExpr?: RowExpr | undefined;
    RowCompareExpr?: RowCompareExpr | undefined;
    CoalesceExpr?: CoalesceExpr | undefined;
    MinMaxExpr?: MinMaxExpr | undefined;
    SqlvalueFunction?: SQLValueFunction | undefined;
    XmlExpr?: XmlExpr | undefined;
    NullTest?: NullTest | undefined;
    BooleanTest?: BooleanTest | undefined;
    CoerceToDomain?: CoerceToDomain | undefined;
    CoerceToDomainValue?: CoerceToDomainValue | undefined;
    SetToDefault?: SetToDefault | undefined;
    CurrentOfExpr?: CurrentOfExpr | undefined;
    NextValueExpr?: NextValueExpr | undefined;
    InferenceElem?: InferenceElem | undefined;
    TargetEntry?: TargetEntry | undefined;
    RangeTblRef?: RangeTblRef | undefined;
    JoinExpr?: JoinExpr | undefined;
    FromExpr?: FromExpr | undefined;
    OnConflictExpr?: OnConflictExpr | undefined;
    IntoClause?: IntoClause | undefined;
    MergeAction?: MergeAction | undefined;
    RawStmt?: RawStmt | undefined;
    Query?: Query | undefined;
    InsertStmt?: InsertStmt | undefined;
    DeleteStmt?: DeleteStmt | undefined;
    UpdateStmt?: UpdateStmt | undefined;
    MergeStmt?: MergeStmt | undefined;
    SelectStmt?: SelectStmt | undefined;
    ReturnStmt?: ReturnStmt | undefined;
    PlassignStmt?: PLAssignStmt | undefined;
    AlterTableStmt?: AlterTableStmt | undefined;
    AlterTableCmd?: AlterTableCmd | undefined;
    AlterDomainStmt?: AlterDomainStmt | undefined;
    SetOperationStmt?: SetOperationStmt | undefined;
    GrantStmt?: GrantStmt | undefined;
    GrantRoleStmt?: GrantRoleStmt | undefined;
    AlterDefaultPrivilegesStmt?: AlterDefaultPrivilegesStmt | undefined;
    ClosePortalStmt?: ClosePortalStmt | undefined;
    ClusterStmt?: ClusterStmt | undefined;
    CopyStmt?: CopyStmt | undefined;
    CreateStmt?: CreateStmt | undefined;
    DefineStmt?: DefineStmt | undefined;
    DropStmt?: DropStmt | undefined;
    TruncateStmt?: TruncateStmt | undefined;
    CommentStmt?: CommentStmt | undefined;
    FetchStmt?: FetchStmt | undefined;
    IndexStmt?: IndexStmt | undefined;
    CreateFunctionStmt?: CreateFunctionStmt | undefined;
    AlterFunctionStmt?: AlterFunctionStmt | undefined;
    DoStmt?: DoStmt | undefined;
    RenameStmt?: RenameStmt | undefined;
    RuleStmt?: RuleStmt | undefined;
    NotifyStmt?: NotifyStmt | undefined;
    ListenStmt?: ListenStmt | undefined;
    UnlistenStmt?: UnlistenStmt | undefined;
    TransactionStmt?: TransactionStmt | undefined;
    ViewStmt?: ViewStmt | undefined;
    LoadStmt?: LoadStmt | undefined;
    CreateDomainStmt?: CreateDomainStmt | undefined;
    CreatedbStmt?: CreatedbStmt | undefined;
    DropdbStmt?: DropdbStmt | undefined;
    VacuumStmt?: VacuumStmt | undefined;
    ExplainStmt?: ExplainStmt | undefined;
    CreateTableAsStmt?: CreateTableAsStmt | undefined;
    CreateSeqStmt?: CreateSeqStmt | undefined;
    AlterSeqStmt?: AlterSeqStmt | undefined;
    VariableSetStmt?: VariableSetStmt | undefined;
    VariableShowStmt?: VariableShowStmt | undefined;
    DiscardStmt?: DiscardStmt | undefined;
    CreateTrigStmt?: CreateTrigStmt | undefined;
    CreatePlangStmt?: CreatePLangStmt | undefined;
    CreateRoleStmt?: CreateRoleStmt | undefined;
    AlterRoleStmt?: AlterRoleStmt | undefined;
    DropRoleStmt?: DropRoleStmt | undefined;
    LockStmt?: LockStmt | undefined;
    ConstraintsSetStmt?: ConstraintsSetStmt | undefined;
    ReindexStmt?: ReindexStmt | undefined;
    CheckPointStmt?: CheckPointStmt | undefined;
    CreateSchemaStmt?: CreateSchemaStmt | undefined;
    AlterDatabaseStmt?: AlterDatabaseStmt | undefined;
    AlterDatabaseRefreshCollStmt?: AlterDatabaseRefreshCollStmt | undefined;
    AlterDatabaseSetStmt?: AlterDatabaseSetStmt | undefined;
    AlterRoleSetStmt?: AlterRoleSetStmt | undefined;
    CreateConversionStmt?: CreateConversionStmt | undefined;
    CreateCastStmt?: CreateCastStmt | undefined;
    CreateOpClassStmt?: CreateOpClassStmt | undefined;
    CreateOpFamilyStmt?: CreateOpFamilyStmt | undefined;
    AlterOpFamilyStmt?: AlterOpFamilyStmt | undefined;
    PrepareStmt?: PrepareStmt | undefined;
    ExecuteStmt?: ExecuteStmt | undefined;
    DeallocateStmt?: DeallocateStmt | undefined;
    DeclareCursorStmt?: DeclareCursorStmt | undefined;
    CreateTableSpaceStmt?: CreateTableSpaceStmt | undefined;
    DropTableSpaceStmt?: DropTableSpaceStmt | undefined;
    AlterObjectDependsStmt?: AlterObjectDependsStmt | undefined;
    AlterObjectSchemaStmt?: AlterObjectSchemaStmt | undefined;
    AlterOwnerStmt?: AlterOwnerStmt | undefined;
    AlterOperatorStmt?: AlterOperatorStmt | undefined;
    AlterTypeStmt?: AlterTypeStmt | undefined;
    DropOwnedStmt?: DropOwnedStmt | undefined;
    ReassignOwnedStmt?: ReassignOwnedStmt | undefined;
    CompositeTypeStmt?: CompositeTypeStmt | undefined;
    CreateEnumStmt?: CreateEnumStmt | undefined;
    CreateRangeStmt?: CreateRangeStmt | undefined;
    AlterEnumStmt?: AlterEnumStmt | undefined;
    AlterTsdictionaryStmt?: AlterTSDictionaryStmt | undefined;
    AlterTsconfigurationStmt?: AlterTSConfigurationStmt | undefined;
    CreateFdwStmt?: CreateFdwStmt | undefined;
    AlterFdwStmt?: AlterFdwStmt | undefined;
    CreateForeignServerStmt?: CreateForeignServerStmt | undefined;
    AlterForeignServerStmt?: AlterForeignServerStmt | undefined;
    CreateUserMappingStmt?: CreateUserMappingStmt | undefined;
    AlterUserMappingStmt?: AlterUserMappingStmt | undefined;
    DropUserMappingStmt?: DropUserMappingStmt | undefined;
    AlterTableSpaceOptionsStmt?: AlterTableSpaceOptionsStmt | undefined;
    AlterTableMoveAllStmt?: AlterTableMoveAllStmt | undefined;
    SecLabelStmt?: SecLabelStmt | undefined;
    CreateForeignTableStmt?: CreateForeignTableStmt | undefined;
    ImportForeignSchemaStmt?: ImportForeignSchemaStmt | undefined;
    CreateExtensionStmt?: CreateExtensionStmt | undefined;
    AlterExtensionStmt?: AlterExtensionStmt | undefined;
    AlterExtensionContentsStmt?: AlterExtensionContentsStmt | undefined;
    CreateEventTrigStmt?: CreateEventTrigStmt | undefined;
    AlterEventTrigStmt?: AlterEventTrigStmt | undefined;
    RefreshMatViewStmt?: RefreshMatViewStmt | undefined;
    ReplicaIdentityStmt?: ReplicaIdentityStmt | undefined;
    AlterSystemStmt?: AlterSystemStmt | undefined;
    CreatePolicyStmt?: CreatePolicyStmt | undefined;
    AlterPolicyStmt?: AlterPolicyStmt | undefined;
    CreateTransformStmt?: CreateTransformStmt | undefined;
    CreateAmStmt?: CreateAmStmt | undefined;
    CreatePublicationStmt?: CreatePublicationStmt | undefined;
    AlterPublicationStmt?: AlterPublicationStmt | undefined;
    CreateSubscriptionStmt?: CreateSubscriptionStmt | undefined;
    AlterSubscriptionStmt?: AlterSubscriptionStmt | undefined;
    DropSubscriptionStmt?: DropSubscriptionStmt | undefined;
    CreateStatsStmt?: CreateStatsStmt | undefined;
    AlterCollationStmt?: AlterCollationStmt | undefined;
    CallStmt?: CallStmt | undefined;
    AlterStatsStmt?: AlterStatsStmt | undefined;
    A_Expr?: AExpr | undefined;
    ColumnRef?: ColumnRef | undefined;
    ParamRef?: ParamRef | undefined;
    FuncCall?: FuncCall | undefined;
    A_Star?: AStar | undefined;
    AIndices?: AIndices | undefined;
    AIndirection?: AIndirection | undefined;
    A_ArrayExpr?: AArrayExpr | undefined;
    ResTarget?: ResTarget | undefined;
    MultiAssignRef?: MultiAssignRef | undefined;
    TypeCast?: TypeCast | undefined;
    CollateClause?: CollateClause | undefined;
    SortBy?: SortBy | undefined;
    WindowDef?: WindowDef | undefined;
    RangeSubselect?: RangeSubselect | undefined;
    RangeFunction?: RangeFunction | undefined;
    RangeTableSample?: RangeTableSample | undefined;
    RangeTableFunc?: RangeTableFunc | undefined;
    RangeTableFuncCol?: RangeTableFuncCol | undefined;
    TypeName?: TypeName | undefined;
    ColumnDef?: ColumnDef | undefined;
    IndexElem?: IndexElem | undefined;
    StatsElem?: StatsElem | undefined;
    Constraint?: Constraint | undefined;
    DefElem?: DefElem | undefined;
    RangeTblEntry?: RangeTblEntry | undefined;
    RangeTblFunction?: RangeTblFunction | undefined;
    TableSampleClause?: TableSampleClause | undefined;
    WithCheckOption?: WithCheckOption | undefined;
    SortGroupClause?: SortGroupClause | undefined;
    GroupingSet?: GroupingSet | undefined;
    WindowClause?: WindowClause | undefined;
    ObjectWithArgs?: ObjectWithArgs | undefined;
    AccessPriv?: AccessPriv | undefined;
    CreateOpClassItem?: CreateOpClassItem | undefined;
    TableLikeClause?: TableLikeClause | undefined;
    FunctionParameter?: FunctionParameter | undefined;
    LockingClause?: LockingClause | undefined;
    RowMarkClause?: RowMarkClause | undefined;
    XmlSerialize?: XmlSerialize | undefined;
    WithClause?: WithClause | undefined;
    InferClause?: InferClause | undefined;
    OnConflictClause?: OnConflictClause | undefined;
    CtesearchClause?: CTESearchClause | undefined;
    CtecycleClause?: CTECycleClause | undefined;
    CommonTableExpr?: CommonTableExpr | undefined;
    MergeWhenClause?: MergeWhenClause | undefined;
    RoleSpec?: RoleSpec | undefined;
    TriggerTransition?: TriggerTransition | undefined;
    PartitionElem?: PartitionElem | undefined;
    PartitionSpec?: PartitionSpec | undefined;
    PartitionBoundSpec?: PartitionBoundSpec | undefined;
    PartitionRangeDatum?: PartitionRangeDatum | undefined;
    PartitionCmd?: PartitionCmd | undefined;
    VacuumRelation?: VacuumRelation | undefined;
    PublicationObjSpec?: PublicationObjSpec | undefined;
    PublicationTable?: PublicationTable | undefined;
    InlineCodeBlock?: InlineCodeBlock | undefined;
    CallContext?: CallContext | undefined;
    Integer?: Integer | undefined;
    Float?: Float | undefined;
    Boolean?: Boolean | undefined;
    String?: String | undefined;
    BitString?: BitString | undefined;
    List?: List | undefined;
    IntList?: IntList | undefined;
    OidList?: OidList | undefined;
    A_Const?: AConst | undefined;
  }

  export interface Integer {
    /** machine integer */
    ival: number;
  }

  export interface Float {
    /** string */
    fval: string;
  }

  export interface Boolean {
    boolval: boolean;
  }

  export interface String {
    /** string */
    sval: string;
  }

  export interface BitString {
    /** string */
    bsval: string;
  }

  export interface List {
    items: Node[];
  }

  export interface OidList {
    items: Node[];
  }

  export interface IntList {
    items: Node[];
  }

  export interface AConst {
    ival?: Integer | undefined;
    fval?: Float | undefined;
    boolval?: Boolean | undefined;
    sval?: String | undefined;
    bsval?: BitString | undefined;
    isnull?: boolean;
    location: number;
  }

  export interface Alias {
    aliasname: string;
    colnames: Node[];
  }

  export interface RangeVar {
    catalogname: string;
    schemaname: string;
    relname: string;
    inh: boolean;
    relpersistence: string;
    alias: Alias | undefined;
    location: number;
  }

  export interface TableFunc {
    nsUris: Node[];
    nsNames: Node[];
    docexpr: Node | undefined;
    rowexpr: Node | undefined;
    colnames: Node[];
    coltypes: Node[];
    coltypmods: Node[];
    colcollations: Node[];
    colexprs: Node[];
    coldefexprs: Node[];
    notnulls: number[];
    ordinalitycol: number;
    location: number;
  }

  export interface Var {
    xpr: Node | undefined;
    varno: number;
    varattno: number;
    vartype: number;
    vartypmod: number;
    varcollid: number;
    varlevelsup: number;
    varnosyn: number;
    varattnosyn: number;
    location: number;
  }

  export interface Param {
    xpr: Node | undefined;
    paramkind: ParamKind;
    paramid: number;
    paramtype: number;
    paramtypmod: number;
    paramcollid: number;
    location: number;
  }

  export interface Aggref {
    xpr: Node | undefined;
    aggfnoid: number;
    aggtype: number;
    aggcollid: number;
    inputcollid: number;
    aggtranstype: number;
    aggargtypes: Node[];
    aggdirectargs: Node[];
    args: Node[];
    aggorder: Node[];
    aggdistinct: Node[];
    aggfilter: Node | undefined;
    aggstar: boolean;
    aggvariadic: boolean;
    aggkind: string;
    agglevelsup: number;
    aggsplit: AggSplit;
    aggno: number;
    aggtransno: number;
    location: number;
  }

  export interface GroupingFunc {
    xpr: Node | undefined;
    args: Node[];
    refs: Node[];
    cols: Node[];
    agglevelsup: number;
    location: number;
  }

  export interface WindowFunc {
    xpr: Node | undefined;
    winfnoid: number;
    wintype: number;
    wincollid: number;
    inputcollid: number;
    args: Node[];
    aggfilter: Node | undefined;
    winref: number;
    winstar: boolean;
    winagg: boolean;
    location: number;
  }

  export interface SubscriptingRef {
    xpr: Node | undefined;
    refcontainertype: number;
    refelemtype: number;
    refrestype: number;
    reftypmod: number;
    refcollid: number;
    refupperindexpr: Node[];
    reflowerindexpr: Node[];
    refexpr: Node | undefined;
    refassgnexpr: Node | undefined;
  }

  export interface FuncExpr {
    xpr: Node | undefined;
    funcid: number;
    funcresulttype: number;
    funcretset: boolean;
    funcvariadic: boolean;
    funcformat: CoercionForm;
    funccollid: number;
    inputcollid: number;
    args: Node[];
    location: number;
  }

  export interface NamedArgExpr {
    xpr: Node | undefined;
    arg: Node | undefined;
    name: string;
    argnumber: number;
    location: number;
  }

  export interface OpExpr {
    xpr: Node | undefined;
    opno: number;
    opfuncid: number;
    opresulttype: number;
    opretset: boolean;
    opcollid: number;
    inputcollid: number;
    args: Node[];
    location: number;
  }

  export interface DistinctExpr {
    xpr: Node | undefined;
    opno: number;
    opfuncid: number;
    opresulttype: number;
    opretset: boolean;
    opcollid: number;
    inputcollid: number;
    args: Node[];
    location: number;
  }

  export interface NullIfExpr {
    xpr: Node | undefined;
    opno: number;
    opfuncid: number;
    opresulttype: number;
    opretset: boolean;
    opcollid: number;
    inputcollid: number;
    args: Node[];
    location: number;
  }

  export interface ScalarArrayOpExpr {
    xpr: Node | undefined;
    opno: number;
    opfuncid: number;
    hashfuncid: number;
    negfuncid: number;
    useOr: boolean;
    inputcollid: number;
    args: Node[];
    location: number;
  }

  export interface BoolExpr {
    xpr: Node | undefined;
    boolop: BoolExprType;
    args: Node[];
    location: number;
  }

  export interface SubLink {
    xpr: Node | undefined;
    subLinkType: SubLinkType;
    subLinkId: number;
    testexpr: Node | undefined;
    operName: Node[];
    subselect: Node | undefined;
    location: number;
  }

  export interface SubPlan {
    xpr: Node | undefined;
    subLinkType: SubLinkType;
    testexpr: Node | undefined;
    paramIds: Node[];
    planId: number;
    planName: string;
    firstColType: number;
    firstColTypmod: number;
    firstColCollation: number;
    useHashTable: boolean;
    unknownEqFalse: boolean;
    parallelSafe: boolean;
    setParam: Node[];
    parParam: Node[];
    args: Node[];
    startupCost: number;
    perCallCost: number;
  }

  export interface AlternativeSubPlan {
    xpr: Node | undefined;
    subplans: Node[];
  }

  export interface FieldSelect {
    xpr: Node | undefined;
    arg: Node | undefined;
    fieldnum: number;
    resulttype: number;
    resulttypmod: number;
    resultcollid: number;
  }

  export interface FieldStore {
    xpr: Node | undefined;
    arg: Node | undefined;
    newvals: Node[];
    fieldnums: Node[];
    resulttype: number;
  }

  export interface RelabelType {
    xpr: Node | undefined;
    arg: Node | undefined;
    resulttype: number;
    resulttypmod: number;
    resultcollid: number;
    relabelformat: CoercionForm;
    location: number;
  }

  export interface CoerceViaIO {
    xpr: Node | undefined;
    arg: Node | undefined;
    resulttype: number;
    resultcollid: number;
    coerceformat: CoercionForm;
    location: number;
  }

  export interface ArrayCoerceExpr {
    xpr: Node | undefined;
    arg: Node | undefined;
    elemexpr: Node | undefined;
    resulttype: number;
    resulttypmod: number;
    resultcollid: number;
    coerceformat: CoercionForm;
    location: number;
  }

  export interface ConvertRowtypeExpr {
    xpr: Node | undefined;
    arg: Node | undefined;
    resulttype: number;
    convertformat: CoercionForm;
    location: number;
  }

  export interface CollateExpr {
    xpr: Node | undefined;
    arg: Node | undefined;
    collOid: number;
    location: number;
  }

  export interface CaseExpr {
    xpr: Node | undefined;
    casetype: number;
    casecollid: number;
    arg: Node | undefined;
    args: Node[];
    defresult: Node | undefined;
    location: number;
  }

  export interface CaseWhen {
    xpr: Node | undefined;
    expr: Node | undefined;
    result: Node | undefined;
    location: number;
  }

  export interface CaseTestExpr {
    xpr: Node | undefined;
    typeId: number;
    typeMod: number;
    collation: number;
  }

  export interface ArrayExpr {
    xpr: Node | undefined;
    arrayTypeid: number;
    arrayCollid: number;
    elementTypeid: number;
    elements: Node[];
    multidims: boolean;
    location: number;
  }

  export interface RowExpr {
    xpr: Node | undefined;
    args: Node[];
    rowTypeid: number;
    rowFormat: CoercionForm;
    colnames: Node[];
    location: number;
  }

  export interface RowCompareExpr {
    xpr: Node | undefined;
    rctype: RowCompareType;
    opnos: Node[];
    opfamilies: Node[];
    inputcollids: Node[];
    largs: Node[];
    rargs: Node[];
  }

  export interface CoalesceExpr {
    xpr: Node | undefined;
    coalescetype: number;
    coalescecollid: number;
    args: Node[];
    location: number;
  }

  export interface MinMaxExpr {
    xpr: Node | undefined;
    minmaxtype: number;
    minmaxcollid: number;
    inputcollid: number;
    op: MinMaxOp;
    args: Node[];
    location: number;
  }

  export interface SQLValueFunction {
    xpr: Node | undefined;
    op: SQLValueFunctionOp;
    type: number;
    typmod: number;
    location: number;
  }

  export interface XmlExpr {
    xpr: Node | undefined;
    op: XmlExprOp;
    name: string;
    namedArgs: Node[];
    argNames: Node[];
    args: Node[];
    xmloption: XmlOptionType;
    type: number;
    typmod: number;
    location: number;
  }

  export interface NullTest {
    xpr: Node | undefined;
    arg: Node | undefined;
    nulltesttype: NullTestType;
    argisrow: boolean;
    location: number;
  }

  export interface BooleanTest {
    xpr: Node | undefined;
    arg: Node | undefined;
    booltesttype: BoolTestType;
    location: number;
  }

  export interface CoerceToDomain {
    xpr: Node | undefined;
    arg: Node | undefined;
    resulttype: number;
    resulttypmod: number;
    resultcollid: number;
    coercionformat: CoercionForm;
    location: number;
  }

  export interface CoerceToDomainValue {
    xpr: Node | undefined;
    typeId: number;
    typeMod: number;
    collation: number;
    location: number;
  }

  export interface SetToDefault {
    xpr: Node | undefined;
    typeId: number;
    typeMod: number;
    collation: number;
    location: number;
  }

  export interface CurrentOfExpr {
    xpr: Node | undefined;
    cvarno: number;
    cursorName: string;
    cursorParam: number;
  }

  export interface NextValueExpr {
    xpr: Node | undefined;
    seqid: number;
    typeId: number;
  }

  export interface InferenceElem {
    xpr: Node | undefined;
    expr: Node | undefined;
    infercollid: number;
    inferopclass: number;
  }

  export interface TargetEntry {
    xpr: Node | undefined;
    expr: Node | undefined;
    resno: number;
    resname: string;
    ressortgroupref: number;
    resorigtbl: number;
    resorigcol: number;
    resjunk: boolean;
  }

  export interface RangeTblRef {
    rtindex: number;
  }

  export interface JoinExpr {
    jointype: JoinType;
    isNatural: boolean;
    larg: Node | undefined;
    rarg: Node | undefined;
    usingClause: Node[];
    joinUsingAlias: Alias | undefined;
    quals: Node | undefined;
    alias: Alias | undefined;
    rtindex: number;
  }

  export interface FromExpr {
    fromlist: Node[];
    quals: Node | undefined;
  }

  export interface OnConflictExpr {
    action: OnConflictAction;
    arbiterElems: Node[];
    arbiterWhere: Node | undefined;
    constraint: number;
    onConflictSet: Node[];
    onConflictWhere: Node | undefined;
    exclRelIndex: number;
    exclRelTlist: Node[];
  }

  export interface IntoClause {
    rel: RangeVar | undefined;
    colNames: Node[];
    accessMethod: string;
    options: Node[];
    onCommit: OnCommitAction;
    tableSpaceName: string;
    viewQuery: Node | undefined;
    skipData: boolean;
  }

  export interface MergeAction {
    matched: boolean;
    commandType: CmdType;
    override: OverridingKind;
    qual: Node | undefined;
    targetList: Node[];
    updateColnos: Node[];
  }

  export interface RawStmt {
    stmt: Node | undefined;
    stmtLocation: number;
    stmtLen: number;
  }

  export interface Query {
    commandType: CmdType;
    querySource: QuerySource;
    canSetTag: boolean;
    utilityStmt: Node | undefined;
    resultRelation: number;
    hasAggs: boolean;
    hasWindowFuncs: boolean;
    hasTargetSrfs: boolean;
    hasSubLinks: boolean;
    hasDistinctOn: boolean;
    hasRecursive: boolean;
    hasModifyingCte: boolean;
    hasForUpdate: boolean;
    hasRowSecurity: boolean;
    isReturn: boolean;
    cteList: Node[];
    rtable: Node[];
    jointree: FromExpr | undefined;
    mergeActionList: Node[];
    mergeUseOuterJoin: boolean;
    targetList: Node[];
    override: OverridingKind;
    onConflict: OnConflictExpr | undefined;
    returningList: Node[];
    groupClause: Node[];
    groupDistinct: boolean;
    groupingSets: Node[];
    havingQual: Node | undefined;
    windowClause: Node[];
    distinctClause: Node[];
    sortClause: Node[];
    limitOffset: Node | undefined;
    limitCount: Node | undefined;
    limitOption: LimitOption;
    rowMarks: Node[];
    setOperations: Node | undefined;
    constraintDeps: Node[];
    withCheckOptions: Node[];
    stmtLocation: number;
    stmtLen: number;
  }

  export interface InsertStmt {
    relation: RangeVar | undefined;
    cols: Node[];
    selectStmt: Node | undefined;
    onConflictClause: OnConflictClause | undefined;
    returningList: Node[];
    withClause: WithClause | undefined;
    override: OverridingKind;
  }

  export interface DeleteStmt {
    relation: RangeVar | undefined;
    usingClause: Node[];
    whereClause: Node | undefined;
    returningList: Node[];
    withClause: WithClause | undefined;
  }

  export interface UpdateStmt {
    relation: RangeVar | undefined;
    targetList: Node[];
    whereClause: Node | undefined;
    fromClause: Node[];
    returningList: Node[];
    withClause: WithClause | undefined;
  }

  export interface MergeStmt {
    relation: RangeVar | undefined;
    sourceRelation: Node | undefined;
    joinCondition: Node | undefined;
    mergeWhenClauses: Node[];
    withClause: WithClause | undefined;
  }

  export interface SelectStmt {
    distinctClause: Node[];
    intoClause: IntoClause | undefined;
    targetList: Node[];
    fromClause: Node[];
    whereClause: Node | undefined;
    groupClause: Node[];
    groupDistinct: boolean;
    havingClause: Node | undefined;
    windowClause: Node[];
    valuesLists: Node[];
    sortClause: Node[];
    limitOffset: Node | undefined;
    limitCount: Node | undefined;
    limitOption: LimitOption;
    lockingClause: Node[];
    withClause: WithClause | undefined;
    op: SetOperation;
    all: boolean;
    larg: SelectStmt | undefined;
    rarg: SelectStmt | undefined;
  }

  export interface ReturnStmt {
    returnval: Node | undefined;
  }

  export interface PLAssignStmt {
    name: string;
    indirection: Node[];
    nnames: number;
    val: SelectStmt | undefined;
    location: number;
  }

  export interface AlterTableStmt {
    relation: RangeVar | undefined;
    cmds: Node[];
    objtype: ObjectType;
    missingOk: boolean;
  }

  export interface AlterTableCmd {
    subtype: AlterTableType;
    name: string;
    num: number;
    newowner: RoleSpec | undefined;
    def: Node | undefined;
    behavior: DropBehavior;
    missingOk: boolean;
    recurse: boolean;
  }

  export interface AlterDomainStmt {
    subtype: string;
    typeName: Node[];
    name: string;
    def: Node | undefined;
    behavior: DropBehavior;
    missingOk: boolean;
  }

  export interface SetOperationStmt {
    op: SetOperation;
    all: boolean;
    larg: Node | undefined;
    rarg: Node | undefined;
    colTypes: Node[];
    colTypmods: Node[];
    colCollations: Node[];
    groupClauses: Node[];
  }

  export interface GrantStmt {
    isGrant: boolean;
    targtype: GrantTargetType;
    objtype: ObjectType;
    objects: Node[];
    privileges: Node[];
    grantees: Node[];
    grantOption: boolean;
    grantor: RoleSpec | undefined;
    behavior: DropBehavior;
  }

  export interface GrantRoleStmt {
    grantedRoles: Node[];
    granteeRoles: Node[];
    isGrant: boolean;
    adminOpt: boolean;
    grantor: RoleSpec | undefined;
    behavior: DropBehavior;
  }

  export interface AlterDefaultPrivilegesStmt {
    options: Node[];
    action: GrantStmt | undefined;
  }

  export interface ClosePortalStmt {
    portalname: string;
  }

  export interface ClusterStmt {
    relation: RangeVar | undefined;
    indexname: string;
    params: Node[];
  }

  export interface CopyStmt {
    relation: RangeVar | undefined;
    query: Node | undefined;
    attlist: Node[];
    isFrom: boolean;
    isProgram: boolean;
    filename: string;
    options: Node[];
    whereClause: Node | undefined;
  }

  export interface CreateStmt {
    relation: RangeVar | undefined;
    tableElts: Node[];
    inhRelations: Node[];
    partbound: PartitionBoundSpec | undefined;
    partspec: PartitionSpec | undefined;
    ofTypename: TypeName | undefined;
    constraints: Node[];
    options: Node[];
    oncommit: OnCommitAction;
    tablespacename: string;
    accessMethod: string;
    ifNotExists: boolean;
  }

  export interface DefineStmt {
    kind: ObjectType;
    oldstyle: boolean;
    defnames: Node[];
    args: Node[];
    definition: Node[];
    ifNotExists: boolean;
    replace: boolean;
  }

  export interface DropStmt {
    objects: Node[];
    removeType: ObjectType;
    behavior: DropBehavior;
    missingOk: boolean;
    concurrent: boolean;
  }

  export interface TruncateStmt {
    relations: Node[];
    restartSeqs: boolean;
    behavior: DropBehavior;
  }

  export interface CommentStmt {
    objtype: ObjectType;
    object: Node | undefined;
    comment: string;
  }

  export interface FetchStmt {
    direction: FetchDirection;
    howMany: number;
    portalname: string;
    ismove: boolean;
  }

  export interface IndexStmt {
    idxname: string;
    relation: RangeVar | undefined;
    accessMethod: string;
    tableSpace: string;
    indexParams: Node[];
    indexIncludingParams: Node[];
    options: Node[];
    whereClause: Node | undefined;
    excludeOpNames: Node[];
    idxcomment: string;
    indexOid: number;
    oldNode: number;
    oldCreateSubid: number;
    oldFirstRelfilenodeSubid: number;
    unique: boolean;
    nullsNotDistinct: boolean;
    primary: boolean;
    isconstraint: boolean;
    deferrable: boolean;
    initdeferred: boolean;
    transformed: boolean;
    concurrent: boolean;
    ifNotExists: boolean;
    resetDefaultTblspc: boolean;
  }

  export interface CreateFunctionStmt {
    isProcedure: boolean;
    replace: boolean;
    funcname: Node[];
    parameters: Node[];
    returnType: TypeName | undefined;
    options: Node[];
    sqlBody: Node | undefined;
  }

  export interface AlterFunctionStmt {
    objtype: ObjectType;
    func: ObjectWithArgs | undefined;
    actions: Node[];
  }

  export interface DoStmt {
    args: Node[];
  }

  export interface RenameStmt {
    renameType: ObjectType;
    relationType: ObjectType;
    relation: RangeVar | undefined;
    object: Node | undefined;
    subname: string;
    newname: string;
    behavior: DropBehavior;
    missingOk: boolean;
  }

  export interface RuleStmt {
    relation: RangeVar | undefined;
    rulename: string;
    whereClause: Node | undefined;
    event: CmdType;
    instead: boolean;
    actions: Node[];
    replace: boolean;
  }

  export interface NotifyStmt {
    conditionname: string;
    payload: string;
  }

  export interface ListenStmt {
    conditionname: string;
  }

  export interface UnlistenStmt {
    conditionname: string;
  }

  export interface TransactionStmt {
    kind: TransactionStmtKind;
    options: Node[];
    savepointName: string;
    gid: string;
    chain: boolean;
  }

  export interface ViewStmt {
    view: RangeVar | undefined;
    aliases: Node[];
    query: Node | undefined;
    replace: boolean;
    options: Node[];
    withCheckOption: ViewCheckOption;
  }

  export interface LoadStmt {
    filename: string;
  }

  export interface CreateDomainStmt {
    domainname: Node[];
    typeName: TypeName | undefined;
    collClause: CollateClause | undefined;
    constraints: Node[];
  }

  export interface CreatedbStmt {
    dbname: string;
    options: Node[];
  }

  export interface DropdbStmt {
    dbname: string;
    missingOk: boolean;
    options: Node[];
  }

  export interface VacuumStmt {
    options: Node[];
    rels: Node[];
    isVacuumcmd: boolean;
  }

  export interface ExplainStmt {
    query: Node | undefined;
    options: Node[];
  }

  export interface CreateTableAsStmt {
    query: Node | undefined;
    into: IntoClause | undefined;
    objtype: ObjectType;
    isSelectInto: boolean;
    ifNotExists: boolean;
  }

  export interface CreateSeqStmt {
    sequence: RangeVar | undefined;
    options: Node[];
    ownerId: number;
    forIdentity: boolean;
    ifNotExists: boolean;
  }

  export interface AlterSeqStmt {
    sequence: RangeVar | undefined;
    options: Node[];
    forIdentity: boolean;
    missingOk: boolean;
  }

  export interface VariableSetStmt {
    kind: VariableSetKind;
    name: string;
    args: Node[];
    isLocal: boolean;
  }

  export interface VariableShowStmt {
    name: string;
  }

  export interface DiscardStmt {
    target: DiscardMode;
  }

  export interface CreateTrigStmt {
    replace: boolean;
    isconstraint: boolean;
    trigname: string;
    relation: RangeVar | undefined;
    funcname: Node[];
    args: Node[];
    row: boolean;
    timing: number;
    events: number;
    columns: Node[];
    whenClause: Node | undefined;
    transitionRels: Node[];
    deferrable: boolean;
    initdeferred: boolean;
    constrrel: RangeVar | undefined;
  }

  export interface CreatePLangStmt {
    replace: boolean;
    plname: string;
    plhandler: Node[];
    plinline: Node[];
    plvalidator: Node[];
    pltrusted: boolean;
  }

  export interface CreateRoleStmt {
    stmtType: RoleStmtType;
    role: string;
    options: Node[];
  }

  export interface AlterRoleStmt {
    role: RoleSpec | undefined;
    options: Node[];
    action: number;
  }

  export interface DropRoleStmt {
    roles: Node[];
    missingOk: boolean;
  }

  export interface LockStmt {
    relations: Node[];
    mode: number;
    nowait: boolean;
  }

  export interface ConstraintsSetStmt {
    constraints: Node[];
    deferred: boolean;
  }

  export interface ReindexStmt {
    kind: ReindexObjectType;
    relation: RangeVar | undefined;
    name: string;
    params: Node[];
  }

  export interface CheckPointStmt {}

  export interface CreateSchemaStmt {
    schemaname: string;
    authrole: RoleSpec | undefined;
    schemaElts: Node[];
    ifNotExists: boolean;
  }

  export interface AlterDatabaseStmt {
    dbname: string;
    options: Node[];
  }

  export interface AlterDatabaseRefreshCollStmt {
    dbname: string;
  }

  export interface AlterDatabaseSetStmt {
    dbname: string;
    setstmt: VariableSetStmt | undefined;
  }

  export interface AlterRoleSetStmt {
    role: RoleSpec | undefined;
    database: string;
    setstmt: VariableSetStmt | undefined;
  }

  export interface CreateConversionStmt {
    conversionName: Node[];
    forEncodingName: string;
    toEncodingName: string;
    funcName: Node[];
    def: boolean;
  }

  export interface CreateCastStmt {
    sourcetype: TypeName | undefined;
    targettype: TypeName | undefined;
    func: ObjectWithArgs | undefined;
    context: CoercionContext;
    inout: boolean;
  }

  export interface CreateOpClassStmt {
    opclassname: Node[];
    opfamilyname: Node[];
    amname: string;
    datatype: TypeName | undefined;
    items: Node[];
    isDefault: boolean;
  }

  export interface CreateOpFamilyStmt {
    opfamilyname: Node[];
    amname: string;
  }

  export interface AlterOpFamilyStmt {
    opfamilyname: Node[];
    amname: string;
    isDrop: boolean;
    items: Node[];
  }

  export interface PrepareStmt {
    name: string;
    argtypes: Node[];
    query: Node | undefined;
  }

  export interface ExecuteStmt {
    name: string;
    params: Node[];
  }

  export interface DeallocateStmt {
    name: string;
  }

  export interface DeclareCursorStmt {
    portalname: string;
    options: number;
    query: Node | undefined;
  }

  export interface CreateTableSpaceStmt {
    tablespacename: string;
    owner: RoleSpec | undefined;
    location: string;
    options: Node[];
  }

  export interface DropTableSpaceStmt {
    tablespacename: string;
    missingOk: boolean;
  }

  export interface AlterObjectDependsStmt {
    objectType: ObjectType;
    relation: RangeVar | undefined;
    object: Node | undefined;
    extname: String | undefined;
    remove: boolean;
  }

  export interface AlterObjectSchemaStmt {
    objectType: ObjectType;
    relation: RangeVar | undefined;
    object: Node | undefined;
    newschema: string;
    missingOk: boolean;
  }

  export interface AlterOwnerStmt {
    objectType: ObjectType;
    relation: RangeVar | undefined;
    object: Node | undefined;
    newowner: RoleSpec | undefined;
  }

  export interface AlterOperatorStmt {
    opername: ObjectWithArgs | undefined;
    options: Node[];
  }

  export interface AlterTypeStmt {
    typeName: Node[];
    options: Node[];
  }

  export interface DropOwnedStmt {
    roles: Node[];
    behavior: DropBehavior;
  }

  export interface ReassignOwnedStmt {
    roles: Node[];
    newrole: RoleSpec | undefined;
  }

  export interface CompositeTypeStmt {
    typevar: RangeVar | undefined;
    coldeflist: Node[];
  }

  export interface CreateEnumStmt {
    typeName: Node[];
    vals: Node[];
  }

  export interface CreateRangeStmt {
    typeName: Node[];
    params: Node[];
  }

  export interface AlterEnumStmt {
    typeName: Node[];
    oldVal: string;
    newVal: string;
    newValNeighbor: string;
    newValIsAfter: boolean;
    skipIfNewValExists: boolean;
  }

  export interface AlterTSDictionaryStmt {
    dictname: Node[];
    options: Node[];
  }

  export interface AlterTSConfigurationStmt {
    kind: AlterTSConfigType;
    cfgname: Node[];
    tokentype: Node[];
    dicts: Node[];
    override: boolean;
    replace: boolean;
    missingOk: boolean;
  }

  export interface CreateFdwStmt {
    fdwname: string;
    funcOptions: Node[];
    options: Node[];
  }

  export interface AlterFdwStmt {
    fdwname: string;
    funcOptions: Node[];
    options: Node[];
  }

  export interface CreateForeignServerStmt {
    servername: string;
    servertype: string;
    version: string;
    fdwname: string;
    ifNotExists: boolean;
    options: Node[];
  }

  export interface AlterForeignServerStmt {
    servername: string;
    version: string;
    options: Node[];
    hasVersion: boolean;
  }

  export interface CreateUserMappingStmt {
    user: RoleSpec | undefined;
    servername: string;
    ifNotExists: boolean;
    options: Node[];
  }

  export interface AlterUserMappingStmt {
    user: RoleSpec | undefined;
    servername: string;
    options: Node[];
  }

  export interface DropUserMappingStmt {
    user: RoleSpec | undefined;
    servername: string;
    missingOk: boolean;
  }

  export interface AlterTableSpaceOptionsStmt {
    tablespacename: string;
    options: Node[];
    isReset: boolean;
  }

  export interface AlterTableMoveAllStmt {
    origTablespacename: string;
    objtype: ObjectType;
    roles: Node[];
    newTablespacename: string;
    nowait: boolean;
  }

  export interface SecLabelStmt {
    objtype: ObjectType;
    object: Node | undefined;
    provider: string;
    label: string;
  }

  export interface CreateForeignTableStmt {
    baseStmt: CreateStmt | undefined;
    servername: string;
    options: Node[];
  }

  export interface ImportForeignSchemaStmt {
    serverName: string;
    remoteSchema: string;
    localSchema: string;
    listType: ImportForeignSchemaType;
    tableList: Node[];
    options: Node[];
  }

  export interface CreateExtensionStmt {
    extname: string;
    ifNotExists: boolean;
    options: Node[];
  }

  export interface AlterExtensionStmt {
    extname: string;
    options: Node[];
  }

  export interface AlterExtensionContentsStmt {
    extname: string;
    action: number;
    objtype: ObjectType;
    object: Node | undefined;
  }

  export interface CreateEventTrigStmt {
    trigname: string;
    eventname: string;
    whenclause: Node[];
    funcname: Node[];
  }

  export interface AlterEventTrigStmt {
    trigname: string;
    tgenabled: string;
  }

  export interface RefreshMatViewStmt {
    concurrent: boolean;
    skipData: boolean;
    relation: RangeVar | undefined;
  }

  export interface ReplicaIdentityStmt {
    identityType: string;
    name: string;
  }

  export interface AlterSystemStmt {
    setstmt: VariableSetStmt | undefined;
  }

  export interface CreatePolicyStmt {
    policyName: string;
    table: RangeVar | undefined;
    cmdName: string;
    permissive: boolean;
    roles: Node[];
    qual: Node | undefined;
    withCheck: Node | undefined;
  }

  export interface AlterPolicyStmt {
    policyName: string;
    table: RangeVar | undefined;
    roles: Node[];
    qual: Node | undefined;
    withCheck: Node | undefined;
  }

  export interface CreateTransformStmt {
    replace: boolean;
    typeName: TypeName | undefined;
    lang: string;
    fromsql: ObjectWithArgs | undefined;
    tosql: ObjectWithArgs | undefined;
  }

  export interface CreateAmStmt {
    amname: string;
    handlerName: Node[];
    amtype: string;
  }

  export interface CreatePublicationStmt {
    pubname: string;
    options: Node[];
    pubobjects: Node[];
    forAllTables: boolean;
  }

  export interface AlterPublicationStmt {
    pubname: string;
    options: Node[];
    pubobjects: Node[];
    forAllTables: boolean;
    action: AlterPublicationAction;
  }

  export interface CreateSubscriptionStmt {
    subname: string;
    conninfo: string;
    publication: Node[];
    options: Node[];
  }

  export interface AlterSubscriptionStmt {
    kind: AlterSubscriptionType;
    subname: string;
    conninfo: string;
    publication: Node[];
    options: Node[];
  }

  export interface DropSubscriptionStmt {
    subname: string;
    missingOk: boolean;
    behavior: DropBehavior;
  }

  export interface CreateStatsStmt {
    defnames: Node[];
    statTypes: Node[];
    exprs: Node[];
    relations: Node[];
    stxcomment: string;
    transformed: boolean;
    ifNotExists: boolean;
  }

  export interface AlterCollationStmt {
    collname: Node[];
  }

  export interface CallStmt {
    funccall: FuncCall | undefined;
    funcexpr: FuncExpr | undefined;
    outargs: Node[];
  }

  export interface AlterStatsStmt {
    defnames: Node[];
    stxstattarget: number;
    missingOk: boolean;
  }

  export interface AExpr {
    kind: AExprKind;
    name: Node[];
    lexpr: Node | undefined;
    rexpr: Node | undefined;
    location: number;
  }

  export interface ColumnRef {
    fields: Node[];
    location: number;
  }

  export interface ParamRef {
    number: number;
    location: number;
  }

  export interface FuncCall {
    funcname: Node[];
    args: Node[];
    aggOrder: Node[];
    aggFilter: Node | undefined;
    over: WindowDef | undefined;
    aggWithinGroup: boolean;
    aggStar: boolean;
    aggDistinct: boolean;
    funcVariadic: boolean;
    funcformat: CoercionForm;
    location: number;
  }

  export interface AStar {}

  export interface AIndices {
    isSlice: boolean;
    lidx: Node | undefined;
    uidx: Node | undefined;
  }

  export interface AIndirection {
    arg: Node | undefined;
    indirection: Node[];
  }

  export interface AArrayExpr {
    elements: Node[];
    location: number;
  }

  export interface ResTarget {
    name: string;
    indirection: Node[];
    val: Node | undefined;
    location: number;
  }

  export interface MultiAssignRef {
    source: Node | undefined;
    colno: number;
    ncolumns: number;
  }

  export interface TypeCast {
    arg: Node | undefined;
    typeName: TypeName | undefined;
    location: number;
  }

  export interface CollateClause {
    arg: Node | undefined;
    collname: Node[];
    location: number;
  }

  export interface SortBy {
    node: Node | undefined;
    sortbyDir: SortByDir;
    sortbyNulls: SortByNulls;
    useOp: Node[];
    location: number;
  }

  export interface WindowDef {
    name: string;
    refname: string;
    partitionClause: Node[];
    orderClause: Node[];
    frameOptions: number;
    startOffset: Node | undefined;
    endOffset: Node | undefined;
    location: number;
  }

  export interface RangeSubselect {
    lateral: boolean;
    subquery: Node | undefined;
    alias: Alias | undefined;
  }

  export interface RangeFunction {
    lateral: boolean;
    ordinality: boolean;
    isRowsfrom: boolean;
    functions: Node[];
    alias: Alias | undefined;
    coldeflist: Node[];
  }

  export interface RangeTableSample {
    relation: Node | undefined;
    method: Node[];
    args: Node[];
    repeatable: Node | undefined;
    location: number;
  }

  export interface RangeTableFunc {
    lateral: boolean;
    docexpr: Node | undefined;
    rowexpr: Node | undefined;
    namespaces: Node[];
    columns: Node[];
    alias: Alias | undefined;
    location: number;
  }

  export interface RangeTableFuncCol {
    colname: string;
    typeName: TypeName | undefined;
    forOrdinality: boolean;
    isNotNull: boolean;
    colexpr: Node | undefined;
    coldefexpr: Node | undefined;
    location: number;
  }

  export interface TypeName {
    names: Node[];
    typeOid: number;
    setof: boolean;
    pctType: boolean;
    typmods: Node[];
    typemod: number;
    arrayBounds: Node[];
    location: number;
  }

  export interface ColumnDef {
    colname: string;
    typeName: TypeName | undefined;
    compression: string;
    inhcount: number;
    isLocal: boolean;
    isNotNull: boolean;
    isFromType: boolean;
    storage: string;
    rawDefault: Node | undefined;
    cookedDefault: Node | undefined;
    identity: string;
    identitySequence: RangeVar | undefined;
    generated: string;
    collClause: CollateClause | undefined;
    collOid: number;
    constraints: Node[];
    fdwoptions: Node[];
    location: number;
  }

  export interface IndexElem {
    name: string;
    expr: Node | undefined;
    indexcolname: string;
    collation: Node[];
    opclass: Node[];
    opclassopts: Node[];
    ordering: SortByDir;
    nullsOrdering: SortByNulls;
  }

  export interface StatsElem {
    name: string;
    expr: Node | undefined;
  }

  export interface Constraint {
    contype: ConstrType;
    conname: string;
    deferrable: boolean;
    initdeferred: boolean;
    location: number;
    isNoInherit: boolean;
    rawExpr: Node | undefined;
    cookedExpr: string;
    generatedWhen: string;
    nullsNotDistinct: boolean;
    keys: Node[];
    including: Node[];
    exclusions: Node[];
    options: Node[];
    indexname: string;
    indexspace: string;
    resetDefaultTblspc: boolean;
    accessMethod: string;
    whereClause: Node | undefined;
    pktable: RangeVar | undefined;
    fkAttrs: Node[];
    pkAttrs: Node[];
    fkMatchtype: string;
    fkUpdAction: string;
    fkDelAction: string;
    fkDelSetCols: Node[];
    oldConpfeqop: Node[];
    oldPktableOid: number;
    skipValidation: boolean;
    initiallyValid: boolean;
  }

  export interface DefElem {
    defnamespace: string;
    defname: string;
    arg: Node | undefined;
    defaction: DefElemAction;
    location: number;
  }

  export interface RangeTblEntry {
    rtekind: RTEKind;
    relid: number;
    relkind: string;
    rellockmode: number;
    tablesample: TableSampleClause | undefined;
    subquery: Query | undefined;
    securityBarrier: boolean;
    jointype: JoinType;
    joinmergedcols: number;
    joinaliasvars: Node[];
    joinleftcols: Node[];
    joinrightcols: Node[];
    joinUsingAlias: Alias | undefined;
    functions: Node[];
    funcordinality: boolean;
    tablefunc: TableFunc | undefined;
    valuesLists: Node[];
    ctename: string;
    ctelevelsup: number;
    selfReference: boolean;
    coltypes: Node[];
    coltypmods: Node[];
    colcollations: Node[];
    enrname: string;
    enrtuples: number;
    alias: Alias | undefined;
    eref: Alias | undefined;
    lateral: boolean;
    inh: boolean;
    inFromCl: boolean;
    requiredPerms: number;
    checkAsUser: number;
    selectedCols: number[];
    insertedCols: number[];
    updatedCols: number[];
    extraUpdatedCols: number[];
    securityQuals: Node[];
  }

  export interface RangeTblFunction {
    funcexpr: Node | undefined;
    funccolcount: number;
    funccolnames: Node[];
    funccoltypes: Node[];
    funccoltypmods: Node[];
    funccolcollations: Node[];
    funcparams: number[];
  }

  export interface TableSampleClause {
    tsmhandler: number;
    args: Node[];
    repeatable: Node | undefined;
  }

  export interface WithCheckOption {
    kind: WCOKind;
    relname: string;
    polname: string;
    qual: Node | undefined;
    cascaded: boolean;
  }

  export interface SortGroupClause {
    tleSortGroupRef: number;
    eqop: number;
    sortop: number;
    nullsFirst: boolean;
    hashable: boolean;
  }

  export interface GroupingSet {
    kind: GroupingSetKind;
    content: Node[];
    location: number;
  }

  export interface WindowClause {
    name: string;
    refname: string;
    partitionClause: Node[];
    orderClause: Node[];
    frameOptions: number;
    startOffset: Node | undefined;
    endOffset: Node | undefined;
    runCondition: Node[];
    startInRangeFunc: number;
    endInRangeFunc: number;
    inRangeColl: number;
    inRangeAsc: boolean;
    inRangeNullsFirst: boolean;
    winref: number;
    copiedOrder: boolean;
  }

  export interface ObjectWithArgs {
    objname: Node[];
    objargs: Node[];
    objfuncargs: Node[];
    argsUnspecified: boolean;
  }

  export interface AccessPriv {
    privName: string;
    cols: Node[];
  }

  export interface CreateOpClassItem {
    itemtype: number;
    name: ObjectWithArgs | undefined;
    number: number;
    orderFamily: Node[];
    classArgs: Node[];
    storedtype: TypeName | undefined;
  }

  export interface TableLikeClause {
    relation: RangeVar | undefined;
    options: number;
    relationOid: number;
  }

  export interface FunctionParameter {
    name: string;
    argType: TypeName | undefined;
    mode: FunctionParameterMode;
    defexpr: Node | undefined;
  }

  export interface LockingClause {
    lockedRels: Node[];
    strength: LockClauseStrength;
    waitPolicy: LockWaitPolicy;
  }

  export interface RowMarkClause {
    rti: number;
    strength: LockClauseStrength;
    waitPolicy: LockWaitPolicy;
    pushedDown: boolean;
  }

  export interface XmlSerialize {
    xmloption: XmlOptionType;
    expr: Node | undefined;
    typeName: TypeName | undefined;
    location: number;
  }

  export interface WithClause {
    ctes: Node[];
    recursive: boolean;
    location: number;
  }

  export interface InferClause {
    indexElems: Node[];
    whereClause: Node | undefined;
    conname: string;
    location: number;
  }

  export interface OnConflictClause {
    action: OnConflictAction;
    infer: InferClause | undefined;
    targetList: Node[];
    whereClause: Node | undefined;
    location: number;
  }

  export interface CTESearchClause {
    searchColList: Node[];
    searchBreadthFirst: boolean;
    searchSeqColumn: string;
    location: number;
  }

  export interface CTECycleClause {
    cycleColList: Node[];
    cycleMarkColumn: string;
    cycleMarkValue: Node | undefined;
    cycleMarkDefault: Node | undefined;
    cyclePathColumn: string;
    location: number;
    cycleMarkType: number;
    cycleMarkTypmod: number;
    cycleMarkCollation: number;
    cycleMarkNeop: number;
  }

  export interface CommonTableExpr {
    ctename: string;
    aliascolnames: Node[];
    ctematerialized: CTEMaterialize;
    ctequery: Node | undefined;
    searchClause: CTESearchClause | undefined;
    cycleClause: CTECycleClause | undefined;
    location: number;
    cterecursive: boolean;
    cterefcount: number;
    ctecolnames: Node[];
    ctecoltypes: Node[];
    ctecoltypmods: Node[];
    ctecolcollations: Node[];
  }

  export interface MergeWhenClause {
    matched: boolean;
    commandType: CmdType;
    override: OverridingKind;
    condition: Node | undefined;
    targetList: Node[];
    values: Node[];
  }

  export interface RoleSpec {
    roletype: RoleSpecType;
    rolename: string;
    location: number;
  }

  export interface TriggerTransition {
    name: string;
    isNew: boolean;
    isTable: boolean;
  }

  export interface PartitionElem {
    name: string;
    expr: Node | undefined;
    collation: Node[];
    opclass: Node[];
    location: number;
  }

  export interface PartitionSpec {
    strategy: string;
    partParams: Node[];
    location: number;
  }

  export interface PartitionBoundSpec {
    strategy: string;
    isDefault: boolean;
    modulus: number;
    remainder: number;
    listdatums: Node[];
    lowerdatums: Node[];
    upperdatums: Node[];
    location: number;
  }

  export interface PartitionRangeDatum {
    kind: PartitionRangeDatumKind;
    value: Node | undefined;
    location: number;
  }

  export interface PartitionCmd {
    name: RangeVar | undefined;
    bound: PartitionBoundSpec | undefined;
    concurrent: boolean;
  }

  export interface VacuumRelation {
    relation: RangeVar | undefined;
    oid: number;
    vaCols: Node[];
  }

  export interface PublicationObjSpec {
    pubobjtype: PublicationObjSpecType;
    name: string;
    pubtable: PublicationTable | undefined;
    location: number;
  }

  export interface PublicationTable {
    relation: RangeVar | undefined;
    whereClause: Node | undefined;
    columns: Node[];
  }

  export interface InlineCodeBlock {
    sourceText: string;
    langOid: number;
    langIsTrusted: boolean;
    atomic: boolean;
  }

  export interface CallContext {
    atomic: boolean;
  }

  export interface ScanToken {
    start: number;
    end: number;
    token: Token;
    keywordKind: KeywordKind;
  }

  enum OverridingKind {
    OVERRIDING_KIND_UNDEFINED = 0,
    OVERRIDING_NOT_SET = 1,
    OVERRIDING_USER_VALUE = 2,
    OVERRIDING_SYSTEM_VALUE = 3,
    UNRECOGNIZED = -1,
  }

  enum QuerySource {
    QUERY_SOURCE_UNDEFINED = 0,
    QSRC_ORIGINAL = 1,
    QSRC_PARSER = 2,
    QSRC_INSTEAD_RULE = 3,
    QSRC_QUAL_INSTEAD_RULE = 4,
    QSRC_NON_INSTEAD_RULE = 5,
    UNRECOGNIZED = -1,
  }

  enum SortByDir {
    SORT_BY_DIR_UNDEFINED = 0,
    SORTBY_DEFAULT = 1,
    SORTBY_ASC = 2,
    SORTBY_DESC = 3,
    SORTBY_USING = 4,
    UNRECOGNIZED = -1,
  }

  enum SortByNulls {
    SORT_BY_NULLS_UNDEFINED = 0,
    SORTBY_NULLS_DEFAULT = 1,
    SORTBY_NULLS_FIRST = 2,
    SORTBY_NULLS_LAST = 3,
    UNRECOGNIZED = -1,
  }

  export enum AExprKind {
    A_EXPR_KIND_UNDEFINED = "A_EXPR_KIND_UNDEFINED",
    AEXPR_OP = "AEXPR_OP",
    AEXPR_OP_ANY = "AEXPR_OP_ANY",
    AEXPR_OP_ALL = "AEXPR_OP_ALL",
    AEXPR_DISTINCT = "AEXPR_DISTINCT",
    AEXPR_NOT_DISTINCT = "AEXPR_NOT_DISTINCT",
    AEXPR_NULLIF = "AEXPR_NULLIF",
    AEXPR_IN = "AEXPR_IN",
    AEXPR_LIKE = "AEXPR_LIKE",
    AEXPR_ILIKE = "AEXPR_ILIKE",
    AEXPR_SIMILAR = "AEXPR_SIMILAR",
    AEXPR_BETWEEN = "AEXPR_BETWEEN",
    AEXPR_NOT_BETWEEN = "AEXPR_NOT_BETWEEN",
    AEXPR_BETWEEN_SYM = "AEXPR_BETWEEN_SYM",
    AEXPR_NOT_BETWEEN_SYM = "AEXPR_NOT_BETWEEN_SYM",
    UNRECOGNIZED = "UNRECOGNIZED",
  }

  enum RoleSpecType {
    ROLE_SPEC_TYPE_UNDEFINED = 0,
    ROLESPEC_CSTRING = 1,
    ROLESPEC_CURRENT_ROLE = 2,
    ROLESPEC_CURRENT_USER = 3,
    ROLESPEC_SESSION_USER = 4,
    ROLESPEC_PUBLIC = 5,
    UNRECOGNIZED = -1,
  }

  enum DefElemAction {
    DEF_ELEM_ACTION_UNDEFINED = 0,
    DEFELEM_UNSPEC = 1,
    DEFELEM_SET = 2,
    DEFELEM_ADD = 3,
    DEFELEM_DROP = 4,
    UNRECOGNIZED = -1,
  }

  enum PartitionRangeDatumKind {
    PARTITION_RANGE_DATUM_KIND_UNDEFINED = 0,
    PARTITION_RANGE_DATUM_MINVALUE = 1,
    PARTITION_RANGE_DATUM_VALUE = 2,
    PARTITION_RANGE_DATUM_MAXVALUE = 3,
    UNRECOGNIZED = -1,
  }

  enum RTEKind {
    RTEKIND_UNDEFINED = 0,
    RTE_RELATION = 1,
    RTE_SUBQUERY = 2,
    RTE_JOIN = 3,
    RTE_FUNCTION = 4,
    RTE_TABLEFUNC = 5,
    RTE_VALUES = 6,
    RTE_CTE = 7,
    RTE_NAMEDTUPLESTORE = 8,
    RTE_RESULT = 9,
    UNRECOGNIZED = -1,
  }

  enum WCOKind {
    WCOKIND_UNDEFINED = 0,
    WCO_VIEW_CHECK = 1,
    WCO_RLS_INSERT_CHECK = 2,
    WCO_RLS_UPDATE_CHECK = 3,
    WCO_RLS_CONFLICT_CHECK = 4,
    WCO_RLS_MERGE_UPDATE_CHECK = 5,
    WCO_RLS_MERGE_DELETE_CHECK = 6,
    UNRECOGNIZED = -1,
  }

  enum GroupingSetKind {
    GROUPING_SET_KIND_UNDEFINED = 0,
    GROUPING_SET_EMPTY = 1,
    GROUPING_SET_SIMPLE = 2,
    GROUPING_SET_ROLLUP = 3,
    GROUPING_SET_CUBE = 4,
    GROUPING_SET_SETS = 5,
    UNRECOGNIZED = -1,
  }

  enum CTEMaterialize {
    CTEMATERIALIZE_UNDEFINED = 0,
    CTEMaterializeDefault = 1,
    CTEMaterializeAlways = 2,
    CTEMaterializeNever = 3,
    UNRECOGNIZED = -1,
  }

  enum SetOperation {
    SET_OPERATION_UNDEFINED = 0,
    SETOP_NONE = 1,
    SETOP_UNION = 2,
    SETOP_INTERSECT = 3,
    SETOP_EXCEPT = 4,
    UNRECOGNIZED = -1,
  }

  enum ObjectType {
    OBJECT_TYPE_UNDEFINED = 0,
    OBJECT_ACCESS_METHOD = 1,
    OBJECT_AGGREGATE = 2,
    OBJECT_AMOP = 3,
    OBJECT_AMPROC = 4,
    OBJECT_ATTRIBUTE = 5,
    OBJECT_CAST = 6,
    OBJECT_COLUMN = 7,
    OBJECT_COLLATION = 8,
    OBJECT_CONVERSION = 9,
    OBJECT_DATABASE = 10,
    OBJECT_DEFAULT = 11,
    OBJECT_DEFACL = 12,
    OBJECT_DOMAIN = 13,
    OBJECT_DOMCONSTRAINT = 14,
    OBJECT_EVENT_TRIGGER = 15,
    OBJECT_EXTENSION = 16,
    OBJECT_FDW = 17,
    OBJECT_FOREIGN_SERVER = 18,
    OBJECT_FOREIGN_TABLE = 19,
    OBJECT_FUNCTION = 20,
    OBJECT_INDEX = 21,
    OBJECT_LANGUAGE = 22,
    OBJECT_LARGEOBJECT = 23,
    OBJECT_MATVIEW = 24,
    OBJECT_OPCLASS = 25,
    OBJECT_OPERATOR = 26,
    OBJECT_OPFAMILY = 27,
    OBJECT_PARAMETER_ACL = 28,
    OBJECT_POLICY = 29,
    OBJECT_PROCEDURE = 30,
    OBJECT_PUBLICATION = 31,
    OBJECT_PUBLICATION_NAMESPACE = 32,
    OBJECT_PUBLICATION_REL = 33,
    OBJECT_ROLE = 34,
    OBJECT_ROUTINE = 35,
    OBJECT_RULE = 36,
    OBJECT_SCHEMA = 37,
    OBJECT_SEQUENCE = 38,
    OBJECT_SUBSCRIPTION = 39,
    OBJECT_STATISTIC_EXT = 40,
    OBJECT_TABCONSTRAINT = 41,
    OBJECT_TABLE = 42,
    OBJECT_TABLESPACE = 43,
    OBJECT_TRANSFORM = 44,
    OBJECT_TRIGGER = 45,
    OBJECT_TSCONFIGURATION = 46,
    OBJECT_TSDICTIONARY = 47,
    OBJECT_TSPARSER = 48,
    OBJECT_TSTEMPLATE = 49,
    OBJECT_TYPE = 50,
    OBJECT_USER_MAPPING = 51,
    OBJECT_VIEW = 52,
    UNRECOGNIZED = -1,
  }

  enum DropBehavior {
    DROP_BEHAVIOR_UNDEFINED = 0,
    DROP_RESTRICT = 1,
    DROP_CASCADE = 2,
    UNRECOGNIZED = -1,
  }

  enum AlterTableType {
    ALTER_TABLE_TYPE_UNDEFINED = 0,
    AT_AddColumn = 1,
    AT_AddColumnRecurse = 2,
    AT_AddColumnToView = 3,
    AT_ColumnDefault = 4,
    AT_CookedColumnDefault = 5,
    AT_DropNotNull = 6,
    AT_SetNotNull = 7,
    AT_DropExpression = 8,
    AT_CheckNotNull = 9,
    AT_SetStatistics = 10,
    AT_SetOptions = 11,
    AT_ResetOptions = 12,
    AT_SetStorage = 13,
    AT_SetCompression = 14,
    AT_DropColumn = 15,
    AT_DropColumnRecurse = 16,
    AT_AddIndex = 17,
    AT_ReAddIndex = 18,
    AT_AddConstraint = 19,
    AT_AddConstraintRecurse = 20,
    AT_ReAddConstraint = 21,
    AT_ReAddDomainConstraint = 22,
    AT_AlterConstraint = 23,
    AT_ValidateConstraint = 24,
    AT_ValidateConstraintRecurse = 25,
    AT_AddIndexConstraint = 26,
    AT_DropConstraint = 27,
    AT_DropConstraintRecurse = 28,
    AT_ReAddComment = 29,
    AT_AlterColumnType = 30,
    AT_AlterColumnGenericOptions = 31,
    AT_ChangeOwner = 32,
    AT_ClusterOn = 33,
    AT_DropCluster = 34,
    AT_SetLogged = 35,
    AT_SetUnLogged = 36,
    AT_DropOids = 37,
    AT_SetAccessMethod = 38,
    AT_SetTableSpace = 39,
    AT_SetRelOptions = 40,
    AT_ResetRelOptions = 41,
    AT_ReplaceRelOptions = 42,
    AT_EnableTrig = 43,
    AT_EnableAlwaysTrig = 44,
    AT_EnableReplicaTrig = 45,
    AT_DisableTrig = 46,
    AT_EnableTrigAll = 47,
    AT_DisableTrigAll = 48,
    AT_EnableTrigUser = 49,
    AT_DisableTrigUser = 50,
    AT_EnableRule = 51,
    AT_EnableAlwaysRule = 52,
    AT_EnableReplicaRule = 53,
    AT_DisableRule = 54,
    AT_AddInherit = 55,
    AT_DropInherit = 56,
    AT_AddOf = 57,
    AT_DropOf = 58,
    AT_ReplicaIdentity = 59,
    AT_EnableRowSecurity = 60,
    AT_DisableRowSecurity = 61,
    AT_ForceRowSecurity = 62,
    AT_NoForceRowSecurity = 63,
    AT_GenericOptions = 64,
    AT_AttachPartition = 65,
    AT_DetachPartition = 66,
    AT_DetachPartitionFinalize = 67,
    AT_AddIdentity = 68,
    AT_SetIdentity = 69,
    AT_DropIdentity = 70,
    AT_ReAddStatistics = 71,
    UNRECOGNIZED = -1,
  }

  enum GrantTargetType {
    GRANT_TARGET_TYPE_UNDEFINED = 0,
    ACL_TARGET_OBJECT = 1,
    ACL_TARGET_ALL_IN_SCHEMA = 2,
    ACL_TARGET_DEFAULTS = 3,
    UNRECOGNIZED = -1,
  }

  enum VariableSetKind {
    VARIABLE_SET_KIND_UNDEFINED = 0,
    VAR_SET_VALUE = 1,
    VAR_SET_DEFAULT = 2,
    VAR_SET_CURRENT = 3,
    VAR_SET_MULTI = 4,
    VAR_RESET = 5,
    VAR_RESET_ALL = 6,
    UNRECOGNIZED = -1,
  }

  enum ConstrType {
    CONSTR_TYPE_UNDEFINED = 0,
    CONSTR_NULL = 1,
    CONSTR_NOTNULL = 2,
    CONSTR_DEFAULT = 3,
    CONSTR_IDENTITY = 4,
    CONSTR_GENERATED = 5,
    CONSTR_CHECK = 6,
    CONSTR_PRIMARY = 7,
    CONSTR_UNIQUE = 8,
    CONSTR_EXCLUSION = 9,
    CONSTR_FOREIGN = 10,
    CONSTR_ATTR_DEFERRABLE = 11,
    CONSTR_ATTR_NOT_DEFERRABLE = 12,
    CONSTR_ATTR_DEFERRED = 13,
    CONSTR_ATTR_IMMEDIATE = 14,
    UNRECOGNIZED = -1,
  }

  enum ImportForeignSchemaType {
    IMPORT_FOREIGN_SCHEMA_TYPE_UNDEFINED = 0,
    FDW_IMPORT_SCHEMA_ALL = 1,
    FDW_IMPORT_SCHEMA_LIMIT_TO = 2,
    FDW_IMPORT_SCHEMA_EXCEPT = 3,
    UNRECOGNIZED = -1,
  }

  enum RoleStmtType {
    ROLE_STMT_TYPE_UNDEFINED = 0,
    ROLESTMT_ROLE = 1,
    ROLESTMT_USER = 2,
    ROLESTMT_GROUP = 3,
    UNRECOGNIZED = -1,
  }

  enum FetchDirection {
    FETCH_DIRECTION_UNDEFINED = 0,
    FETCH_FORWARD = 1,
    FETCH_BACKWARD = 2,
    FETCH_ABSOLUTE = 3,
    FETCH_RELATIVE = 4,
    UNRECOGNIZED = -1,
  }

  enum FunctionParameterMode {
    FUNCTION_PARAMETER_MODE_UNDEFINED = 0,
    FUNC_PARAM_IN = 1,
    FUNC_PARAM_OUT = 2,
    FUNC_PARAM_INOUT = 3,
    FUNC_PARAM_VARIADIC = 4,
    FUNC_PARAM_TABLE = 5,
    FUNC_PARAM_DEFAULT = 6,
    UNRECOGNIZED = -1,
  }

  enum TransactionStmtKind {
    TRANSACTION_STMT_KIND_UNDEFINED = 0,
    TRANS_STMT_BEGIN = 1,
    TRANS_STMT_START = 2,
    TRANS_STMT_COMMIT = 3,
    TRANS_STMT_ROLLBACK = 4,
    TRANS_STMT_SAVEPOINT = 5,
    TRANS_STMT_RELEASE = 6,
    TRANS_STMT_ROLLBACK_TO = 7,
    TRANS_STMT_PREPARE = 8,
    TRANS_STMT_COMMIT_PREPARED = 9,
    TRANS_STMT_ROLLBACK_PREPARED = 10,
    UNRECOGNIZED = -1,
  }

  enum ViewCheckOption {
    VIEW_CHECK_OPTION_UNDEFINED = 0,
    NO_CHECK_OPTION = 1,
    LOCAL_CHECK_OPTION = 2,
    CASCADED_CHECK_OPTION = 3,
    UNRECOGNIZED = -1,
  }

  enum DiscardMode {
    DISCARD_MODE_UNDEFINED = 0,
    DISCARD_ALL = 1,
    DISCARD_PLANS = 2,
    DISCARD_SEQUENCES = 3,
    DISCARD_TEMP = 4,
    UNRECOGNIZED = -1,
  }

  enum ReindexObjectType {
    REINDEX_OBJECT_TYPE_UNDEFINED = 0,
    REINDEX_OBJECT_INDEX = 1,
    REINDEX_OBJECT_TABLE = 2,
    REINDEX_OBJECT_SCHEMA = 3,
    REINDEX_OBJECT_SYSTEM = 4,
    REINDEX_OBJECT_DATABASE = 5,
    UNRECOGNIZED = -1,
  }

  enum AlterTSConfigType {
    ALTER_TSCONFIG_TYPE_UNDEFINED = 0,
    ALTER_TSCONFIG_ADD_MAPPING = 1,
    ALTER_TSCONFIG_ALTER_MAPPING_FOR_TOKEN = 2,
    ALTER_TSCONFIG_REPLACE_DICT = 3,
    ALTER_TSCONFIG_REPLACE_DICT_FOR_TOKEN = 4,
    ALTER_TSCONFIG_DROP_MAPPING = 5,
    UNRECOGNIZED = -1,
  }

  enum PublicationObjSpecType {
    PUBLICATION_OBJ_SPEC_TYPE_UNDEFINED = 0,
    PUBLICATIONOBJ_TABLE = 1,
    PUBLICATIONOBJ_TABLES_IN_SCHEMA = 2,
    PUBLICATIONOBJ_TABLES_IN_CUR_SCHEMA = 3,
    PUBLICATIONOBJ_CONTINUATION = 4,
    UNRECOGNIZED = -1,
  }

  enum AlterPublicationAction {
    ALTER_PUBLICATION_ACTION_UNDEFINED = 0,
    AP_AddObjects = 1,
    AP_DropObjects = 2,
    AP_SetObjects = 3,
    UNRECOGNIZED = -1,
  }

  enum AlterSubscriptionType {
    ALTER_SUBSCRIPTION_TYPE_UNDEFINED = 0,
    ALTER_SUBSCRIPTION_OPTIONS = 1,
    ALTER_SUBSCRIPTION_CONNECTION = 2,
    ALTER_SUBSCRIPTION_SET_PUBLICATION = 3,
    ALTER_SUBSCRIPTION_ADD_PUBLICATION = 4,
    ALTER_SUBSCRIPTION_DROP_PUBLICATION = 5,
    ALTER_SUBSCRIPTION_REFRESH = 6,
    ALTER_SUBSCRIPTION_ENABLED = 7,
    ALTER_SUBSCRIPTION_SKIP = 8,
    UNRECOGNIZED = -1,
  }

  enum OnCommitAction {
    ON_COMMIT_ACTION_UNDEFINED = 0,
    ONCOMMIT_NOOP = 1,
    ONCOMMIT_PRESERVE_ROWS = 2,
    ONCOMMIT_DELETE_ROWS = 3,
    ONCOMMIT_DROP = 4,
    UNRECOGNIZED = -1,
  }

  enum ParamKind {
    PARAM_KIND_UNDEFINED = 0,
    PARAM_EXTERN = 1,
    PARAM_EXEC = 2,
    PARAM_SUBLINK = 3,
    PARAM_MULTIEXPR = 4,
    UNRECOGNIZED = -1,
  }

  enum CoercionContext {
    COERCION_CONTEXT_UNDEFINED = 0,
    COERCION_IMPLICIT = 1,
    COERCION_ASSIGNMENT = 2,
    COERCION_PLPGSQL = 3,
    COERCION_EXPLICIT = 4,
    UNRECOGNIZED = -1,
  }

  enum CoercionForm {
    COERCION_FORM_UNDEFINED = 0,
    COERCE_EXPLICIT_CALL = 1,
    COERCE_EXPLICIT_CAST = 2,
    COERCE_IMPLICIT_CAST = 3,
    COERCE_SQL_SYNTAX = 4,
    UNRECOGNIZED = -1,
  }

  export enum BoolExprType {
    BOOL_EXPR_TYPE_UNDEFINED = "BOOL_EXPR_TYPE_UNDEFINED",
    AND_EXPR = "AND_EXPR",
    OR_EXPR = "OR_EXPR",
    NOT_EXPR = "NOT_EXPR",
    UNRECOGNIZED = "UNRECOGNIZED",
  }

  export enum SubLinkType {
    SUB_LINK_TYPE_UNDEFINED = "SUB_LINK_TYPE_UNDEFINED",
    EXISTS_SUBLINK = "EXISTS_SUBLINK",
    ALL_SUBLINK = "ALL_SUBLINK",
    ANY_SUBLINK = "ANY_SUBLINK",
    ROWCOMPARE_SUBLINK = "ROWCOMPARE_SUBLINK",
    EXPR_SUBLINK = "EXPR_SUBLINK",
    MULTIEXPR_SUBLINK = "MULTIEXPR_SUBLINK",
    ARRAY_SUBLINK = "ARRAY_SUBLINK",
    CTE_SUBLINK = "CTE_SUBLINK",
    UNRECOGNIZED = "UNRECOGNIZED",
  }

  enum RowCompareType {
    ROW_COMPARE_TYPE_UNDEFINED = 0,
    ROWCOMPARE_LT = 1,
    ROWCOMPARE_LE = 2,
    ROWCOMPARE_EQ = 3,
    ROWCOMPARE_GE = 4,
    ROWCOMPARE_GT = 5,
    ROWCOMPARE_NE = 6,
    UNRECOGNIZED = -1,
  }

  enum MinMaxOp {
    MIN_MAX_OP_UNDEFINED = 0,
    IS_GREATEST = 1,
    IS_LEAST = 2,
    UNRECOGNIZED = -1,
  }

  enum SQLValueFunctionOp {
    SQLVALUE_FUNCTION_OP_UNDEFINED = 0,
    SVFOP_CURRENT_DATE = 1,
    SVFOP_CURRENT_TIME = 2,
    SVFOP_CURRENT_TIME_N = 3,
    SVFOP_CURRENT_TIMESTAMP = 4,
    SVFOP_CURRENT_TIMESTAMP_N = 5,
    SVFOP_LOCALTIME = 6,
    SVFOP_LOCALTIME_N = 7,
    SVFOP_LOCALTIMESTAMP = 8,
    SVFOP_LOCALTIMESTAMP_N = 9,
    SVFOP_CURRENT_ROLE = 10,
    SVFOP_CURRENT_USER = 11,
    SVFOP_USER = 12,
    SVFOP_SESSION_USER = 13,
    SVFOP_CURRENT_CATALOG = 14,
    SVFOP_CURRENT_SCHEMA = 15,
    UNRECOGNIZED = -1,
  }

  enum XmlExprOp {
    XML_EXPR_OP_UNDEFINED = 0,
    IS_XMLCONCAT = 1,
    IS_XMLELEMENT = 2,
    IS_XMLFOREST = 3,
    IS_XMLPARSE = 4,
    IS_XMLPI = 5,
    IS_XMLROOT = 6,
    IS_XMLSERIALIZE = 7,
    IS_DOCUMENT = 8,
    UNRECOGNIZED = -1,
  }

  enum XmlOptionType {
    XML_OPTION_TYPE_UNDEFINED = 0,
    XMLOPTION_DOCUMENT = 1,
    XMLOPTION_CONTENT = 2,
    UNRECOGNIZED = -1,
  }

  export enum NullTestType {
    NULL_TEST_TYPE_UNDEFINED = "NULL_TEST_TYPE_UNDEFINED",
    IS_NULL = "IS_NULL",
    IS_NOT_NULL = "IS_NOT_NULL",
    UNRECOGNIZED = "UNRECOGNIZED",
  }

  enum BoolTestType {
    BOOL_TEST_TYPE_UNDEFINED = 0,
    IS_TRUE = 1,
    IS_NOT_TRUE = 2,
    IS_FALSE = 3,
    IS_NOT_FALSE = 4,
    IS_UNKNOWN = 5,
    IS_NOT_UNKNOWN = 6,
    UNRECOGNIZED = -1,
  }

  enum CmdType {
    CMD_TYPE_UNDEFINED = 0,
    CMD_UNKNOWN = 1,
    CMD_SELECT = 2,
    CMD_UPDATE = 3,
    CMD_INSERT = 4,
    CMD_DELETE = 5,
    CMD_MERGE = 6,
    CMD_UTILITY = 7,
    CMD_NOTHING = 8,
    UNRECOGNIZED = -1,
  }

  export enum JoinType {
    JOIN_TYPE_UNDEFINED = "JOIN_TYPE_UNDEFINED",
    JOIN_INNER = "JOIN_INNER",
    JOIN_LEFT = "JOIN_LEFT",
    JOIN_FULL = "JOIN_FULL",
    JOIN_RIGHT = "JOIN_RIGHT",
    JOIN_SEMI = "JOIN_SEMI",
    JOIN_ANTI = "JOIN_ANTI",
    JOIN_UNIQUE_OUTER = "JOIN_UNIQUE_OUTER",
    JOIN_UNIQUE_INNER = "JOIN_UNIQUE_INNER",
    UNRECOGNIZED = "UNRECOGNIZED",
  }

  enum AggSplit {
    AGG_SPLIT_UNDEFINED = 0,
    AGGSPLIT_SIMPLE = 1,
    AGGSPLIT_INITIAL_SERIAL = 2,
    AGGSPLIT_FINAL_DESERIAL = 3,
    UNRECOGNIZED = -1,
  }

  enum OnConflictAction {
    ON_CONFLICT_ACTION_UNDEFINED = 0,
    ONCONFLICT_NONE = 1,
    ONCONFLICT_NOTHING = 2,
    ONCONFLICT_UPDATE = 3,
    UNRECOGNIZED = -1,
  }

  enum LimitOption {
    LIMIT_OPTION_UNDEFINED = 0,
    LIMIT_OPTION_DEFAULT = 1,
    LIMIT_OPTION_COUNT = 2,
    LIMIT_OPTION_WITH_TIES = 3,
    UNRECOGNIZED = -1,
  }

  enum LockClauseStrength {
    LOCK_CLAUSE_STRENGTH_UNDEFINED = 0,
    LCS_NONE = 1,
    LCS_FORKEYSHARE = 2,
    LCS_FORSHARE = 3,
    LCS_FORNOKEYUPDATE = 4,
    LCS_FORUPDATE = 5,
    UNRECOGNIZED = -1,
  }

  enum LockWaitPolicy {
    LOCK_WAIT_POLICY_UNDEFINED = 0,
    LockWaitBlock = 1,
    LockWaitSkip = 2,
    LockWaitError = 3,
    UNRECOGNIZED = -1,
  }

  enum KeywordKind {
    NO_KEYWORD = 0,
    UNRESERVED_KEYWORD = 1,
    COL_NAME_KEYWORD = 2,
    TYPE_FUNC_NAME_KEYWORD = 3,
    RESERVED_KEYWORD = 4,
    UNRECOGNIZED = -1,
  }

  type Token = unknown;
}
