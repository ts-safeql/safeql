const keywords = [
  "WITH",
  "SELECT",
  "FROM",
  "WHERE",
  "GROUP BY",
  "HAVING",
  "WINDOW",
  "ORDER BY",
  "PARTITION BY",
  "LIMIT",
  "OFFSET",
  "INSERT INTO",
  "VALUES",
  "UPDATE",
  "SET",
  "RETURNING",
  "ON",
  "JOIN",
  "INNER JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "FULL JOIN",
  "FULL OUTER JOIN",
  "CROSS JOIN",
  "WHEN",
  "USING",
  "UNION",
  "UNION ALL",
  "INTERSECT",
  "EXCEPT",
] as const;

const keywordSet = new Set(keywords);
type Keyword = (typeof keywords)[number];
type Context = (Keyword | Context)[];

export function isLastQueryContextOneOf(queryText: string, keywords: Keyword[]): boolean {
  const contextKeywords = getLastQueryContext(queryText);
  const lastKeyword = contextKeywords[contextKeywords.length - 1];

  return keywords.some((keyword) => keyword === lastKeyword);
}

export function getLastQueryContext(queryText: string): Keyword[] {
  const context = getQueryContext(queryText);

  const iterate = (ctx: Context): Keyword[] => {
    const last = ctx[ctx.length - 1];

    if (Array.isArray(last)) {
      return iterate(last);
    }

    return ctx as Keyword[];
  };

  return iterate(context);
}

export function getQueryContext(queryText: string): Context {
  const tokens = removePgComments(queryText)
    .split(/(\s+|\(|\))/)
    .filter((token) => token.trim() !== "");
  let index = 0;

  function parseQuery(): Context {
    const context: Context = [];

    while (index < tokens.length) {
      const token = tokens[index++].toUpperCase();

      if (token === ")") {
        return context;
      }

      if (token === "(") {
        const subquery = parseQuery();
        if (subquery.length > 0) {
          context.push(subquery);
        }
        continue;
      }

      const previousToken = tokens[index - 2]?.toUpperCase();
      const nextToken = tokens[index]?.toUpperCase();

      if (isOneOf(["ORDER", "GROUP", "PARTITION"], token) && nextToken === "BY") {
        index++;
        context.push(`${token} BY`);
        continue;
      }

      if (token === "JOIN") {
        switch (previousToken) {
          case "INNER":
          case "LEFT":
          case "RIGHT":
          case "FULL":
          case "CROSS":
            context.push(`${previousToken} JOIN` as Keyword);
            break;
          case "OUTER":
            context.push("FULL OUTER JOIN");
            break;
        }
        continue;
      }

      if (keywordSet.has(token as Keyword)) {
        context.push(token as Keyword);
        continue;
      }
    }

    return context;
  }

  return parseQuery();
}

function removePgComments(query: string) {
  return query.replace(/--.*(\r?\n|$)|\/\*[\s\S]*?\*\//g, "").trim();
}

function isOneOf<const T extends string>(values: T[], value: string): value is T {
  return values.includes(value as T);
}
