import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {appEnvironment} from '../core/environment';
export type Row = Record<string, any>;
export interface Queryable { query<T extends Row = Row>(text: string, values?: any[]): Promise<{ rows: T[] }>; }
export interface Database extends Queryable { transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>; close(): Promise<void>; }
export function postgresConnectionOptions(raw:string):pg.PoolConfig {
  const target=new URL(raw);
  const local=process.env.STAGING_LOCAL_SIMULATION==='true'&&appEnvironment()==='staging'&&['localhost','127.0.0.1'].includes(target.hostname);
  // pg connection-string options override the explicit SSL/options objects.
  // Never allow URL parameters to disable certificate checking or UTC/timeouts.
  const applicationName=target.searchParams.get('application_name');target.search='';
  if(applicationName)target.searchParams.set('application_name',applicationName);
  const schema=process.env.DATABASE_SCHEMA;
  if(schema&&!/^[a-z][a-z0-9_]{0,62}$/.test(schema))throw new Error('DATABASE_SCHEMA must be a simple lowercase PostgreSQL identifier');
  // A shared Supabase project must never fall back to Splice's public tables.
  const schemaOptions=schema?` -c search_path=${schema},pg_catalog`:'';
  return {connectionString:target.href,ssl:local?false:{rejectUnauthorized:true,...(process.env.DATABASE_CA_CERT?{ca:process.env.DATABASE_CA_CERT}:{})},max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,options:'-c timezone=UTC -c statement_timeout=30000'+schemaOptions};
}
export async function database(memory = false): Promise<Database> {
  if (process.env.DATABASE_URL && !memory) {
    const pool = new pg.Pool(postgresConnectionOptions(process.env.DATABASE_URL));
    // Idle connection loss must not become an unhandled EventEmitter exception.
    pool.on('error',()=>{console.error(JSON.stringify({timestamp:new Date().toISOString(),environment:appEnvironment(),service:'database-pool',event:'connection_lost'}));});
    return { query: (s, v) => pool.query(s, v), close: () => pool.end(), transaction: async fn => {
      const c = await pool.connect();
      let queued:Promise<unknown>=Promise.resolve();
      try {
        await c.query('BEGIN');
        const tx:Queryable={query:(text,values)=>{const pending=queued.then(()=>c.query(text,values));queued=pending.then(()=>undefined,()=>undefined);return pending;}};
        const result = await fn(tx);await queued;await c.query('COMMIT');return result;
      }
      catch(e) { await queued;await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    } };
  }
  if(!memory&&appEnvironment()!=='local')throw new Error('Hosted persistence requires PostgreSQL; PGlite is local/test only');
  const db = await PGlite.create(memory ? 'memory://' : path.join(process.cwd(), '.data', 'postgres'));
  return { query: (s,v) => db.query(s,v), transaction: fn => db.transaction(fn), close: () => db.close() };
}
export async function migrate(db: Database) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
  await db.query('ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY');
  await db.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS sha256 text');
  for (const name of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    const sql = await readFile(path.join('supabase/migrations',name),'utf8');
    const digest=createHash('sha256').update(sql.replaceAll('\r\n','\n')).digest('hex');
    await db.transaction(async tx => {
      await tx.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
      const existing=await one(tx,'SELECT sha256 FROM schema_migrations WHERE name=$1',[name]);
      if(existing){if(existing.sha256&&existing.sha256!==digest)throw new Error(`Applied migration changed: ${name}`);if(!existing.sha256)await tx.query('UPDATE schema_migrations SET sha256=$1 WHERE name=$2',[digest,name]);return;}
      const raw=tx as Queryable & {exec?:(s:string)=>Promise<unknown>}; if(raw.exec) await raw.exec(sql); else await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations(name,sha256) VALUES($1,$2)',[name,digest]);
    });
  }
}
export async function one<T extends Row = Row>(db: Queryable, sql: string, values: any[] = []): Promise<T | undefined> { return (await db.query<T>(sql, values)).rows[0]; }
