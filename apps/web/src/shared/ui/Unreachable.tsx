import { Link } from "react-router";

export function Unreachable({ onRetry }: { onRetry?: () => unknown }) {
  return (
    <div role="alert" className="fatal">
      <h1 className="h2s">Cannot reach the server</h1>
      <p className="body muted-2">
        Lumen could not be reached, so your session could not be checked. Check your connection and
        try again.
      </p>
      <div className="row-gap">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => (onRetry ? onRetry() : window.location.reload())}
        >
          Retry
        </button>
        <Link to="/" className="btn btn-outline">
          Back to home
        </Link>
      </div>
    </div>
  );
}
