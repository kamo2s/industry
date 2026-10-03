import { AgentDetail } from '../../../components/detail';
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <AgentDetail slug={slug}/>;}
