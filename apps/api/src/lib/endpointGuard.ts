// skeleton so the test fails on behaviour, not on a missing import
export interface Address { address: string; family: number }
export interface GuardOptions { production: boolean; resolve?: (host: string) => Promise<Address[]> }
export const assertEndpoint = async (url: string, _o: GuardOptions): Promise<URL> => new URL(url);
export const guardedPost = async (_url: string, _o: GuardOptions & { timeoutMs: number; headers: Record<string, string>; body: string }):
  Promise<{ status: number; headers: Record<string, string>; body: string }> => ({ status: 200, headers: {}, body: "{}" });
