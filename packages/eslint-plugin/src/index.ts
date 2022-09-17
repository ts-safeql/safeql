import "source-map-support/register";
import rules from "./rules";
import { defineConfig } from "./rules/check-sql.rule";

export = { rules, defineConfig };
