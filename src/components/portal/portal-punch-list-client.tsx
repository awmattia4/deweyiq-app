"use client"

/**
 * portal-punch-list-client.tsx — Customer punch list view with sign-off.
 *
 * Phase 12 Plan 16 (PROJ-89)
 *
 * Shows list of punch list items. When all are resolved, shows "Sign Off" button.
 * Customer signature triggers: warranty activation + final invoice + project complete.
 */

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { customerSignOffPunchList } from "@/actions/projects-inspections"
import type { PortalPunchList } from "@/actions/projects-portal"
import { CheckCircle2Icon, CircleIcon } from "lucide-react"

interface Props {
  projectId: string
  projectName: string
  punchList: PortalPunchList
}

export function PortalPunchListClient({ projectId, projectName, punchList }: Props) {
  const router = useRouter()
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signedOff, setSignedOff] = useState(punchList.signedOffAt !== null)

  const allResolved = punchList.allResolved || signedOff

  async function handleSignOff() {
    setSigning(true)
    setError(null)
    try {
      const result = await customerSignOffPunchList(projectId, "customer_digital_acceptance")
      if ("error" in result) {
        setError(result.error)
      } else {
        setSignedOff(true)
        router.refresh()
      }
    } catch {
      setError("Sign-off failed. Please try again.")
    } finally {
      setSigning(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Final Walkthrough</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review all punch list items and sign off when satisfied.
        </p>
      </div>

      {punchList.items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground italic">
              No punch list items have been created yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {punchList.items.map((item) => {
              const isResolved = ["resolved", "accepted"].includes(item.status)
              return (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {isResolved ? (
                        <CheckCircle2Icon className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <CircleIcon className="h-5 w-5 text-muted-foreground/40 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <p className="text-sm font-medium">{item.item_description}</p>
                          <Badge
                            variant={
                              item.status === "accepted"
                                ? "default"
                                : item.status === "resolved"
                                ? "secondary"
                                : "outline"
                            }
                            className="text-[10px] px-1.5 shrink-0"
                          >
                            {item.status === "accepted"
                              ? "Accepted"
                              : item.status === "resolved"
                              ? "Resolved"
                              : item.status === "in_progress"
                              ? "In Progress"
                              : "Open"}
                          </Badge>
                        </div>
                        {item.resolution_notes && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.resolution_notes}
                          </p>
                        )}
                        {item.photo_urls.length > 0 && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {item.photo_urls.map((url, idx) => (
                              <a
                                key={idx}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <img
                                  src={url}
                                  alt={`Evidence ${idx + 1}`}
                                  className="h-14 w-14 rounded-lg object-cover border border-border hover:opacity-80 transition-opacity"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                        {isResolved && item.resolved_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Resolved {new Date(item.resolved_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Sign-off section */}
          {signedOff || punchList.signedOffAt ? (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2Icon className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      Punch List Signed Off
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      You have accepted all items. Your project is complete and your warranty
                      has been activated. A final invoice has been generated.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : allResolved ? (
            <Card className="border-primary/30">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-2">All Items Resolved</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  All punch list items have been resolved by the crew. Please review the
                  completed items above, then sign off to:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 mb-4 ml-4 list-disc">
                  <li>Mark your project as complete</li>
                  <li>Activate your warranty</li>
                  <li>Release the final invoice</li>
                </ul>
                {error && (
                  <p className="text-sm text-destructive mb-3">{error}</p>
                )}
                <Button
                  onClick={handleSignOff}
                  disabled={signing}
                  className="w-full sm:w-auto"
                >
                  {signing ? "Processing..." : "Sign Off & Accept"}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  By clicking &ldquo;Sign Off & Accept&rdquo;, you confirm that all punch list items
                  have been completed to your satisfaction.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">
                  {punchList.items.filter((i) => !["resolved", "accepted"].includes(i.status)).length} item(s)
                  still need to be resolved before you can sign off. Your contractor will
                  update this page as items are completed.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
