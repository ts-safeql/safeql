import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

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
