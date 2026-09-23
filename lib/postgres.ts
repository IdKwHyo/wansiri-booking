import postgres from 'postgres';
import type {Database, Statement, QueryResult} from './database';

// Parameter markers are translated, never values. Quoted SQL text is left intact.
export function parameterize(text: string) {
  let index = 0;
  return text.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g,
    token => token === '?' ? '$' + (++index) : token);
}

export function createDatabase(url: string) {
  const sql = postgres(url, {
    prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10,
    ssl: ['localhost','127.0.0.1'].includes(new URL(url).hostname) ? false : {rejectUnauthorized:true},
    types: {bigint: {to: 20, from: [20], serialize: String, parse: Number}},
  });
  class Prepared implements Statement {
    constructor(readonly text: string, readonly values: any[] = []) {}
    bind(...values: any[]) { return new Prepared(this.text, values); }
    async first(): Promise<any | null> { return (await this.all()).results[0] ?? null; }
    async all(): Promise<QueryResult> { return (await database.batch([this]))[0]; }
    run(): Promise<QueryResult> { return this.all(); }
  }
  const database: Database = {
    prepare: text => new Prepared(text),
    async batch(statements) {
      if (statements.some(s => !(s instanceof Prepared))) throw new Error('Invalid statement');
      const queries = statements as Prepared[];
      return sql.begin(async tx => {
        await tx.unsafe("SET LOCAL search_path TO clinic, pg_catalog");
        await tx.unsafe("SET LOCAL statement_timeout = '10s'");
        // D1 serialized writes; Postgres needs an explicit transaction lock to
        // make capacity checks + mutations atomic across all server instances.
        // One clinic-wide lock also serializes settings changes against bookings.
        if (queries.some(s => !/^\s*SELECT\b/i.test(s.text))) {
          await tx.unsafe('SELECT pg_advisory_xact_lock(504821)');
        }
        const results: QueryResult[] = [];
        for (const query of queries) {
          const rows = await tx.unsafe(parameterize(query.text), query.values);
          results.push({results: Array.from(rows), meta: {changes: rows.count}});
        }
        return results;
      }) as Promise<QueryResult[]>;
    },
  };
  return {database, close: () => sql.end({timeout: 5})};
}
