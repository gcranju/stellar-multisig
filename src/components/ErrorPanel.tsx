import { useState } from "react";
import { Check, ChevronDown, Clock, Copy, ExternalLink, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ErrorMeta, FriendlyError } from "@/lib/errors";

type ErrorPanelProps = {
  error: FriendlyError | null;
  onDismiss?: () => void;
  className?: string;
};

/** Middle-truncate a hash or address so both ends stay verifiable. */
function truncate(value: string) {
  return value.length > 24 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure origin / denied) - text stays selectable.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-all hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function MetaRow({ row }: { row: ErrorMeta }) {
  return (
    <div className="group flex items-baseline gap-2 py-1">
      <span className="w-[4.5rem] shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
        {row.label}
      </span>

      {row.href ? (
        <a
          href={row.href}
          target="_blank"
          rel="noreferrer noopener"
          className={cn(
            "min-w-0 truncate underline-offset-2 hover:underline",
            row.mono ? "font-mono text-xs" : "text-xs",
          )}
          title={row.value}
        >
          {row.mono ? truncate(row.value) : row.value}
        </a>
      ) : (
        <span
          className={cn("min-w-0 truncate", row.mono ? "font-mono text-xs" : "text-xs")}
          title={row.value}
        >
          {row.mono ? truncate(row.value) : row.value}
        </span>
      )}

      {row.mono && <CopyButton value={row.value} label={`Copy ${row.label}`} />}
    </div>
  );
}

export function ErrorPanel({ error, onDismiss, className }: ErrorPanelProps) {
  const [showDetail, setShowDetail] = useState(false);
  const [copiedDetail, setCopiedDetail] = useState(false);

  if (!error) return null;

  // "warning" covers outcomes that are unresolved rather than failed - a
  // submitted-but-unconfirmed transaction, a declined signature, a busy RPC.
  const isWarning = error.severity === "warning";
  const Icon = isWarning ? Clock : ShieldAlert;

  const copyDetail = async () => {
    if (!error.detail) return;
    try {
      await navigator.clipboard.writeText(error.detail);
      setCopiedDetail(true);
      setTimeout(() => setCopiedDetail(false), 1500);
    } catch {
      // Clipboard unavailable - the text stays selectable.
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card shadow-sm",
        "animate-in fade-in slide-in-from-top-1 duration-200",
        isWarning ? "border-amber-500/40" : "border-destructive/40",
        className,
      )}
    >
      {/* Status rule: the panel reads as a receipt, not an alert box. */}
      <div className={cn("h-1 w-full", isWarning ? "bg-amber-500" : "bg-destructive")} />

      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
              isWarning ? "bg-amber-500/10 text-amber-600 dark:text-amber-500" : "bg-destructive/10 text-destructive",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold tracking-tight">{error.title}</span>

              {error.code && (
                <code
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-[11px]",
                    isWarning
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-500"
                      : "border-destructive/30 bg-destructive/10 text-destructive",
                  )}
                >
                  {error.code}
                </code>
              )}

              {error.field && (
                <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  arg: {error.field}
                </code>
              )}
            </div>

            <p className="mt-1 break-words text-sm text-foreground/80">{error.message}</p>
          </div>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="-mr-1 -mt-1 h-fit rounded p-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {error.hint && (
          <p className="border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
            {error.hint}
          </p>
        )}

        {error.meta && error.meta.length > 0 && (
          <div className="divide-y divide-border/60 rounded-lg border border-border/60 bg-muted/30 px-3 py-1">
            {error.meta.map((row) => (
              <MetaRow key={row.label} row={row} />
            ))}
          </div>
        )}

        {(error.link || error.detail) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5">
            {error.link && (
              <a
                href={error.link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
              >
                {error.link.label}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}

            {error.detail && (
              <button
                type="button"
                onClick={() => setShowDetail((open) => !open)}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                aria-expanded={showDetail}
              >
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform duration-200", showDetail && "rotate-180")}
                  aria-hidden
                />
                Raw error
              </button>
            )}
          </div>
        )}

        {showDetail && error.detail && (
          <div className="relative animate-in fade-in duration-150">
            <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-muted/50 p-3 pr-10 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {error.detail}
            </pre>
            <button
              type="button"
              onClick={copyDetail}
              className="absolute right-2 top-2 rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              aria-label="Copy raw error"
            >
              {copiedDetail ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ErrorPanel;
