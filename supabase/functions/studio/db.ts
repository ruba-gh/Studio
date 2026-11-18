import postgres from "npm:postgres@3.4.7";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
type Input = string | number | null;
type Row = Record<string, unknown>;
type Result = { results: Row[]; meta: { changes: number } };
type Connection = ReturnType<typeof postgres> | postgres.TransactionSql;

// The application defines every SQL statement. Only its values go through bind().
class Query {
  constructor(readonly text: string, readonly values: Input[] = []) {}

  bind(...values: Input[]) {
    return new Query(this.text, values);
  }

  async execute(connection: Connection): Promise<Result> {
    let position = 0;
    const command = this.text.replace(/\?/g, () => "$" + ++position);
    const rows = await connection.unsafe(command, this.values);
    return { results: rows, meta: { changes: rows.count } };
  }

  async first<T>(field?: string): Promise<T | null> {
    const [{ results }] = await db.batch([this], false);
    const row = results[0];
    return (field ? row?.[field] : row) as T ?? null;
  }

  async run() {
    return (await db.batch([this]))[0];
  }
}

export const db = {
  prepare(text: string) {
    return new Query(text);
  },

  async batch(queries: Query[], lock = true) {
    return await sql.begin(async (transaction) => {
      await transaction`set local search_path to studio_private, pg_catalog`;
      if (lock) await transaction`select pg_advisory_xact_lock(391527410)`;
      const results: Result[] = [];
      for (const query of queries) results.push(await query.execute(transaction));
      return results;
    });
  },
};
