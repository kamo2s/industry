// Server-only capability; cannot be supplied in a serialized public API request.
export const platformProvisionAuthority=Symbol('industry-platform-provision');
// Not a Solana public key: this accounting owner cannot authenticate or sign.
export const platformOperatorIdentity='INDUSTRY_PLATFORM_OPERATOR';
