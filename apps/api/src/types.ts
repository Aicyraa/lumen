// Request fields set by requireApiKey / requireSession; every route after them can rely on tenantId.
declare global {
  namespace Express {
    interface Request {
      tenantId: string;
      apiKeyId?: string;
      userId?: string;
    }
  }
}
export {};
