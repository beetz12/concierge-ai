import { randomUUID } from "node:crypto";

/**
 * Test-only in-memory fake of the Supabase query-builder subset used by the
 * case service (see CasesDbClient in ./types.ts). Backs the case-service and
 * cases-route unit tests so they run without a database.
 */

type Row = Record<string, unknown>;

interface Filter {
  column: string;
  value: unknown;
}

class FakeQuery {
  private action: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private values: Row | null = null;
  private ordering: { column: string; ascending: boolean } | null = null;

  constructor(
    private readonly db: FakeCasesDb,
    private readonly table: string,
  ) {}

  insert(values: Row) {
    this.action = "insert";
    this.values = values;
    return this;
  }

  update(values: Row) {
    this.action = "update";
    this.values = values;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  select(columns?: string) {
    // The fake always returns whole rows; the column list is irrelevant.
    void columns;
    // For insert/update/delete chains, .select() requests rows back;
    // execution already returns the affected rows, so this is a no-op.
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.ordering = { column, ascending: options?.ascending !== false };
    return this;
  }

  single() {
    return this.execute().then(({ data, error }) => ({
      data: (data?.[0] ?? null) as Row | null,
      error:
        error ??
        (data && data.length === 1
          ? null
          : { message: "JSON object requested, multiple (or no) rows returned" }),
    }));
  }

  maybeSingle() {
    return this.execute().then(({ data, error }) => ({
      data: (data?.[0] ?? null) as Row | null,
      error,
    }));
  }

  then<TResult1, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: Row[] | null;
          error: { message: string } | null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{
    data: Row[] | null;
    error: { message: string } | null;
  }> {
    if (this.db.nextError) {
      const error = this.db.nextError;
      this.db.nextError = null;
      return { data: null, error };
    }

    const rows = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
    const matches = (row: Row) =>
      this.filters.every((f) => row[f.column] === f.value);
    // A real client returns rows deserialized from HTTP responses, never
    // live references into a store; clone so tests catch aliasing bugs.
    const clone = (row: Row): Row => structuredClone(row);

    if (this.action === "insert") {
      const now = new Date().toISOString();
      const row: Row = {
        id: randomUUID(),
        created_at: now,
        ...(this.table === "cases" ? { updated_at: now } : {}),
        ...structuredClone(this.values),
      };
      rows.push(row);
      return { data: [clone(row)], error: null };
    }

    if (this.action === "update") {
      const updated: Row[] = [];
      for (const row of rows) {
        if (!matches(row)) continue;
        Object.assign(row, structuredClone(this.values));
        if (this.table === "cases") row.updated_at = new Date().toISOString();
        updated.push(clone(row));
      }
      return { data: updated, error: null };
    }

    if (this.action === "delete") {
      const removed = rows.filter(matches).map(clone);
      this.db.tables[this.table] = rows.filter((row) => !matches(row));
      return { data: removed, error: null };
    }

    let selected = rows.filter(matches);
    if (this.ordering) {
      const { column, ascending } = this.ordering;
      selected = [...selected].sort((a, b) => {
        const av = String(a[column] ?? "");
        const bv = String(b[column] ?? "");
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return { data: selected.map(clone), error: null };
  }
}

export class FakeCasesDb {
  tables: Record<string, Row[]> = { cases: [], case_events: [] };
  /** When set, the next executed query fails with this error once. */
  nextError: { message: string } | null = null;

  from(table: string) {
    return new FakeQuery(this, table);
  }
}
