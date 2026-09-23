import 'server-only';
import {createDatabase} from './postgres';
let connection: ReturnType<typeof createDatabase> | undefined;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('Database unavailable');
  connection ??= createDatabase(process.env.DATABASE_URL);
  return connection.database;
}
export function runtime() { return process.env; }
