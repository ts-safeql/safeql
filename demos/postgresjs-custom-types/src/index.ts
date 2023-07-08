import { LocalDate, LocalDateTime } from "@js-joda/core";
import postgres from "postgres";

const sql = postgres({
  types: {
    LocalDate: {
      from: [1082], // timestamp
      to: 1082,
      parse: (value: string) => LocalDate.parse(value),
      serialize: (value: LocalDate) => value.toString(),
    },
    LocalDateTime: {
      from: [1114], // timestamptz
      to: 1114,
      parse: (value: string) => LocalDateTime.parse(value),
      serialize: (value: LocalDateTime) => value.toString(),
    },
  },
});

async function check() {
  const value = await sql<{ x: LocalDate | null; }[]>`SELECT ${LocalDate.now()} as x`;

  await sql.end();

  console.log(value);
}

check();
