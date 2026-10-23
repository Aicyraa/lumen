import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Dialog } from "../../components/Dialog";
import { ErrorText, PageHead } from "../../components/ui";
import { authClient } from "../../lib/auth-client";
import { fmtDate } from "../../lib/format";

interface KeyRow { id: string; name: string | null; start: string | null; prefix: string | null; createdAt: string | Date; lastRequest: string | Date | null }

export function ApiKeys() {
  const { data: session } = authClient.useSession();
  const orgId = session?.session.activeOrganizationId ?? "";
  const qc = useQueryClient();
  const [step, setStep] = useState<"closed" | "name" | "show">("closed");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  // The full key lives only in this state. It is never put in the query cache, storage or the list.
  const [fullKey, setFullKey] = useState("");
  const [copied, setCopied] = useState(false);

  const keys = useQuery({
    queryKey: ["api-keys", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await authClient.apiKey.list({ query: { organizationId: orgId } });
      if (error) throw new Error(error.message ?? "Could not load keys.");
      return (data?.apiKeys ?? []) as unknown as KeyRow[];
    },
  });

  const create = useMutation({
    // The key goes straight into component state; the mutation's own data stays empty and it is not cached (gcTime 0).
    gcTime: 0,
    mutationFn: async () => {
      const { data, error } = await authClient.apiKey.create({ name: name.trim() || "Untitled key", organizationId: orgId });
      if (error || !data) throw new Error(error?.message ?? "Could not create the key.");
      setFullKey(data.key as string);
      setStep("show");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys", orgId] }),
    onError: (e: Error) => setError(e.message),
  });
  const revoke = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await authClient.apiKey.delete({ keyId });
      if (error) throw new Error(error.message ?? "Could not revoke the key.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys", orgId] }),
    onError: (e: Error) => setError(e.message),
  });

  const close = () => { setStep("closed"); setFullKey(""); setCopied(false); setName(""); setError(""); };
  const submit = (e: FormEvent) => { e.preventDefault(); setError(""); create.mutate(); };
  const copy = () => { void navigator.clipboard?.writeText(fullKey).catch(() => {}); setCopied(true); };
  const list = keys.data ?? [];

  return (
    <div className="stack">
      <PageHead num="02" title="API keys">
        <button type="button" className="btn btn-primary" onClick={() => { setError(""); setStep("name"); }}>Create key</button>
      </PageHead>
      <p className="body muted-2 maxw">Send a key in the <span className="mono text">x-api-key</span> header from your chatbot's backend. Keys are stored as hashes and belong to this workspace.</p>
      {step === "closed" && <ErrorText>{error}</ErrorText>}
      <div className="table" role="table" aria-label="API keys">
        <div className="tr th keys-cols" role="row"><span role="columnheader">NAME</span><span role="columnheader">KEY</span><span role="columnheader">CREATED</span><span role="columnheader">LAST USED</span><span role="columnheader" /></div>
        {list.map((k) => (
          <div className="tr keys-cols" role="row" key={k.id}>
            <div role="cell">{k.name ?? "Untitled key"}</div>
            <div role="cell" className="mono muted-2">{(k.prefix ?? "") + (k.start ?? "")}••••</div>
            <div role="cell" className="small muted-3">{fmtDate(String(k.createdAt))}</div>
            <div role="cell" className="small muted-3">{k.lastRequest ? fmtDate(String(k.lastRequest)) : "Never"}</div>
            <div role="cell" className="right"><button type="button" className="link-btn red" aria-label={`Revoke ${k.name ?? "key"}`} onClick={() => revoke.mutate(k.id)}>Revoke</button></div>
          </div>
        ))}
        {keys.isSuccess && !list.length && <div className="empty">No keys. Create one to connect your chatbot.</div>}
        {keys.isError && <ErrorText>{(keys.error as Error).message}</ErrorText>}
      </div>

      {step === "name" && (
        <Dialog title="Name this key" label="NEW KEY" onClose={close}>
          <form onSubmit={submit} className="stack-sm">
            <label className="field"><span>Name</span><input data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production chatbot" maxLength={100} /></label>
            <ErrorText>{error}</ErrorText>
            <div className="row-end"><button type="button" className="btn btn-outline" onClick={close}>Cancel</button><button type="submit" className="btn btn-primary" disabled={create.isPending}>Create</button></div>
          </form>
        </Dialog>
      )}
      {step === "show" && (
        <Dialog title="Copy this key now" label="KEY CREATED" onClose={close} dismissable={false}>
          <p className="body muted-2">It won't be shown again. If you lose it, revoke it and create a new one.</p>
          <div className="keybox"><span className="mono keytext">{fullKey}</span><button type="button" className="btn btn-primary btn-sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button></div>
          <div className="row-end"><button type="button" className="btn btn-outline" onClick={close}>I've saved it</button></div>
        </Dialog>
      )}
    </div>
  );
}
