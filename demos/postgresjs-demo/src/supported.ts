import postgres, { type Sql } from "postgres";
import { example, section } from "./demo";

const sql: Sql<any> = postgres();

type Mood = "sad" | "ok" | "happy";

type PersonRow = {
  id: number;
  name: string;
  mood: Mood;
};

type StarshipRow = {
  id: number;
  name: string;
  captain_id: number | null;
};

section("Supported postgres.js queries", () => {
  example("plain tagged query", () => {
    void sql<{ id: number; name: string }[]>`SELECT id, name FROM person`;
  });

  example("parameter values", () => {
    void sql<PersonRow[]>`SELECT * FROM person WHERE id > ${0}`;
  });
});

section("Supported postgres.js query modifiers", () => {
  example("query modifier", () => {
    void sql<{ id: number }[]>`SELECT id FROM person`.values();
  });

  example("raw query modifier", () => {
    void sql<{ id: number }[]>`SELECT id FROM person`.raw();
  });

  example("describe query modifier", () => {
    void sql<{ id: number }[]>`SELECT id FROM person`.describe();
  });

  example("execute query modifier", () => {
    void sql<{ id: number }[]>`SELECT id FROM person`.execute();
  });

  example("cursor query modifier", () => {
    void sql<{ id: number }[]>`SELECT id FROM person`.cursor();
  });

  example("forEach query modifier", () => {
    void sql<{ id: number }[]>`SELECT id FROM person`.forEach(() => {});
  });
});

section("Supported postgres.js helpers", () => {
  example("identifier helpers", () => {
    void sql<{ id: number }[]>`SELECT ${sql("id")} FROM ${sql("person")}`;
  });

  example("multiple identifier helpers", () => {
    void sql<{ name: string; mood: Mood }[]>`SELECT ${sql("name", "mood")} FROM person`;
  });

  example("column list helper", () => {
    const columns = ["name", "mood"];
    void sql<{ name: string; mood: Mood }[]>`
      SELECT ${sql(columns)}
      FROM person
    `;
  });

  example("object helper in insert", () => {
    const newPerson = { name: "Murray", mood: "happy" as const };
    void sql<{ id: number }[]>`
      INSERT INTO person ${sql(newPerson)}
      RETURNING id
    `;
  });

  example("object helper with explicit columns", () => {
    const newPerson = { name: "Walter", mood: "ok" as const, ignored: true };
    void sql<{ id: number }[]>`
      INSERT INTO person ${sql(newPerson, "name", "mood")}
      RETURNING id
    `;
  });

  example("object helper with explicit column array", () => {
    const columns = ["name", "mood"] as const;
    const newPerson = { name: "Walter", mood: "ok" as const, ignored: true };
    void sql<{ id: number }[]>`
      INSERT INTO person ${sql(newPerson, columns)}
      RETURNING id
    `;
  });

  example("object helper in update", () => {
    const person = { id: 1, name: "Murray", mood: "ok" as const };
    void sql<{ id: number }[]>`
      UPDATE person
      SET ${sql(person, "name", "mood")}
      WHERE id = ${person.id}
      RETURNING id
    `;
  });

  example("object helper in update with explicit column array", () => {
    const columns = ["name", "mood"] as const;
    const person = { id: 1, name: "Murray", mood: "ok" as const };
    void sql<{ id: number }[]>`
      UPDATE person
      SET ${sql(person, columns)}
      WHERE id = ${person.id}
      RETURNING id
    `;
  });

  example("multi-row insert helper", () => {
    const people = [
      { name: "Murray", mood: "happy" as const },
      { name: "Walter", mood: "sad" as const },
    ];

    void sql<{ id: number }[]>`
      INSERT INTO person ${sql(people)}
      RETURNING id
    `;
  });

  example("multi-row insert helper with explicit columns", () => {
    const people = [
      { name: "Murray", mood: "happy" as const, ignored: true },
      { name: "Walter", mood: "sad" as const, ignored: false },
    ];

    void sql<{ id: number }[]>`
      INSERT INTO person ${sql(people, "name", "mood")}
      RETURNING id
    `;
  });

  example("array helper in where in", () => {
    void sql<{ id: number }[]>`
      SELECT id
      FROM person
      WHERE id IN ${sql([1, 2, 3])}
    `;
  });

  example("array helper in values clause", () => {
    void sql<{ a: string | null; b: string | null; c: string | null }[]>`
      SELECT x.a::text AS a, x.b::text AS b, x.c::text AS c
      FROM (VALUES ${sql(["a", "b", "c"])}) AS x(a, b, c)
    `;
  });

  example("matrix values helper", () => {
    const rows = [
      [1, "Murray"],
      [2, "Walter"],
    ];

    void sql<{ id: number | null; name: string | null }[]>`
      SELECT data.id::int AS id, data.name::text AS name
      FROM (VALUES ${sql(rows)}) AS data(id, name)
    `;
  });
});

section("Supported postgres.js fragments", () => {
  example("fragment variable", () => {
    const where = sql`WHERE id = ${1}`;

    void sql<PersonRow[]>`
      SELECT *
      FROM person
      ${where}
    `;
  });

  example("inline fragment", () => {
    void sql<PersonRow[]>`
      SELECT *
      FROM person
      ${sql`WHERE id = ${1}`}
    `;
  });

  example("ordering fragment", () => {
    void sql<PersonRow[]>`
      SELECT *
      FROM person
      ORDER BY ${sql`id DESC`}
    `;
  });
});

section("Supported postgres.js typed and unsafe helpers", () => {
  example("typed helper", () => {
    void sql<{ typed: string | null }[]>`
      SELECT ${sql.typed([13, 37, 42, 80], 1337)}::text AS typed
    `;
  });

  example("named typed helper", () => {
    const typedSql = postgres({
      types: {
        rect: {
          to: 1337,
          from: [1337],
          serialize: (rectangle: { x: number; y: number; width: number; height: number }) => [
            rectangle.x,
            rectangle.y,
            rectangle.width,
            rectangle.height,
          ],
          parse: ([x, y, width, height]: [number, number, number, number]) => ({
            x,
            y,
            width,
            height,
          }),
        },
      },
    });

    void typedSql<{ rect: string | null }[]>`
      SELECT ${typedSql.typed.rect({ x: 13, y: 37, width: 42, height: 80 })}::text AS rect
    `;
  });

  example("unsafe helper", () => {
    void sql<PersonRow[]>`
      SELECT *
      FROM ${sql.unsafe("person")}
      WHERE id = ${1}
    `;
  });
});

section("Supported postgres.js copy queries", () => {
  example("copy writable", () => {
    void sql`COPY person (name, mood) FROM STDIN`.writable();
  });

  example("copy readable", () => {
    void sql`COPY person (name, mood) TO STDOUT`.readable();
  });
});
