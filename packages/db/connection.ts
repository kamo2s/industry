import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
export type Row = Record<string, any>;
export interface Queryable { query<T extends Row = Row>(text: string, values?: any[]): Promise<{ rows: T[] }>; }
export interface Database extends Queryable { transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>; close(): Promise<void>; }
export async function database(memory = false): Promise<Database> {
  if (process.env.DATABASE_URL && !memory) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true }, max: 5 });
    return { query: (s, v) => pool.query(s, v), close: () => pool.end(), transaction: async fn => {
      const c = await pool.connect();
      try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
      catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    } };
  }
  const db = await PGlite.create(memory ? 'memory://' : path.join(process.cwd(), '.data', 'postgres'));
  return { query: (s,v) => db.query(s,v), transaction: fn => db.transaction(fn), close: () => db.close() };
}
export async function migrate(db: Database) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
  for (const name of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    if ((await db.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name])).rows.length) continue;
    const sql = await readFile(path.join('supabase/migrations',name),'utf8');
    await db.transaction(async tx => { const raw=tx as Queryable & {exec?:(s:string)=>Promise<unknown>}; if(raw.exec) await raw.exec(sql); else await tx.query(sql); await tx.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]); });
  }
}
export async function one<T extends Row = Row>(db: Queryable, sql: string, values: any[] = []): Promise<T | undefined> { return (await db.query<T>(sql, values)).rows[0]; }
