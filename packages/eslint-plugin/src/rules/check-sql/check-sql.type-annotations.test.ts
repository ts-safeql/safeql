import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

const indexedSchema = `interface Database {
  member: { id: number; first_name: string; middle_name: string | null };
}`;
const indexedQuery = "SELECT id, first_name, middle_name FROM member";

ruleTester.run("indexed-access annotations", checkSqlRule, {
  valid: [
    {
      name: "a row selected directly from an interface",
      options: withConnection(connections.withTag),
      code: `${indexedSchema}\nsql<Database['member']>\`${indexedQuery}\`;`,
    },
    {
      name: "named and generic aliases of the same indexed row",
      options: withConnection(connections.withTag),
      code: `${indexedSchema}
        type Member = Database['member'];
        type Row<Table extends keyof Database> = Database[Table];
        sql<Member>\`${indexedQuery}\`;
        sql<Row<'member'>>\`${indexedQuery}\`;
      `,
    },
    {
      name: "indexed column types preserve scalar types and nullability",
      options: withConnection(connections.withTag),
      code: `${indexedSchema}
        sql<{ id: Database['member']['id']; name: Database['member']['middle_name'] }>\`
          SELECT id, middle_name AS name FROM member
        \`;
      `,
    },
    {
      name: "an indexed row nested in an array annotation",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", transform: "{type}[]" }],
      }),
      code: `${indexedSchema}\nsql<Database['member'][]>\`${indexedQuery}\`;`,
    },
    {
      name: "an indexed row imported from schema definitions",
      options: withConnection(connections.withTag),
      code: `import type { Database } from './indexed-schema';
        sql<Database['member']>\`${indexedQuery}\`;
      `,
    },
  ],
  invalid: [
    {
      name: "an imported indexed row must still match the projection",
      options: withConnection(connections.withTag),
      code: `import type { Database } from './indexed-schema';
        sql<Database['member']>\`SELECT id FROM member\`;
      `,
      output: `import type { Database } from './indexed-schema';
        sql<{ id: number }>\`SELECT id FROM member\`;
      `,
      errors: [{ messageId: "incorrectTypeAnnotations" }],
    },
    {
      name: "incorrect indexed column type is still rejected and repaired",
      options: withConnection(connections.withTag),
      code: `interface Database { member: { id: string } }
        sql<Database['member']>\`SELECT id FROM member\`;
      `,
      output: `interface Database { member: { id: string } }
        sql<{ id: number }>\`SELECT id FROM member\`;
      `,
      errors: [{ messageId: "incorrectTypeAnnotations" }],
    },
    {
      name: "missing null in an indexed column type is still rejected",
      options: withConnection(connections.withTag),
      code: `interface Database { member: { middle_name: string } }
        sql<Database['member']>\`SELECT middle_name FROM member\`;
      `,
      output: `interface Database { member: { middle_name: string } }
        sql<{ middle_name: string | null }>\`SELECT middle_name FROM member\`;
      `,
      errors: [{ messageId: "incorrectTypeAnnotations" }],
    },
    {
      name: "indexed rows must still match the selected projection",
      options: withConnection(connections.withTag),
      code: `${indexedSchema}\nsql<Database['member']>\`SELECT id FROM member\`;`,
      output: `${indexedSchema}\nsql<{ id: number }>\`SELECT id FROM member\`;`,
      errors: [{ messageId: "incorrectTypeAnnotations" }],
    },
  ],
});

ruleTester.run("local classes", checkSqlRule, {
  valid: [
    {
      name: "using class with constructor assignments",
      options: withConnection(connections.withTag),
      code: `
          class Member {
            id: number;
            first_name: string;
            last_name: string;
            created_at: Date;

            constructor(
              id: number,
              first_name: string,
              last_name: string,
              created_at: Date,
            ) {
              this.id = id;
              this.first_name = first_name;
              this.last_name = last_name;
              this.created_at = created_at;
            }
          }
          
          sql<Member>\`SELECT id, first_name, last_name, created_at FROM member\`;
        `,
    },
    {
      name: "using class with parameter properties",
      options: withConnection(connections.withTag),
      code: `
          class Member {
            constructor(
              private id: number,
              private first_name: string,
              private last_name: string,
              private created_at: Date,
            ) {}
          }
          
          sql<Member>\`SELECT id, first_name, last_name, created_at FROM member\`;
        `,
    },
    {
      name: "using class with definite assignment fields",
      options: withConnection(connections.withTag),
      code: `
          class Member {
            id!: number;
            first_name!: string;
            last_name!: string;
            created_at!: Date;
          }
          
          sql<Member>\`SELECT id, first_name, last_name, created_at FROM member\`;
        `,
    },
    {
      name: "using class with inheritance",
      options: withConnection(connections.withTag),
      code: `
          class Entity {
            id!: number;
            created_at!: Date;
          }
            
          class Member extends Entity {
            first_name!: string;
            last_name!: string;
          }
          
          sql<Member>\`SELECT id, first_name, last_name, created_at FROM member\`;
        `,
    },
  ],
  invalid: [
    {
      name: "local class with incorrect properties",
      options: withConnection(connections.withTag),
      code: `
          class Entity {
            id!: number;
            created_at!: Date;
          }
            
          class Member extends Entity {
            first_name!: string;
            last_name!: string;
          }
          
          sql<Member>\`SELECT id, first_name, last_name FROM member\`;
        `,
      output: `
          class Entity {
            id!: number;
            created_at!: Date;
          }
            
          class Member extends Entity {
            first_name!: string;
            last_name!: string;
          }
          
          sql<{ id: number; first_name: string; last_name: string }>\`SELECT id, first_name, last_name FROM member\`;
        `,
      errors: [
        {
          messageId: "incorrectTypeAnnotations",
          data: {
            expected: "{ first_name: string; last_name: string; id: number; created_at: Date }",
            actual: "{ id: number; first_name: string; last_name: string }",
          },
        },
      ],
    },
  ],
});

ruleTester.run("namespace import", checkSqlRule, {
  valid: [
    {
      name: "select statement with type imported from inline namespace",
      options: withConnection(connections.base),
      code: `
          namespace Member {
            export interface Name {
              firstName: string;
              lastName: string;
            }
          }

          function run() {
            const result = conn.query<Member.Name>(sql\`
              select first_name as "firstName", last_name as "lastName" from member
            \`);
          }
        `,
    },
  ],
  invalid: [
    {
      name: "incorrect type annotation with namespace type",
      options: withConnection(connections.base),
      code: `
          namespace Member {
            export interface Name {
              firstName: string;
              lastName: string;
            }
          }

          function run() {
            const result = conn.query<Member.Name>(sql\`
              select first_name, last_name from member
            \`);
          }
        `,
      output: `
          namespace Member {
            export interface Name {
              firstName: string;
              lastName: string;
            }
          }

          function run() {
            const result = conn.query<{ first_name: string; last_name: string }>(sql\`
              select first_name, last_name from member
            \`);
          }
        `,
      errors: [{ messageId: "incorrectTypeAnnotations" }],
    },
  ],
});
