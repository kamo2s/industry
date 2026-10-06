import { Suspense } from 'react';
import { MyIndustry } from '../../components/my-industry';
export default function Page(){return <Suspense fallback={null}><MyIndustry/></Suspense>;}
