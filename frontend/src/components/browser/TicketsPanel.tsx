import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, LifeBuoy, MessageSquare, Paperclip, Ticket, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BrowserUser, SupportTicket } from "@/types/browser";

interface TicketsPanelProps {
  user: BrowserUser | null;
  tickets: SupportTicket[];
  currentTabUrl?: string;
  selectedTicketId?: string | null;
  onSelectTicket?: (ticketId: string | null) => void;
  onCreateTicket: (
    subject: string,
    body: string,
    files?: File[],
    options?: { kind?: "support"; relatedUrl?: string },
  ) => Promise<void>;
  onReplyTicket: (ticketId: string, body: string, files?: File[]) => Promise<void>;
  onMarkTicketRead: (ticketId: string) => Promise<void>;
  onCloseTicket?: (ticketId: string) => Promise<void>;
  onOpenAccount: () => void;
  onBack?: () => void;
  onClose: () => void;
}

function formatTime(timestamp: number) {
  const delta = Date.now() - timestamp;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.max(1, Math.round(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${Math.max(1, Math.round(delta / 3_600_000))}h ago`;
  return `${Math.max(1, Math.round(delta / 86_400_000))}d ago`;
}

export const TicketsPanel: React.FC<TicketsPanelProps> = ({
  user,
  tickets,
  currentTabUrl = "",
  selectedTicketId,
  onSelectTicket,
  onCreateTicket,
  onReplyTicket,
  onMarkTicketRead,
  onCloseTicket,
  onOpenAccount,
  onBack,
  onClose,
}) => {
  const [filter, setFilter] = useState<"all" | "open" | "closed" | "support">("open");
  const [relatedUrl, setRelatedUrl] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closeTicketTarget, setCloseTicketTarget] = useState<SupportTicket | null>(null);

  const visibleTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (filter === "open") return ticket.status === "open";
      if (filter === "closed") return ticket.status === "closed";
      if (filter === "support") return (ticket.kind ?? "support") === "support";
      return true;
    });
  }, [filter, tickets]);

  const selectedTicket = useMemo(() => {
    if (!selectedTicketId) return null;
    return visibleTickets.find((ticket) => ticket.id === selectedTicketId)
      ?? tickets.find((ticket) => ticket.id === selectedTicketId)
      ?? null;
  }, [selectedTicketId, tickets, visibleTickets]);

  useEffect(() => {
    if (!selectedTicketId) return;
    if (!tickets.some((ticket) => ticket.id === selectedTicketId)) {
      onSelectTicket?.(null);
    }
  }, [onSelectTicket, selectedTicketId, tickets]);

  useEffect(() => {
    if (selectedTicket?.unread) {
      void onMarkTicketRead(selectedTicket.id);
    }
  }, [onMarkTicketRead, selectedTicket]);

  async function handleCreateTicket(event: React.FormEvent) {
    event.preventDefault();
    if (!subject.trim() || subject.trim().length < 3) {
      setError("Subject must be at least 3 characters.");
      return;
    }
    if (!body.trim() && createFiles.length === 0) {
      setError("Add a message or choose at least one file.");
      return;
    }
    setBusy("create");
    setError(null);
    try {
      await onCreateTicket(subject, body, createFiles.length > 0 ? createFiles : undefined, {
        kind: "support",
        relatedUrl: relatedUrl.trim() || undefined,
      });
      setSubject("");
      setBody("");
      setRelatedUrl("");
      setCreateFiles([]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to open this ticket.");
    } finally {
      setBusy(null);
    }
  }

  async function handleReply(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedTicket) return;
    if (!replyBody.trim() && replyFiles.length === 0) {
      setError("Add a message or choose at least one file.");
      return;
    }
    setBusy(`reply:${selectedTicket.id}`);
    setError(null);
    try {
      await onReplyTicket(selectedTicket.id, replyBody, replyFiles.length > 0 ? replyFiles : undefined);
      setReplyBody("");
      setReplyFiles([]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to send that reply.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[276] bg-background/90 backdrop-blur-sm">
      <div className="flex h-full flex-col p-4">
        <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-border px-8 py-5">
            <div>
              <div className="flex items-center gap-3">
                {onBack ? (
                  <Button variant="secondary" size="sm" onClick={onBack}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back
                  </Button>
                ) : null}
                <div className="flex items-center gap-2 text-xl font-semibold">
                  <Ticket className="h-5 w-5 text-primary" />
                  Tickets
                </div>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Open threads, follow replies, and keep support separate from general notifications.
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 transition-colors hover:bg-chrome-hover"
              title="Close tickets"
              aria-label="Close tickets"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {error ? (
            <div className="border-b border-destructive/20 bg-destructive/10 px-8 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-[21rem_minmax(0,1fr)]">
            <div className="min-h-0 overflow-y-auto border-r border-border px-6 py-6">
              {user ? (
                <form className="space-y-3 rounded-3xl border border-border bg-background/50 p-4" onSubmit={handleCreateTicket}>
                  <div>
                    <div className="text-sm font-semibold">Open a new ticket</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Open a support thread for browsing or account issues.
                    </div>
                  </div>
                  <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" />
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Describe what happened"
                    className="min-h-28 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <div className="space-y-2">
                    <Input value={relatedUrl} onChange={(event) => setRelatedUrl(event.target.value)} placeholder="Related page URL (optional)" />
                    {currentTabUrl ? (
                      <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => setRelatedUrl(currentTabUrl)}>
                        Use current tab URL
                      </Button>
                    ) : null}
                  </div>
                  <input
                    type="file"
                    multiple
                    className="block w-full text-[11px] text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-primary/15 file:px-2 file:py-1 file:text-xs"
                    onChange={(event) => setCreateFiles(event.target.files ? Array.from(event.target.files) : [])}
                  />
                  <Button type="submit" className="w-full" disabled={busy === "create"}>
                    {busy === "create" ? "Opening..." : "Open ticket"}
                  </Button>
                </form>
              ) : (
                <div className="rounded-3xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                  Sign in before opening tickets.
                  <Button className="mt-3 w-full" variant="secondary" onClick={onOpenAccount}>
                    Open account
                  </Button>
                </div>
              )}

              <div className="mt-5 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Pill active={filter === "open"} onClick={() => setFilter("open")} label="Open" />
                  <Pill active={filter === "closed"} onClick={() => setFilter("closed")} label="Closed" />
                  <Pill active={filter === "support"} onClick={() => setFilter("support")} label="Support" />
                  <Pill active={filter === "all"} onClick={() => setFilter("all")} label="All" />
                </div>
                {visibleTickets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                    No tickets in this view yet.
                  </div>
                ) : (
                  visibleTickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${selectedTicket?.id === ticket.id ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary/40"}`}
                      onClick={() => onSelectTicket?.(ticket.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-medium">{ticket.subject}</div>
                        {ticket.unread ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Support · {ticket.status} · {formatTime(ticket.updated_at)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col px-8 py-6">
              {selectedTicket ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold">{selectedTicket.subject}</div>
                        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                          Ticket
                        </span>
                        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                          {selectedTicket.status}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {selectedTicket.owner_username} · updated {formatTime(selectedTicket.updated_at)}
                      </div>
                      {selectedTicket.related_url ? (
                        <div className="mt-2 break-all text-xs text-muted-foreground">{selectedTicket.related_url}</div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => onSelectTicket?.(null)}>
                        Close view
                      </Button>
                      {selectedTicket.status === "open" && onCloseTicket ? (
                        <Button variant="secondary" size="sm" onClick={() => setCloseTicketTarget(selectedTicket)}>
                          Close ticket
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-5 pr-1">
                    {selectedTicket.messages.map((message) => (
                      <div key={message.id} className={`rounded-2xl border px-4 py-3 ${message.author_role === "user" ? "border-border bg-background/50" : "border-primary/20 bg-primary/10"}`}>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">
                            {message.author_role === "user" ? "You" : "Admin"}
                          </span>
                          <span>{message.author_username ?? (message.author_role === "user" ? user?.username ?? "You" : "Admin")} · {formatTime(message.created_at)}</span>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{message.body}</div>
                        {message.attachments && message.attachments.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {message.attachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-primary"
                              >
                                <Paperclip className="h-3 w-3" />
                                {attachment.original_name}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {selectedTicket.status === "open" ? (
                    <form className="space-y-3 border-t border-border pt-4" onSubmit={handleReply}>
                      <textarea
                        value={replyBody}
                        onChange={(event) => setReplyBody(event.target.value)}
                        placeholder="Reply to this thread"
                        className="min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          type="file"
                          multiple
                          className="block flex-1 text-[11px] text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-primary/15 file:px-2 file:py-1 file:text-xs"
                          onChange={(event) => setReplyFiles(event.target.files ? Array.from(event.target.files) : [])}
                        />
                        <Button type="submit" disabled={busy === `reply:${selectedTicket.id}`}>
                          <MessageSquare className="mr-1 h-4 w-4" />
                          {busy === `reply:${selectedTicket.id}` ? "Sending..." : "Send reply"}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="border-t border-border pt-4 text-sm text-muted-foreground">
                      This ticket is closed.
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="rounded-3xl border border-dashed border-border px-8 py-10 text-center text-muted-foreground">
                    <LifeBuoy className="mx-auto mb-3 h-8 w-8 text-primary" />
                    Select a ticket to view the full thread.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <AlertDialog open={Boolean(closeTicketTarget)} onOpenChange={(open) => !open && setCloseTicketTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              {closeTicketTarget ? `Close "${closeTicketTarget.subject}".` : "Confirm ticket close."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (closeTicketTarget && onCloseTicket) {
                  void onCloseTicket(closeTicketTarget.id);
                }
                setCloseTicketTarget(null);
              }}
            >
              Close ticket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const Pill: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({ active, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
  >
    {label}
  </button>
);
