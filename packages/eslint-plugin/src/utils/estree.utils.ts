import { TSESTree } from "@typescript-eslint/utils";

export function getSourceLocationFromStringPosition(params: {
  loc: TSESTree.SourceLocation;
  position: number;
  value: string;
}): TSESTree.SourceLocation {
  const valueUntilError = params.value.substring(0, params.position);
  const errorInLine = valueUntilError.match(/\n/g)?.length ?? 0;
  const errorFromColumn = valueUntilError.split(/\n/g)[errorInLine].length - 1;
  const errorToColumn =
    errorFromColumn +
    (() => {
      const rest = params.value.split(/\n/g)[errorInLine].substring(errorFromColumn);
      const amountOfSpacesLeft = rest.match(/\s/g)?.length ?? 0;

      if (amountOfSpacesLeft > 0) {
        return rest.indexOf(" ");
      }

      return rest.length;
    })();

  if (errorInLine === 0) {
    return params.loc;
  }

  return {
    start: {
      line: params.loc.start.line + errorInLine,
      column: errorFromColumn,
    },
    end: {
      line: params.loc.start.line + errorInLine,
      column: errorToColumn,
    },
  };
}

