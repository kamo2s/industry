import {micro} from '../core';
import {one,type Queryable,type Row} from './connection';
import {balances} from './journal';
import {operatingSpend} from './controls';
import {providerBudget} from './provider-budget';

/** Admission snapshot; claim still rechecks all limits before spending. */
export async function supplierAvailable(tx:Queryable,a:Row){
 if(a.paused||a.terminated_at||a.config.policy.killSwitch)return false;
 const reserve=micro(a.config.policy.maxRunCost),funds=await balances(tx,a.business_id||a.id),spent=await operatingSpend(tx,a.id);
 if(funds.computeDebt>0||micro(funds.compute)<reserve||spent.hour+reserve>micro(a.config.policy.hourlySpend)||spent.day+reserve>micro(a.config.policy.dailySpend))return false;
 if(await one(tx,"SELECT id FROM jobs WHERE agent_id=$1 AND type='SERVICE' AND status IN ('queued','running') LIMIT 1",[a.id]))return false;
 if(a.config.brain!=='development/mock'){const budget=await providerBudget(tx);if(budget.paused||budget.committedMicro+reserve>budget.capMicro)return false;}
 return true;
}
