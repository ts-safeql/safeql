import assert from "assert";
import { describe, test } from "vitest";
import { toCamelCase, toPascalCase, toScreamingSnakeCase, toSnakeCase } from "./case";

describe("case", () => {
  test("toCamelCase", () => {
    assert.equal(toCamelCase("foo"), "foo");
    assert.equal(toCamelCase("foo-bar"), "fooBar");
    assert.equal(toCamelCase("foo_bar"), "fooBar");
    assert.equal(toCamelCase("foo-bar_baz"), "fooBarBaz");
    assert.equal(toCamelCase("foo_bar-baz"), "fooBarBaz");
    assert.equal(toCamelCase("foo-bar_baz-qux"), "fooBarBazQux");
    assert.equal(toCamelCase("foo_bar-baz_qux"), "fooBarBazQux");
  });

  test("toPascalCase", () => {
    assert.equal(toPascalCase("foo"), "Foo");
    assert.equal(toPascalCase("foo-bar"), "FooBar");
    assert.equal(toPascalCase("foo_bar"), "FooBar");
    assert.equal(toPascalCase("foo-bar_baz"), "FooBarBaz");
    assert.equal(toPascalCase("foo_bar-baz"), "FooBarBaz");
    assert.equal(toPascalCase("foo-bar_baz-qux"), "FooBarBazQux");
    assert.equal(toPascalCase("foo_bar-baz_qux"), "FooBarBazQux");
  });

  test("toSnakeCase", () => {
    assert.equal(toSnakeCase("Foo"), "foo");
    assert.equal(toSnakeCase("FooBar"), "foo_bar");
    assert.equal(toSnakeCase("foo"), "foo");
    assert.equal(toSnakeCase("fooBar"), "foo_bar");
    assert.equal(toSnakeCase("fooBarBaz"), "foo_bar_baz");
    assert.equal(toSnakeCase("fooBarBazQux"), "foo_bar_baz_qux");
  });

  test("toScreamingSnakeCase", () => {
    assert.equal(toScreamingSnakeCase("foo"), "FOO");
    assert.equal(toScreamingSnakeCase("fooBar"), "FOO_BAR");
    assert.equal(toScreamingSnakeCase("fooBarBaz"), "FOO_BAR_BAZ");
    assert.equal(toScreamingSnakeCase("fooBarBazQux"), "FOO_BAR_BAZ_QUX");
  });
});
