import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { database,migrate } from '../packages/db/connection';
import { seed } from '../packages/db/seed';
if(process.env.APP_MODE!=='demo') throw new Error('Set APP_MODE=demo explicitly. Stop the running database before seeding.');
try {Object.assign(process.env,JSON.parse(await readFile('.data/local-secrets.json','utf8')));}catch{}
const db=await database();await migrate(db);await seed(db);await db.close();console.log('Migrations and deterministic demo seed complete.');
