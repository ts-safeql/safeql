import {
  CamelCasePlugin,
  DeduplicateJoinsPlugin,
  DummyDriver,
  HandleEmptyInListsPlugin,
  Kysely,
  ParseJSONResultsPlugin,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  WithSchemaPlugin,
  sql,
} from "kysely";
import { ast } from "@ts-safeql/plugin-utils";

const builderPluginClasses: ReadonlyMap<string, abstract new (...args: never[]) => unknown> =
  new Map<string, abstract new (...args: never[]) => unknown>([
    ["CamelCasePlugin", CamelCasePlugin],
    ["ParseJSONResultsPlugin", ParseJSONResultsPlugin],
    ["DeduplicateJoinsPlugin", DeduplicateJoinsPlugin],
    ["WithSchemaPlugin", WithSchemaPlugin],
    ["HandleEmptyInListsPlugin", HandleEmptyInListsPlugin],
  ]);

const sqlHelperNames: ReadonlySet<string> = new Set(Object.keys(sql));

const forbiddenMemberNames = new Set([
  "constructor",
  "prototype",
  "__proto__",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "call",
  "apply",
  "bind",
  "toString",
  "toLocaleString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
]);

const codeEvaluatingConstructors: ReadonlySet<unknown> = new Set([
  Function,
  Object.getPrototypeOf(async () => {}).constructor,
  Object.getPrototypeOf(function* () {}).constructor,
  Object.getPrototypeOf(async function* () {}).constructor,
]);

const intrinsicPrototypes: ReadonlySet<object> = new Set([
  Object.prototype,
  Function.prototype,
  Array.prototype,
  Promise.prototype,
]);

export function createCompilerDatabase(): unknown {
  return new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [],
  });
}

export function readMember(receiver: unknown, name: string): unknown {
  if (!isInheritedBuilderMember(receiver, name)) {
    return ast.UNRESOLVED;
  }

  return guarded(() => Reflect.get(receiver, name));
}

export function callMethod(receiver: unknown, name: string, args: unknown[]): unknown {
  if (!isInheritedBuilderMember(receiver, name)) {
    return ast.UNRESOLVED;
  }

  return guarded(() => {
    const method: unknown = Reflect.get(receiver, name);
    return isCallable(method) ? Reflect.apply(method, receiver, args) : ast.UNRESOLVED;
  });
}

export function callSqlTag(strings: string[], values: unknown[]): unknown {
  const template = Object.assign([...strings], { raw: [...strings] });
  return guarded(() => sql(template, ...values));
}

export function callSqlHelper(name: string, args: unknown[]): unknown {
  if (!sqlHelperNames.has(name)) {
    return ast.UNRESOLVED;
  }

  return guarded(() => {
    const helper: unknown = Reflect.get(sql, name);
    return isCallable(helper) ? Reflect.apply(helper, sql, args) : ast.UNRESOLVED;
  });
}

export function constructPlugin(name: string, args: unknown[]): unknown {
  const PluginClass = builderPluginClasses.get(name);
  if (PluginClass === undefined) {
    return ast.UNRESOLVED;
  }

  return guarded(() => Reflect.construct(PluginClass, args));
}

export function getCompiledSql(compiled: unknown): string | undefined {
  return isObject(compiled) && "sql" in compiled && typeof compiled.sql === "string"
    ? compiled.sql
    : undefined;
}

function guarded(run: () => unknown): unknown {
  try {
    const value = run();
    return isObject(value) ? value : ast.UNRESOLVED;
  } catch {
    return ast.UNRESOLVED;
  }
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function" && !codeEvaluatingConstructors.has(value);
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isInheritedBuilderMember(receiver: unknown, name: string): receiver is object {
  if (!isObject(receiver) || forbiddenMemberNames.has(name) || Object.hasOwn(receiver, name)) {
    return false;
  }

  const owner = findPrototypeDeclaring(receiver, name);
  return owner !== undefined && !intrinsicPrototypes.has(owner);
}

function findPrototypeDeclaring(receiver: object, name: string): object | undefined {
  let prototype: object | null = Object.getPrototypeOf(receiver);
  while (prototype !== null) {
    if (Object.hasOwn(prototype, name)) {
      return prototype;
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  return undefined;
}
