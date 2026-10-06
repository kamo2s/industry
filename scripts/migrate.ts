import 'dotenv/config';
import { database,migrate } from '../packages/db/connection';
const db=await database();try{await migrate(db);console.log(JSON.stringify({migrations:'complete'}));}finally{await db.close();}
