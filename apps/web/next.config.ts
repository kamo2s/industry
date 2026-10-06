import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  async redirects() {
    return [
      {source:'/network',destination:'/coins',permanent:false},
      {source:'/agents',destination:'/coins',permanent:false},
      {source:'/agents/:slug',destination:'/coins/:slug',permanent:false},
      {source:'/jobs',destination:'/marketplace?tab=work',permanent:false},
    ];
  },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV==='development'?" 'unsafe-eval'":''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://api.devnet.solana.com; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` }
  ]}]; }
};
export default config;
