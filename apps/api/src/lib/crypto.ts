// skeleton so the test fails on behaviour, not on a missing import
export const encryptSecret = (plain: string, _hexKey: string, _aad: string): string => plain;
export const decryptSecret = (blob: string, _hexKey: string, _aad: string): string => blob;
export const maskKey = (key: string): string => key;
