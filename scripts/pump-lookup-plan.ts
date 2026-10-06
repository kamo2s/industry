// Compatibility entry point: fixture mode must be requested explicitly.
process.argv.splice(2,0,'plan');
await import('./pump-lookup');
export {};
