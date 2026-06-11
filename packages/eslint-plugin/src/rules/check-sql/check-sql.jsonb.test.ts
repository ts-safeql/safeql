import { checkSqlRule, ruleTester, setupCheckSqlRuleTester } from "./check-sql.test-utils";

const { connections, withConnection } = setupCheckSqlRuleTester();

ruleTester.run("json(b)", checkSqlRule, {
  valid: [
    {
      name: "json/b: select jsonb_build_object(const, const)",
      options: withConnection(connections.withTag),
      code: `sql<{ jsonb_build_object: { key: 'value' } }>\`SELECT jsonb_build_object('key', 'value')\``,
    },
    {
      name: "json/b: select jsonb_build_object(deeply nested)",
      options: withConnection(connections.withTag),
      code: `sql<{ jsonb_build_object: { deeply: { nested: 'object' } } }>\`SELECT jsonb_build_object('deeply', jsonb_build_object('nested', 'object'))\``,
    },
    {
      name: "json/b: select jsonb_build_object(key with space, const)",
      options: withConnection(connections.withTag),
      code: `sql<{ jsonb_build_object: { 'hello world': 'value' } }>\`SELECT jsonb_build_object('hello world', 'value')\``,
    },
    {
      name: "json/b: select jsonb_build_object(const, columnref)",
      options: withConnection(connections.withTag),
      code: `sql<{ json_build_object: { id: number } }>\`SELECT json_build_object('id', team.id) FROM team\``,
    },
    {
      name: "json/b: select jsonb_build_object(const, [int,int,int])",
      options: withConnection(connections.withTag),
      code: `sql<{ a: { ids: number[] } }>\`SELECT json_build_object('ids', array[1,2,3]) a\``,
    },
    {
      name: "json/b: select json/b_agg with override",
      options: withConnection({
        ...connections.withTag,
        overrides: { types: { jsonb: "JsonB", json: "Json" } },
      }),
      code: `
          type Json = { id: number; name: string; type: string; }
          type JsonB = { id: number; name: string; type: string; }

          type Row = {
            jsonbcol: JsonB[] | null;
            jsonbcoalesced: JsonB[];
            jsoncol: JsonB[] | null
          };

          await sql<Row>\`
            SELECT
              jsonb_agg(test_jsonb.jsonb_col) AS jsonbcol,
              coalesce(jsonb_agg(test_jsonb.jsonb_col), '[]'::jsonb) AS jsonbcoalesced,
              json_agg(test_jsonb.jsonb_col) AS jsoncol
            FROM
              (SELECT * FROM test_jsonb) as test_jsonb
            WHERE
              false
          \`;
        `,
    },
    {
      name: "json/b: select jsonb_agg(jsonb_build_object) with coalesce",
      options: withConnection(connections.withTag),
      code: `
          type Team = {
            id: number;
            name: string;
          };
        
          type Row = {
            teams: Team[];
          }
        
          const rows = await sql<Row>\`
            SELECT 
              coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'id', team.id,
                    'name', team.name
                  )
                ),
                '[]'::jsonb
              ) AS teams
            FROM member
              JOIN member_team ON member.id = member_team.member_id
              JOIN team ON member_team.team_id = team.id
            GROUP BY
              member.id
          \`;
        `,
    },
    {
      name: "json/b: jsonb column (any) should be compatible with a Record<string, T> annotation",
      options: withConnection(connections.withTag),
      code: `
          type Metadata = { id: number };
          const rows = await sql<{ jsonb_col: Record<string, Metadata> }>\`SELECT jsonb_col FROM test_jsonb\`;
        `,
    },
    {
      name: "json/b: any nested inside a union member should be compatible with a concrete annotation",
      options: withConnection(connections.withTag),
      code: `
          type Metadata = { id: number };
          const rows = await sql<{ agg: { data: Record<string, Metadata> }[] | null }>\`
            SELECT jsonb_agg(jsonb_build_object('data', jsonb_col)) AS agg FROM test_jsonb
          \`;
        `,
    },
    {
      name: "json/b: fieldTransform camel should apply to jsonb_build_object keys",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", fieldTransform: "camel" }],
      }),
      code: `sql<{ candidateLocations: { isSelected: boolean }[] | null }>\`
          SELECT
            jsonb_agg(
              jsonb_build_object(
                'is_selected', TRUE
              )
            ) AS candidate_locations
        \``,
    },
    {
      name: "json/b: fieldTransform camel should apply to nested jsonb_build_object keys",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", fieldTransform: "camel" }],
      }),
      code: `sql<{ metadata: { outerKey: { innerKey: 'value' } } }>\`
          SELECT
            jsonb_build_object(
              'outer_key',
              jsonb_build_object('inner_key', 'value')
            ) AS metadata
        \``,
    },
  ],
  invalid: [
    {
      name: "json/b: invalid select jsonb_build_object(const, const)",
      options: withConnection(connections.withTag),
      code: "sql`SELECT jsonb_build_object('key', 'value')`",
      output: `sql<{ jsonb_build_object: { key: 'value' } }>\`SELECT jsonb_build_object('key', 'value')\``,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "json/b: jsonb key with spaces should be wrapped in quotes",
      options: withConnection(connections.withTag),
      code: "sql`SELECT jsonb_build_object('A b C', 'value') as col`",
      output: `sql<{ col: { 'A b C': 'value' } }>\`SELECT jsonb_build_object('A b C', 'value') as col\``,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "json/b: invalid select jsonb_build_object(deeply nested)",
      options: withConnection(connections.withTag),
      code: "sql`SELECT jsonb_build_object('deeply', jsonb_build_object('nested', 'object'))`",
      output: `sql<{ jsonb_build_object: { deeply: { nested: 'object' } } }>\`SELECT jsonb_build_object('deeply', jsonb_build_object('nested', 'object'))\``,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "json/b: invalid select jsonb_build_object(const, columnref)",
      options: withConnection(connections.withTag),
      code: "sql`SELECT json_build_object('id', team.id) FROM team`",
      output: `sql<{ json_build_object: { id: number } }>\`SELECT json_build_object('id', team.id) FROM team\``,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "json/b: invalid select jsonb_agg(tbl)",
      options: withConnection(connections.withTag),
      code: "sql`SELECT jsonb_agg(team) FROM team`",
      output: `sql<{ jsonb_agg: { id: number; name: string }[] | null }>\`SELECT jsonb_agg(team) FROM team\``,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "json/b: invalid select json_agg(tbl) as colname",
      options: withConnection(connections.withTag),
      code: "sql`SELECT json_agg(team) as colname FROM team`",
      output: `sql<{ colname: { id: number; name: string }[] | null }>\`SELECT json_agg(team) as colname FROM team\``,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "json/b: invalid select jsonb_agg(alias) from tbl alias",
      options: withConnection(connections.withTag),
      code: "sql`SELECT jsonb_agg(a) FROM team a`",
      output: `sql<{ jsonb_agg: { id: number; name: string }[] | null }>\`SELECT jsonb_agg(a) FROM team a\``,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "json/b: invalid select jsonb_agg(aliasname.col)",
      options: withConnection(connections.withTag),
      code: "sql`SELECT jsonb_agg(a.id) FROM team a`",
      output: `sql<{ jsonb_agg: number[] | null }>\`SELECT jsonb_agg(a.id) FROM team a\``,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "json/b: invalid select jsonb_agg(jsonb_build_object(const, const))",
      options: withConnection(connections.withTag),
      code: "sql`SELECT jsonb_agg(jsonb_build_object('key', 'value'))`",
      output: `sql<{ jsonb_agg: { key: 'value' }[] | null }>\`SELECT jsonb_agg(jsonb_build_object('key', 'value'))\``,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "json/b: invalid select jsonb_agg(jsonb_build_object(const, columnref))",
      options: withConnection(connections.withTag),
      code: "sql`SELECT jsonb_agg(json_build_object('id', team.id)) FROM team`",
      output: `sql<{ jsonb_agg: { id: number }[] | null }>\`SELECT jsonb_agg(json_build_object('id', team.id)) FROM team\``,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "json/b: invalid select jsonb_agg(jsonb_build_object(const, columnref::text))",
      options: withConnection(connections.withTag),
      code: "sql`SELECT jsonb_agg(json_build_object('id', team.id::text)) FROM team`",
      output: `sql<{ jsonb_agg: { id: string }[] | null }>\`SELECT jsonb_agg(json_build_object('id', team.id::text)) FROM team\``,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "json/b: invalid select jsonb_agg(jsonb_build_object(const, columnref::text::int))",
      options: withConnection(connections.withTag),
      code: "sql`SELECT jsonb_agg(json_build_object('id', team.id::text::int)) FROM team`",
      output: `sql<{ jsonb_agg: { id: number }[] | null }>\`SELECT jsonb_agg(json_build_object('id', team.id::text::int)) FROM team\``,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "json/b: invalid select jsonb_agg all use cases",
      options: withConnection(connections.withTag),
      code: `
          sql\`
            SELECT
              team.id,
              jsonb_agg(c) as jsonb_tbl,
              jsonb_agg(c.*) as jsonb_tbl_star,
              jsonb_agg(c.id) as jsonb_tbl_col,
              jsonb_agg(json_build_object('firstName', c.first_name)) as jsonb_object
            FROM team
              JOIN member_team ON team.id = member_team.team_id
              JOIN member c ON c.id = member_team.member_id
            GROUP BY team.id
          \`
        `,
      output: `
          sql<{ id: number; jsonb_tbl: { id: number; first_name: string; middle_name: string | null; last_name: string; role: 'owner' | 'admin' | 'editor' | 'contributor' | 'viewer' | 'guest'; created_at: Date }[] | null; jsonb_tbl_star: { id: number; first_name: string; middle_name: string | null; last_name: string; role: 'owner' | 'admin' | 'editor' | 'contributor' | 'viewer' | 'guest'; created_at: Date }[] | null; jsonb_tbl_col: number[] | null; jsonb_object: { firstName: string }[] | null }>\`
            SELECT
              team.id,
              jsonb_agg(c) as jsonb_tbl,
              jsonb_agg(c.*) as jsonb_tbl_star,
              jsonb_agg(c.id) as jsonb_tbl_col,
              jsonb_agg(json_build_object('firstName', c.first_name)) as jsonb_object
            FROM team
              JOIN member_team ON team.id = member_team.team_id
              JOIN member c ON c.id = member_team.member_id
            GROUP BY team.id
          \`
        `,
      errors: [{ messageId: "missingTypeAnnotations" }],
    },
    {
      name: "json/b: fieldTransform camel should enforce transformation on jsonb keys",
      options: withConnection(connections.withTag, {
        targets: [{ tag: "sql", fieldTransform: "camel" }],
      }),
      code: `sql<{ candidateLocations: { is_selected: boolean }[] | null }>\`
          SELECT
            jsonb_agg(
              jsonb_build_object(
                'is_selected', TRUE
              )
            ) AS candidate_locations
        \``,
      output: `sql<{ candidateLocations: { isSelected: boolean }[] | null }>\`
          SELECT
            jsonb_agg(
              jsonb_build_object(
                'is_selected', TRUE
              )
            ) AS candidate_locations
        \``,
      errors: [{ messageId: "incorrectTypeAnnotations" }],
    },
  ],
});
