import {readFile,writeFile} from 'node:fs/promises';import {database} from '../packages/db/connection';
Object.assign(process.env,JSON.parse(await readFile('.data/staging/environment.json','utf8')));const db=await database(),checks:Record<string,boolean>={};
try{
 const result=await db.transaction(tx=>Promise.all([1,2,3].map(n=>tx.query('SELECT $1::integer n,pg_sleep(0.01)',[n]))));checks.concurrentQueriesSerialized=result.map(r=>r.rows[0].n).join(',')==='1,2,3';
 try{await db.transaction(tx=>Promise.all([tx.query('SELECT 1/0'),tx.query('SELECT pg_sleep(0.01)'),tx.query('SELECT 3')]));checks.failedBatchRollsBack=false;}catch{checks.failedBatchRollsBack=true;}
 checks.poolUsableAfterRollback=(await db.query('SELECT 1 n')).rows[0].n===1;
 checks.utc=(await db.query('SHOW timezone')).rows[0].TimeZone==='UTC';
 await writeFile('qa/staging/native-driver.json',JSON.stringify({at:new Date().toISOString(),checks,allPassed:Object.values(checks).every(Boolean)},null,2));console.log(JSON.stringify(checks));if(Object.values(checks).some(v=>!v))process.exitCode=1;
}finally{await db.close();}

