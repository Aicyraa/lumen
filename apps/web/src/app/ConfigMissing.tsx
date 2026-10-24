export function ConfigMissing({ message }: { message: string }) {
  return (
    <div role="alert" className="fatal">
      <h1 className="h2s">Missing VITE_API_URL</h1>
      <p className="body muted-2">{message}</p>
    </div>
  );
}
