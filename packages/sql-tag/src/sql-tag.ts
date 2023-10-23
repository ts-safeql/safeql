export function sql(template: TemplateStringsArray, ...values: unknown[]) {
  return new SqlTag<unknown>(template, values);
}

export function createTypedSqlTag<$Value>(options?: Partial<SqlTagOptions<$Value>>) {
  return (template: TemplateStringsArray, ...values: $Value[]) => {
    return new SqlTag(template, values, options);
  };
}

interface SqlTagOptions<$Value> {
  transform: (value: $Value) => unknown;
}

class SqlTag<$Value> {
  constructor(
    private template: TemplateStringsArray,
    private rawValues: $Value[],
    private options?: Partial<SqlTagOptions<$Value>>,
  ) {}

  get values() {
    return this.options?.transform !== undefined
      ? this.rawValues.map(this.options.transform)
      : this.rawValues;
  }

  // used by node-pg
  get text() {
    return this.template.reduce(
      (acc, part, i) => acc + part + (i === this.values.length ? "" : `$${++i}`),
      "",
    );
  }

  // used by sequelize
  get query() {
    return this.text;
  }
}
