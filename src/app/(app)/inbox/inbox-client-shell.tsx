"use client"

import { useState } from "react"
import { MessageSquareIcon } from "lucide-react"
import type { InboxThread } from "@/actions/portal-messages"
import { InboxList } from "@/components/inbox/inbox-list"
import { InboxThread as InboxThreadPanel } from "@/components/inbox/inbox-thread"

interface InboxClientShellProps {
  threads: InboxThread[]
  orgId: string
  senderName: string
}

/**
 * InboxClientShell — Two-panel inbox layout (thread list + active thread).
 *
 * - Left panel: InboxList with all customer threads
 * - Right panel: InboxThread for the selected customer
 * - Mobile: stacked, shows list first, thread when one is selected
 * - Desktop: side-by-side panels
 *
 * Server page (inbox/page.tsx) SSRs thread list and injects here.
 * Active thread selection is client-side state.
 */
export function InboxClientShell({ threads, orgId, senderName }: InboxClientShellProps) {
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(
    threads.length > 0 ? threads[0].customerId : null
  )

  const activeThread = threads.find((t) => t.customerId === activeCustomerId) ?? null

  const containerHeight = "calc(100vh - 200px)"
  const minHeight = "500px"

  // Mobile: show thread panel if a thread is selected, list otherwise
  const [showListMobile, setShowListMobile] = useState(!activeCustomerId)

  function handleSelect(customerId: string) {
    setActiveCustomerId(customerId)
    setShowListMobile(false)
  }

  if (threads.length === 0) {
    return (
      <div
        className="rounded-xl border border-border/60 bg-card flex flex-col items-center justify-center gap-3 text-center"
        style={{ minHeight }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <MessageSquareIcon className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">No messages yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Messages from customers through the portal will appear here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl border border-border/60 bg-card overflow-hidden flex"
      style={{ height: containerHeight, minHeight }}
    >
      {/* ── Thread list (left panel on desktop, full-width on mobile when visible) ── */}
      <div
        className={`flex-shrink-0 border-r border-border/60 overflow-y-auto ${
          showListMobile ? "flex" : "hidden"
        } flex-col w-full sm:flex sm:w-72 lg:w-80`}
      >
        <div className="px-4 py-3 border-b border-border/60">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Conversations
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <InboxList
            threads={threads}
            activeCustomerId={activeCustomerId}
            onSelect={handleSelect}
          />
        </div>
      </div>

      {/* ── Active thread (right panel on desktop, full-screen on mobile when selected) ── */}
      <div
        className={`flex-1 overflow-hidden flex flex-col ${
          !showListMobile ? "flex" : "hidden sm:flex"
        }`}
      >
        {activeThread ? (
          <>
            {/* Mobile back button */}
            <div className="sm:hidden px-4 py-2 border-b border-border/60">
              <button
                type="button"
                onClick={() => setShowListMobile(true)}
                className="text-xs text-primary hover:underline cursor-pointer"
              >
                ← All conversations
              </button>
            </div>
            <InboxThreadPanel
              customerId={activeThread.customerId}
              customerName={activeThread.customerName}
              customerEmail={activeThread.customerEmail}
              orgId={orgId}
              senderName={senderName}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
            <MessageSquareIcon className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Select a conversation from the left
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
