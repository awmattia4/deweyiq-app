"use client"

/**
 * EmployeeDocs — Certification/document tracking with expiry dates.
 *
 * Owner view:
 *   - Per-employee document list with type badge, name, expiry status
 *   - Upload document button (opens dialog, uploads to Supabase Storage)
 *   - Delete document button
 *
 * Tech view:
 *   - Own documents (read-only, no upload/delete)
 *
 * Expiry status: green (>30 days), amber (<=30 days), red (expired)
 */

import { useState, useTransition, useRef } from "react"
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  type EmployeeDocument,
} from "@/actions/team-management"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

// ─── Types ────────────────────────────────────────────────────────────────────

type DocType = "cpo" | "drivers_license" | "insurance" | "other"

interface TeamMember {
  id: string
  full_name: string
  role: string
}

interface Props {
  initialDocuments: EmployeeDocument[]
  teamMembers: TeamMember[]
  userRole: string
  userId: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function docTypeLabel(type: string): string {
  switch (type) {
    case "cpo": return "CPO"
    case "drivers_license": return "Driver's License"
    case "insurance": return "Insurance"
    case "other": return "Other"
    default: return type
  }
}

function docTypeBadgeClass(type: string): string {
  switch (type) {
    case "cpo": return "border-blue-500/40 text-blue-400 bg-blue-500/10"
    case "drivers_license": return "border-violet-500/40 text-violet-400 bg-violet-500/10"
    case "insurance": return "border-teal-500/40 text-teal-400 bg-teal-500/10"
    default: return "border-muted text-muted-foreground"
  }
}

/**
 * Returns expiry status: "valid" | "expiring" | "expired"
 * expiring = expires within 30 days
 */
function getExpiryStatus(expiresAt: string | null): "valid" | "expiring" | "expired" | "none" {
  if (!expiresAt) return "none"

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiresAt + "T00:00:00")
  const diffMs = expiry.getTime() - today.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return "expired"
  if (diffDays <= 30) return "expiring"
  return "valid"
}

function expiryBadge(expiresAt: string | null) {
  const status = getExpiryStatus(expiresAt)
  if (status === "none") return null

  const formatted = expiresAt
    ? new Date(expiresAt + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : ""

  switch (status) {
    case "expired":
      return (
        <Badge variant="outline" className="text-xs border-red-500/40 text-red-400 bg-red-500/10">
          Expired {formatted}
        </Badge>
      )
    case "expiring":
      return (
        <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400 bg-amber-500/10">
          Expires {formatted}
        </Badge>
      )
    case "valid":
      return (
        <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-400 bg-emerald-500/10">
          Valid until {formatted}
        </Badge>
      )
  }
}

// ─── Upload dialog ────────────────────────────────────────────────────────────

function UploadDocumentDialog({
  teamMembers,
  onUploaded,
}: {
  teamMembers: TeamMember[]
  onUploaded: () => void
}) {
  const [open, setOpen] = useState(false)
  const [techId, setTechId] = useState(teamMembers[0]?.id ?? "")
  const [docType, setDocType] = useState<DocType>("cpo")
  const [docName, setDocName] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [notes, setNotes] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!techId) { setError("Select an employee"); return }
    if (!docName.trim()) { setError("Document name is required"); return }
    if (!file) { setError("Select a file to upload"); return }

    setUploading(true)
    try {
      const result = await uploadDocument({
        techId,
        docType,
        docName: docName.trim(),
        expiresAt: expiresAt || undefined,
        notes: notes || undefined,
        fileName: file.name,
      })

      if (!result.success || !result.signedUploadUrl) {
        setError(result.error ?? "Upload failed")
        return
      }

      // Upload the file to Supabase Storage using the signed URL
      const uploadResponse = await fetch(result.signedUploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      })

      if (!uploadResponse.ok) {
        setError("File upload failed — please try again")
        return
      }

      // Success
      setOpen(false)
      setDocName("")
      setExpiresAt("")
      setNotes("")
      setFile(null)
      if (fileRef.current) fileRef.current.value = ""
      onUploaded()
    } catch (err) {
      console.error("[UploadDocumentDialog]", err)
      setError("Something went wrong — please try again")
    } finally {
      setUploading(false)
    }
  }

  // Filter to techs only (owners can see all)
  const eligibleMembers = teamMembers.filter((m) => ["tech", "owner"].includes(m.role))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Upload Document</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Upload a certification or compliance document for an employee.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-1">
          {eligibleMembers.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label>Employee</Label>
              <Select value={techId} onValueChange={setTechId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cpo">CPO Certification</SelectItem>
                <SelectItem value="drivers_license">Driver's License</SelectItem>
                <SelectItem value="insurance">Insurance Card</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-name">Document Name</Label>
            <Input
              id="doc-name"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. CPO Certificate #12345"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-expires">Expiration Date (optional)</Label>
            <Input
              id="doc-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-file">File</Label>
            <Input
              id="doc-file"
              type="file"
              ref={fileRef}
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">PDF, JPG, PNG — max 10MB</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-notes">Notes (optional)</Label>
            <Textarea
              id="doc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EmployeeDocs({ initialDocuments, teamMembers, userRole, userId }: Props) {
  const [documents, setDocuments] = useState<EmployeeDocument[]>(initialDocuments)
  const [isPending, startTransition] = useTransition()

  const isOwner = userRole === "owner"

  async function refreshDocuments() {
    const fresh = await getDocuments()
    setDocuments(fresh)
  }

  function handleDelete(docId: string) {
    startTransition(async () => {
      await deleteDocument(docId)
      await refreshDocuments()
    })
  }

  // Group documents by employee
  const byEmployee = new Map<string, { name: string; docs: EmployeeDocument[] }>()
  for (const doc of documents) {
    if (!byEmployee.has(doc.tech_id)) {
      byEmployee.set(doc.tech_id, { name: doc.tech_name, docs: [] })
    }
    byEmployee.get(doc.tech_id)!.docs.push(doc)
  }

  // Sort expiring/expired to top within each employee
  function sortDocs(docs: EmployeeDocument[]) {
    return [...docs].sort((a, b) => {
      const statusOrder = { expired: 0, expiring: 1, valid: 2, none: 3 }
      const aStatus = getExpiryStatus(a.expires_at)
      const bStatus = getExpiryStatus(b.expires_at)
      return (statusOrder[aStatus] ?? 3) - (statusOrder[bStatus] ?? 3)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Certifications & Documents</h2>
        {isOwner && (
          <UploadDocumentDialog teamMembers={teamMembers} onUploaded={refreshDocuments} />
        )}
      </div>

      {/* ── Document list ─────────────────────────────────────────────────── */}
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No documents uploaded yet.
          {isOwner ? " Upload certifications and compliance documents for your team." : ""}
        </p>
      ) : isOwner ? (
        /* Owner: grouped by employee */
        <div className="flex flex-col gap-4">
          {Array.from(byEmployee.entries()).map(([techId, { name, docs }]) => (
            <div key={techId} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">{name}</h3>
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="divide-y divide-border">
                  {sortDocs(docs).map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                    >
                      <Badge
                        variant="outline"
                        className={`text-xs shrink-0 ${docTypeBadgeClass(doc.doc_type)}`}
                      >
                        {docTypeLabel(doc.doc_type)}
                      </Badge>

                      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.doc_name}</p>
                        {doc.notes && (
                          <p className="text-xs text-muted-foreground">{doc.notes}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {expiryBadge(doc.expires_at)}
                        {isOwner && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 h-7 px-2"
                            onClick={() => handleDelete(doc.id)}
                            disabled={isPending}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Tech: flat list of own documents */
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {sortDocs(documents).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
              >
                <Badge
                  variant="outline"
                  className={`text-xs shrink-0 ${docTypeBadgeClass(doc.doc_type)}`}
                >
                  {docTypeLabel(doc.doc_type)}
                </Badge>

                <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.doc_name}</p>
                  {doc.notes && (
                    <p className="text-xs text-muted-foreground">{doc.notes}</p>
                  )}
                </div>

                <div className="shrink-0">
                  {expiryBadge(doc.expires_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
