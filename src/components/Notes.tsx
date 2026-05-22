import { useEffect, useState, useCallback } from "react";
import { X, StickyNote, FileText, Loader2, PencilLine, MonitorSmartphone, Zap, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NotesProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
}

export default function Notes({ open, onClose, url, title }: NotesProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tipExpanded, setTipExpanded] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(false);
      setTipExpanded(false);
    }
  }, [open]);

  /* Lock body scroll */
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);

  const handleOpenExternal = useCallback(() => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, [url]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal — full-screen on mobile, centered card on tablet/desktop */}
      <div
        className={cn(
          "relative z-10 w-full flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-300",
          "h-[100dvh] rounded-none",                          /* mobile: full screen */
          "sm:h-[88vh] sm:max-h-[900px] sm:max-w-4xl sm:rounded-2xl", /* tablet+ */
          "bg-background shadow-2xl border-0 sm:border sm:border-border/40"
        )}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >

        {/* ── Header ── */}
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-3.5 border-b border-border/40 bg-card">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <StickyNote className="w-[16px] h-[16px] sm:w-[18px] sm:h-[18px] text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm text-foreground truncate leading-snug">{title}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Lecture Notes</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg shrink-0 active:bg-muted"
            aria-label="Close"
            style={{ touchAction: "manipulation" }}
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        </div>

        {/* ── Productivity Tip Banner ── */}
        <div className="shrink-0 border-b border-amber-500/20 bg-gradient-to-r from-amber-500/[0.06] via-amber-500/[0.03] to-transparent">
          <button
            onClick={() => setTipExpanded((v) => !v)}
            className="w-full flex items-center gap-2.5 sm:gap-3 px-4 sm:px-5 py-2 sm:py-2.5 text-left transition-colors active:bg-amber-500/[0.06]"
            style={{ touchAction: "manipulation" }}
          >
            <div className="shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="flex-1 text-[10px] sm:text-xs font-semibold text-amber-700 dark:text-amber-400 leading-snug">
              Make notes during the lecture for consistency & higher productivity
            </p>
            {tipExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-amber-500/50 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-amber-500/50 shrink-0" />
            )}
          </button>

          {tipExpanded && (
            <div className="px-4 sm:px-5 pb-2.5 sm:pb-3 space-y-2 sm:space-y-2.5 animate-in slide-in-from-top-1 duration-200">
              {/* Tip 1 */}
              <div className="flex gap-2 sm:gap-2.5 p-2 sm:p-2.5 rounded-lg bg-amber-500/[0.05] border border-amber-500/15">
                <div className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-amber-500/10 flex items-center justify-center">
                  <PencilLine className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] sm:text-xs font-bold text-foreground leading-snug">Write Along While Watching</p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    During the live or recorded lecture, actively make notes alongside. This builds consistency, improves retention, and boosts your overall productivity.
                  </p>
                </div>
              </div>

              {/* Tip 2 */}
              <div className="flex gap-2 sm:gap-2.5 p-2 sm:p-2.5 rounded-lg bg-blue-500/[0.05] border border-blue-500/15">
                <div className="shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-blue-500/10 flex items-center justify-center">
                  <MonitorSmartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] sm:text-xs font-bold text-foreground leading-snug">Use the App First, Website as Fallback</p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    Always prefer viewing and downloading notes from within the app. Only go to the website if the viewer fails here. Your focus should be on productivity, not switching platforms.
                  </p>
                </div>
              </div>

              <p className="text-[10px] text-amber-600/60 dark:text-amber-500/50 font-semibold text-center pt-0.5 leading-relaxed">
                Consistency in note-taking directly reflects in your scores. Take it seriously.
              </p>
            </div>
          )}
        </div>

        {/* ── PDF Body ── */}
        <div
          className="flex-1 min-h-0 relative bg-neutral-100 dark:bg-neutral-900"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {/* Loading overlay */}
          {loading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 z-10 bg-neutral-100 dark:bg-neutral-900">
              <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              </div>
              <p className="text-xs text-muted-foreground font-medium">Loading notes…</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-neutral-100 dark:bg-neutral-900">
              <div className="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center">
                <FileText className="w-6 h-6 text-muted-foreground/30" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-foreground">Unable to preview</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-[280px] leading-relaxed">
                  The PDF couldn't be displayed in the viewer. Open it in a new tab to access it.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenExternal}
                className="mt-1 h-9 gap-1.5 text-xs font-medium rounded-lg"
                style={{ touchAction: "manipulation" }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in New Tab
              </Button>
            </div>
          )}

          {/* PDF iframe — Removed sandbox to prevent Brave/privacy browsers from blocking the PDF viewer */}
          {!error && (
            <iframe
              src={url}
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true); }}
              className="w-full h-full border-0"
              title={title}
            />
          )}
        </div>
      </div>
    </div>
  );
}