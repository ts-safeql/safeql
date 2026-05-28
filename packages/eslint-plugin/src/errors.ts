import type { TSESTree } from "@typescript-eslint/utils";

export class InvalidQueryError extends Error {
  _tag = "InvalidQueryError" as const;

  node: TSESTree.Expression;

  constructor(error: string, node: TSESTree.Expression) {
    super(error);
    this.node = node;
  }

  static of(error: string, node: TSESTree.Expression) {
    return new InvalidQueryError(error, node);
  }

  toJSON() {
    return {
      _tag: this._tag,
      message: this.message,
      node: this.node,
    };
  }
}
