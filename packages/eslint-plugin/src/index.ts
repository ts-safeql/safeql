import "source-map-support/register";
import rules from "./rules";
import { defineConfig } from "./rules/check-sql.config";

export = { rules, defineConfig };
