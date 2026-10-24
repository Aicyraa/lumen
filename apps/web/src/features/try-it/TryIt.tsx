import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { ApiError, post } from "../../shared/lib/api";
import { fmtScore } from "../../shared/lib/format";
import type { TryResponse } from "../../shared/lib/types";
import { RouteCard } from "../../shared/ui/RouteCard";
import { StatusMessage } from "../../shared/ui/StatusMessage";
import { UsageCard } from "../../shared/ui/UsageCard";
import { ErrorText, PageHead } from "../../shared/ui/ui";
import { useOrgId } from "../auth/session";

// Marks [1]-style citations in the lime accent.
function Answer({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[\d+\])/).map((part, i) =>
        /^\[\d+\]$/.test(part) ? (
          <span key={i} className="lime">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function TryIt() {
  const qc = useQueryClient();
  const org = useOrgId();
  const [query, setQuery] = useState("");
  const [rating, setRating] = useState<1 | -1 | 0>(0);
  const [feedbackError, setFeedbackError] = useState("");

  const ask = useMutation({
    mutationFn: (q: string) => post<TryResponse>("/api/dashboard/try", { query: q }),
    onMutate: () => setRating(0),
    onSettled: () => qc.invalidateQueries({ queryKey: ["usage", org] }),
  });
  const feedback = useMutation({
    mutationFn: (v: { id: string; rating: 1 | -1 }) =>
      post("/api/dashboard/feedback", { request_id: v.id, rating: v.rating }),
    onSuccess: (_d, v) => {
      setRating(v.rating);
      setFeedbackError("");
    },
    onError: (e: Error) => setFeedbackError(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim() && !ask.isPending) ask.mutate(query.trim());
  };
  const r = ask.data;
  const err = ask.error;

  return (
    <div className={`try-grid${r ? " with-side" : ""}`}>
      <div className="stack">
        <PageHead title="Try it" />
        <form onSubmit={submit} className="askbar">
          <input
            aria-label="Question"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask something your documents cover…"
            maxLength={2000}
          />
          <button type="submit" className="btn btn-accent" disabled={ask.isPending}>
            Ask
          </button>
        </form>
        {ask.isPending && (
          <StatusMessage state="loading">
            Embedding, searching your documents, routing…
          </StatusMessage>
        )}
        {err && (
          <ErrorText>
            {err instanceof ApiError && err.code === "no_models_configured" ? (
              <>
                No models are configured. Add a model in the{" "}
                <Link to="/dashboard/models">Models tab</Link>.
              </>
            ) : (
              err.message
            )}
          </ErrorText>
        )}
        {!r && !err && !ask.isPending && (
          <StatusMessage state="empty">
            Ask a question to see the answer, its route and its sources here.
          </StatusMessage>
        )}
        {r && (
          <div className="stack fade-in">
            <div className="stack-sm">
              <div className="label">ANSWER</div>
              <div className="answer">
                <Answer text={r.answer} />
              </div>
              <div className="row-gap-sm small muted-3">
                Helpful?
                <button
                  type="button"
                  className="chip"
                  aria-pressed={rating === 1}
                  onClick={() => feedback.mutate({ id: r.request_id, rating: 1 })}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className="chip"
                  aria-pressed={rating === -1}
                  onClick={() => feedback.mutate({ id: r.request_id, rating: -1 })}
                >
                  No
                </button>
              </div>
              <ErrorText>{feedbackError}</ErrorText>
            </div>
            {r.sources.length > 0 && (
              <div>
                <div className="label pb">SOURCES</div>
                {r.sources.map((s, i) => (
                  <div className="source" key={`${s.chunk_id}-${i}`}>
                    <span className="mono lime">[{i + 1}]</span>
                    <div className="grow">
                      <div>{s.filename ?? "deleted document"}</div>
                      {s.snippet && <div className="small muted-3">{s.snippet}</div>}
                    </div>
                    <div className="score">
                      <div className="score-track">
                        <div
                          className="score-fill"
                          style={{
                            width: `${Math.min(100, Math.max(0, Math.round(s.score * 100)))}%`,
                          }}
                        />
                      </div>
                      <span className="mono small muted-2">{fmtScore(s.score)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {r && (
        <div className="stack-sm side fade-in">
          <RouteCard
            big
            route={{
              tier: r.route.model_tier,
              k: r.route.k,
              escalated: r.route.escalated,
              difficulty: r.route.difficulty,
              top_score: r.route.top_score,
            }}
          />
          <UsageCard usage={r.usage} noModel={r.route.model_tier === "none"} />
        </div>
      )}
    </div>
  );
}
