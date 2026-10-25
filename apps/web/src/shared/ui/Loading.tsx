export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="loading mono small muted-3">
      {label}
    </div>
  );
}
