/** Small prepared-query interface shared by services and the Postgres adapter. */
export type QueryResult = {results: Record<string, any>[]; meta: {changes: number}};
export interface Statement {
  bind(...values: any[]): Statement;
  first(): Promise<any | null>;
  all(): Promise<QueryResult>;
  run(): Promise<QueryResult>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<QueryResult[]>;
}
