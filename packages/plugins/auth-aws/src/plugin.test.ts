import { describe, it, expect } from "vitest";
import plugin from "./plugin";

const BASE_CONFIG = {
  databaseHost: "my-db.cluster-abc.us-east-1.rds.amazonaws.com",
  databaseUser: "admin",
  databaseName: "mydb",
  awsRegion: "us-east-1",
};

describe("auth-aws plugin", () => {
  it("cache key includes all config fields", () => {
    // ARRANGE
    const instance = plugin.factory({
      ...BASE_CONFIG,
      databasePort: 5433,
      awsProfile: "staging",
    });

    // ASSERT
    const key = instance.createConnection?.cacheKey;
    expect(key).toContain("my-db.cluster-abc.us-east-1.rds.amazonaws.com");
    expect(key).toContain("5433");
    expect(key).toContain("admin");
    expect(key).toContain("mydb");
    expect(key).toContain("us-east-1");
    expect(key).toContain("staging");
  });
});
