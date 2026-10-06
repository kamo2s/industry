import {AddressLookupTableProgram,PublicKey,type AddressLookupTableAccount} from '@solana/web3.js';
import {ensure} from '../core';import {launchLookupAddresses} from './lookup';
export async function altPlan(treasury:PublicKey,authority:PublicKey,payer:PublicKey,recentSlot:number){
 ensure(Number.isSafeInteger(recentSlot)&&recentSlot>=0,'ALT_SLOT','A recent observed slot is required');
 const addresses=await launchLookupAddresses(treasury),[create,address]=AddressLookupTableProgram.createLookupTable({authority,payer,recentSlot});
 const extend=AddressLookupTableProgram.extendLookupTable({lookupTable:address,authority,payer,addresses});
 return {address,addresses,create,extend};
}
export async function verifyAlt(table:AddressLookupTableAccount|null,treasury:PublicKey,currentSlot:number){
 ensure(table,'ALT_MISSING','Lookup table does not exist',503);const required=await launchLookupAddresses(treasury);
 const missing=required.filter(key=>!table.state.addresses.some(a=>a.equals(key)));
 return {ready:table.isActive()&&missing.length===0&&table.state.lastExtendedSlot<currentSlot,active:table.isActive(),warmed:table.state.lastExtendedSlot<currentSlot,missing:missing.map(p=>p.toBase58()),requiredAccounts:required.length};
}
