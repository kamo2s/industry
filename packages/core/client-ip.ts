import {isIP} from 'node:net';

/** Only use a header overwritten by the deployment's trusted HTTP ingress. */
export function clientIp(headers:Pick<Headers,'get'>,trustedHeader?:string):string|null {
  if(!trustedHeader)return 'local';
  const value=headers.get(trustedHeader)?.trim();
  if(!value||!isIP(value))return null;
  // Canonicalize IPv6 so alternate spelling cannot create new rate buckets.
  if(isIP(value)===6)return new URL(`http://[${value}]/`).hostname.slice(1,-1).toLowerCase();
  return value;
}
