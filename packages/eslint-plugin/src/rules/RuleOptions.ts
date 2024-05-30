import { defaultTypeMapping, objectKeysNonEmpty } from "@ts-safeql/shared";
import z from "zod";

const zStringOrRegex = z.union([z.string(), z.object({ regex: z.string() })]);
const zBaseTarget = z.object({
  /**
   * Transform the end result of the type.
   *
   * For example:
   *  - `"{type}[]"` will transform the type to an array
   *  - `["colname", "x_colname"]` will replace `colname` with `x_colname` in the type.
   *  - `["{type}[]", ["colname", x_colname"]]` will do both
   */
  transform: z
    .union([z.string(), z.array(z.union([z.string(), z.tuple([z.string(), z.string()])]))])
    .optional(),

  /**
   * Transform the (column) field key. Can be one of the following:
   * - `"snake"` - `userId` → `user_id`
   * - `"camel"` - `user_id` → `userId`
   * - `"pascal"` - `user_id` → `UserId`
   * - `"screaming snake"` - `user_id` → `USER_ID`
   */
  fieldTransform: z.enum(["snake", "pascal", "camel", "screaming snake"]).optional(),

  /**
   * Whether or not to skip type annotation.
   */
  skipTypeAnnotations: z.boolean().optional(),
});
/**
 * A target that acts as a wrapper for the query. For example:
 *
 * ```ts
 * const query = conn.query(sql`SELECT * FROM users`);
 *               ^^^^^^^^^^ wrapper
 * ```
 */
const zWrapperTarget = z
  .object({ wrapper: zStringOrRegex, maxDepth: z.number().optional() })
  .merge(zBaseTarget);
export type WrapperTarget = z.infer<typeof zWrapperTarget>;
/**
 * A target that is a tag expression. For example:
 *
 * ```ts
 * const query = sql`SELECT * FROM users`;
 *               ^^^ tag
 * ```
 */
const zTagTarget = z.object({ tag: zStringOrRegex }).merge(zBaseTarget);
export type TagTarget = z.infer<typeof zTagTarget>;

export type ConnectionTarget = WrapperTarget | TagTarget;
const zOverrideTypeResolver = z.union([
  z.string(),
  z.object({ parameter: zStringOrRegex, return: z.string() }),
]);
const zBaseSchema = z.object({
  targets: z.union([zWrapperTarget, zTagTarget]).array(),

  /**
   * Whether or not keep the connection alive. Change it only if you know what you're doing.
   */
  keepAlive: z.boolean().optional(),

  /**
   * Override defaults
   */
  overrides: z
    .object({
      types: z.union([
        z.record(z.enum(objectKeysNonEmpty(defaultTypeMapping)), zOverrideTypeResolver),
        z.record(z.string(), zOverrideTypeResolver),
      ]),
      columns: z.record(z.string(), z.string()),
    })
    .partial()
    .optional(),

  /**
   * Use `undefined` instead of `null` when the value is nullable.
   */
  nullAsUndefined: z.boolean().optional(),

  /**
   * Mark the property as optional when the value is nullable.
   */
  nullAsOptional: z.boolean().optional(),
});

export const zConnectionMigration = z.object({
  /**
   * The path where the migration files are located.
   */
  migrationsDir: z.string(),

  /**
   * THIS IS NOT THE PRODUCTION DATABASE.
   *
   * A connection url to the database.
   * This is required since in order to run the migrations, a connection to postgres is required.
   * Will be used only to create and drop the shadow database (see `databaseName`).
   */
  connectionUrl: z.string().optional(),

  /**
   * The name of the shadow database that will be created from the migration files.
   */
  databaseName: z.string().optional(),

  /**
   * Whether or not should refresh the shadow database when the migration files change.
   */
  watchMode: z.boolean().optional(),
});
const zConnectionUrl = z.object({
  /**
   * The connection url to the database
   */
  databaseUrl: z.string(),
});
const zRuleOptionConnection = z.union([
  zBaseSchema.merge(zConnectionMigration),
  zBaseSchema.merge(zConnectionUrl),
]);
export type RuleOptionConnection = z.infer<typeof zRuleOptionConnection>;

export const zConfig = z.object({
  connections: z.union([z.array(zRuleOptionConnection), zRuleOptionConnection]),
});

export type Config = z.infer<typeof zConfig>;

export const UserConfigFile = z.object({
  useConfigFile: z.boolean(),
});
export type UserConfigFile = z.infer<typeof UserConfigFile>;

export const Options = z.union([zConfig, UserConfigFile]);
export type Options = z.infer<typeof Options>;

export const RuleOptions = z.array(Options).min(1).max(1);
export type RuleOptions = z.infer<typeof RuleOptions>;
