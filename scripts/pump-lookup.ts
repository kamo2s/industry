import 'dotenv/config';import {mkdir,writeFile} from 'node:fs/promises';
import {Keypair,PublicKey,AddressLookupTableAccount,AddressLookupTableProgram} from '@solana/web3.js';import {altPlan,verifyAlt} from '../packages/pump/alt-tooling';
import {validOperationalAddress,pumpConnection,assertPumpNetwork} from '../packages/pump/config';import {buildLaunch} from '../packages/pump/adapter';import {ensure} from '../packages/core';
const command=process.argv[2]||'plan',fixture=process.argv.includes('--fixture');
ensure(['plan','create','extend','verify','activate','check'].includes(command),'ALT_COMMAND','Choose plan/create/extend/verify/activate/check');
const treasury=fixture?Keypair.generate().publicKey:new PublicKey((ensure(validOperationalAddress(process.env.INDUSTRY_FEE_TREASURY),'TREASURY_UNCONFIGURED','Treasury is NOT CONFIGURED'),process.env.INDUSTRY_FEE_TREASURY!));
const authority=fixture?Keypair.generate().publicKey:new PublicKey((ensure(validOperationalAddress(process.env.INDUSTRY_FEE_COLLECTOR),'COLLECTOR_UNCONFIGURED','Collector is NOT CONFIGURED'),process.env.INDUSTRY_FEE_COLLECTOR!));
const rpc=fixture?undefined:pumpConnection();if(rpc)await assertPumpNetwork(rpc);const slot=rpc?await rpc.getSlot('finalized'):100;
const plan=await altPlan(treasury,authority,authority,slot);
if(command==='extend'&&!fixture){ensure(process.env.PUMP_LOOKUP_TABLES,'ALT_REQUIRED','Set the existing table returned by create in PUMP_LOOKUP_TABLES');const address=new PublicKey(process.env.PUMP_LOOKUP_TABLES.split(',')[0]);const existing=(await rpc!.getAddressLookupTable(address)).value;ensure(existing&&existing.state.authority?.equals(authority),'ALT_AUTHORITY','Existing table must belong to the configured collector');plan.address=address;plan.extend=AddressLookupTableProgram.extendLookupTable({lookupTable:address,authority,payer:authority,addresses:plan.addresses.filter(p=>!existing.state.addresses.some(a=>a.equals(p)))});}
let result:any;
if(['verify','activate','check'].includes(command)){
 if(!fixture)ensure(process.env.PUMP_LOOKUP_TABLES,'ALT_REQUIRED','Configure the existing PUMP_LOOKUP_TABLES address');
 const table=fixture?new AddressLookupTableAccount({key:plan.address,state:{deactivationSlot:18446744073709551615n,lastExtendedSlot:slot-1,lastExtendedSlotStartIndex:0,authority,addresses:plan.addresses}}):(await rpc!.getAddressLookupTable(new PublicKey(process.env.PUMP_LOOKUP_TABLES!.split(',')[0]))).value;
 result=await verifyAlt(table,treasury,slot);
}else{
 const serialize=(ix:typeof plan.create)=>({program:ix.programId.toBase58(),accounts:ix.keys.map(k=>({address:k.pubkey.toBase58(),signer:k.isSigner,writable:k.isWritable})),dataBase64:ix.data.toString('base64')});
 const table=new AddressLookupTableAccount({key:plan.address,state:{deactivationSlot:18446744073709551615n,lastExtendedSlot:slot-1,lastExtendedSlotStartIndex:0,authority,addresses:plan.addresses}});
 const tx=await buildLaunch({mint:Keypair.generate().publicKey.toBase58(),creator:authority.toBase58(),treasury:treasury.toBase58(),name:'A'.repeat(32),symbol:'T'.repeat(10),uri:'https://industry.example/'+ 'a'.repeat(175)},Keypair.generate().publicKey.toBase58(),[table]);
 result={requiredAccounts:plan.addresses.length,atomicLaunchBytes:tx.serialize().length,...(!fixture?{lookupTable:plan.address.toBase58(),instructions:command==='create'?[serialize(plan.create)]:command==='extend'?[serialize(plan.extend)]:[serialize(plan.create),serialize(plan.extend)]}:{offlineFixture:true})};
}
await mkdir('qa/pump',{recursive:true});const report={at:new Date().toISOString(),command,fixture,...result,transactionsSubmitted:0,notice:'Unsigned operator instructions only. Create/extend require separate wallet review and submission. Activate/check only verifies slot warmup.'};await writeFile(`qa/pump/alt-${command}${fixture?'-fixture':''}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
