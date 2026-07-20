import Link from "next/link";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="page-state" role="status" aria-live="polite">
      <span className="loading-mark" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="page-state page-state--error" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="button button--secondary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="page-state page-state--empty">
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? (
        <Link className="button button--primary" href={action.href}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
