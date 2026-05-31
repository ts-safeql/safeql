import { typeColumnTsTypeEntries } from "@ts-safeql/test-utils";
import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("pg type to ts type check (inline type)", checkSqlRule, {
  valid: typeColumnTsTypeEntries.map(([colName, colType]) => ({
    name: `select ${colName} from table as ${colType} (inline type)`,
    options: withConnection(connections.withTag),
    code: `sql<{ ${colName}: ${colType} }>\`select ${colName} from all_types\``,
  })),
  invalid: [],
});

ruleTester.run("pg type to ts type check (type reference)", checkSqlRule, {
  valid: typeColumnTsTypeEntries.map(([colName, colType]) => ({
    name: `select ${colName} from table as ${colType} (using type reference)`,
    options: withConnection(connections.withTag),
    code: `
          type MyType = { ${colName}: ${colType} };
          sql<MyType>\`select ${colName} from all_types\`
        `,
  })),
  invalid: [],
});
