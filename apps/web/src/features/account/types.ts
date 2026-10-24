// GET /api/dashboard/account (apps/api/README.md, "Account").
export interface AccountInfo {
  user: {
    name: string | null;
    email: string;
    email_verified: boolean;
    image: string | null;
    created_at: string;
  };
  providers: { provider: "email" | "google" | "github"; linked_at: string }[];
  projects: { owned: number; max: number };
  totals: { documents: number; requests_this_month: number; api_keys: number; models: number };
}
