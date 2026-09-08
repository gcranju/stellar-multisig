import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FriendlyError } from "@/lib/errors";

type ErrorPanelProps = {
  error: FriendlyError | null;
  onDismiss?: () => void;
  className?: string;
};

export function ErrorPanel({ error, onDismiss, className }: ErrorPanelProps) {
  const [showDetail, setShowDetail] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!error) return null;

  const copyDetail = async () => {
    if (!error.detail) return;
    try {
      await navigator.clipboard.writeText(error.detail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure origin / denied) - the text stays selectable.
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "relative overflow-hidden rounded-lg border border-destructive/30 bg-destructive/[0.04]",
        "border-l-4 border-l-destructive shadow-sm",
        "animate-in fade-in slide-in-from-top-1 duration-200",
        className,
      )}
    >
      <div className="flex gap-3 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold tracking-tight text-destructive">
            {error.title}
            {error.field && (
              <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-xs font-normal">
                {error.field}
              </span>
            )}
          </p>

          <p className="break-words text-sm text-foreground/80">{error.message}</p>

          {error.hint && <p className="text-xs leading-relaxed text-muted-foreground">{error.hint}</p>}

          {error.detail && (
            <div className="pt-1">
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
                Technical details
              </button>

              {showDetail && (
                <div className="relative mt-2 animate-in fade-in duration-150">
                  <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/50 p-3 pr-10 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {error.detail}
                  </pre>
                  <button
                    type="button"
                    onClick={copyDetail}
                    className="absolute right-2 top-2 rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    aria-label="Copy error details"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-1 -mt-1 h-fit rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default ErrorPanel;
