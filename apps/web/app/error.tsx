'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="page"><h1>Something interrupted this page.</h1><p className="section-space">Your jobs and records are still stored. Try loading this view again.</p><button className="button section-space" onClick={reset}>Try again</button></div>;}
