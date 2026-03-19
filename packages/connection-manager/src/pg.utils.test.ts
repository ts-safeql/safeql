import { describe, it, expect } from "vitest";
import { mapConnectionOptionsToString, parseConnection } from "./pg.utils";

describe("pg.utils", () => {
  describe("mapConnectionOptionsToString", () => {
    it("builds a postgres URL from connection options", () => {
      // ARRANGE
      const options = {
        host: "localhost",
        port: 5432,
        user: "admin",
        password: "secret",
        database: "mydb",
      };

      // ACT
      const result = mapConnectionOptionsToString(options);

      // ASSERT
      expect(result).toBe("postgres://admin:secret@localhost:5432/mydb");
    });

    it("encodes special characters in password", () => {
      // ARRANGE
      const options = {
        host: "localhost",
        port: 5432,
        user: "admin",
        password: "p@ss:word/with#special?chars",
        database: "mydb",
      };

      // ACT
      const result = mapConnectionOptionsToString(options);

      // ASSERT
      expect(result).toBe(
        "postgres://admin:p%40ss%3Aword%2Fwith%23special%3Fchars@localhost:5432/mydb",
      );
    });

    it("encodes special characters in username", () => {
      // ARRANGE
      const options = {
        host: "localhost",
        port: 5432,
        user: "user@domain",
        password: "secret",
        database: "mydb",
      };

      // ACT
      const result = mapConnectionOptionsToString(options);

      // ASSERT
      expect(result).toBe("postgres://user%40domain:secret@localhost:5432/mydb");
    });
  });

  describe("parseConnection", () => {
    it("parses a postgres URL into connection options", () => {
      // ARRANGE
      const url = "postgres://admin:secret@localhost:5432/mydb";

      // ACT
      const result = parseConnection(url);

      // ASSERT
      expect(result).toEqual({
        host: "localhost",
        port: 5432,
        user: "admin",
        password: "secret",
        database: "mydb",
      });
    });

    it("parses URL with encoded special characters", () => {
      // ARRANGE
      const url = "postgres://admin:p%40ss%3Aword%2Fwith%23special%3Fchars@localhost:5432/mydb";

      // ACT
      const result = parseConnection(url);

      // ASSERT
      expect(result).toEqual({
        host: "localhost",
        port: 5432,
        user: "admin",
        password: "p@ss:word/with#special?chars",
        database: "mydb",
      });
    });
  });
});
