import 'dotenv/config';
import { mkdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { database,migrate } from '../packages/db/connection';
// Run only with the local supervisor stopped. Never open PGlite concurrently.
const db=await database();
try{
 const tables=(await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name<>'schema_migrations' ORDER BY table_name")).rows;
 const snapshot:any[]=[];
 const fingerprint=(rows:unknown[])=>createHash('sha256').update(JSON.stringify(rows.map(r=>JSON.stringify(r)).sort())).digest('hex');
 for(const {table_name:name} of tables){const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[name])).rows.map(r=>r.column_name);const sql=`SELECT ${columns.map(c=>'"'+c.replaceAll('"','""')+'"').join(',')} FROM "${name}"`;const rows=(await db.query(sql)).rows;snapshot.push({name,sql,count:rows.length,hash:fingerprint(rows)});}
 await migrate(db);
 const report=[];for(const before of snapshot){const rows=(await db.query(before.sql)).rows;report.push({table:before.name,before:before.count,after:rows.length,unchanged:before.hash===fingerprint(rows)});}
 const invalid=(await db.query("SELECT a.id FROM ledger_accounts a LEFT JOIN ledger_postings p ON p.account_id=a.id GROUP BY a.id HAVING a.balance<>COALESCE(sum(CASE p.direction WHEN 'credit' THEN p.amount ELSE -p.amount END),0)")).rows;
 await mkdir('qa/business-model',{recursive:true});await writeFile('qa/business-model/migration.json',JSON.stringify({at:new Date().toISOString(),tables:report,invalidBalances:invalid.length},null,2));
 if(report.some(r=>!r.unchanged)||invalid.length)throw new Error('Migration preservation check failed; inspect qa/business-model/migration.json');
 console.log(JSON.stringify({preservedTables:report.length,preservedRows:report.reduce((s,r)=>s+r.before,0),invalidBalances:invalid.length}));
}finally{await db.close();}
