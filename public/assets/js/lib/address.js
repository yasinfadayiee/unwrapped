// Wallet address on the pay screen: shown in groups of 4 so a buyer can compare the first and last
// characters with their wallet. Display only — Copy and the QR code always get the raw string.

export function addressGroups(addr) {
  return String(addr ?? '').match(/.{1,4}/g) || [];
}

export function payAddress(addr) {
  const raw = String(addr ?? '');
  return { raw, groups: addressGroups(raw), copy: raw, qr: raw };
}
