import {guidedTemplate} from './launch-defaults';
import {agentSchema,type AgentInput} from './index';
export function launchIdentityErrors(d:AgentInput){
 const errors:Record<string,string>={};
 if(!agentSchema.shape.name.safeParse(d.name).success)errors.name='Use a name with 2–40 letters, numbers, spaces, dots or hyphens.';
 const ticker=agentSchema.shape.ticker.safeParse(d.ticker);if(!ticker.success)errors.ticker=ticker.error.issues[0].message;
 if(!agentSchema.shape.description.safeParse(d.description).success)errors.description='Add a public description of 10–240 characters.';
 return errors;
}
export function launchWorkErrors(d:AgentInput,models:{id:string}[]){const errors:Record<string,string>={};if(d.scope.trim().length<10)errors.scope='Define a mission with at least 10 characters.';if(d.scope.length>2000)errors.scope='Keep the mission within 2,000 characters.';if(!models.some(m=>m.id===d.brain))errors.brain='Choose an available AI model.';return errors;}
export function selectLaunchRole(d:AgentInput,role:AgentInput['jobType']){return {...guidedTemplate(d,role),scope:d.scope,mission:d.mission};}

