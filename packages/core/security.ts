import { createHash, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { ensure } from './index';
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');
export function equalSecret(a: string, b: string) { return a.length === b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b)); }
export function verifySignature(wallet: string, message: string, signature: string) {
  try { return nacl.sign.detached.verify(new TextEncoder().encode(message), bs58.decode(signature), bs58.decode(wallet)); } catch { return false; }
}
export function encryptSecret(bytes: Uint8Array) {
  const key = process.env.WALLET_ENCRYPTION_KEY;
  ensure(key && /^[a-f0-9]{64}$/i.test(key), 'SIGNER_UNCONFIGURED', 'The encrypted signer is not configured',503);
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', Buffer.from(key,'hex'),iv);
  const data = Buffer.concat([cipher.update(bytes),cipher.final()]);
  return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64')).join('.');
}
export function decryptSecret(value: string) {
  const [iv,tag,data] = value.split('.').map(v=>Buffer.from(v,'base64'));
  const decipher = createDecipheriv('aes-256-gcm',Buffer.from(process.env.WALLET_ENCRYPTION_KEY!,'hex'),iv);
  decipher.setAuthTag(tag); return Buffer.concat([decipher.update(data),decipher.final()]);
}
export function safetyConfig() {
  ensure(!['ENABLE_MAINNET','ENABLE_MAINNET_TOKEN_LAUNCH','ENABLE_AUTONOMOUS_MAINNET_SPEND'].some(k=>process.env[k]==='true'), 'MAINNET_DISABLED', 'Mainnet actions are not implemented in this V1 build',503);
  ensure(!process.env.SOLANA_NETWORK || process.env.SOLANA_NETWORK==='devnet','NETWORK_DENIED','Only devnet is enabled',503);
}
export const demoMode = () => process.env.APP_MODE === 'demo';
