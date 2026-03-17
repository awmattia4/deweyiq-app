"use client"

import { useState, useTransition, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  uploadHoaDocument,
  deleteProjectDocument,
  type ProjectDocument,
} from "@/actions/projects-permits"

// ─── Constants ────────────────────────────────────────────────────────────────

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  hoa: "HOA Approval Letter",
  architectural_review: "Architectural Review",
  variance: "Variance Request",
  neighbor_notification: "Neighbor Notification",
  permit: "Permit Document",
  contract: "Contract",
  certificate: "Certificate",
  other: "Other",
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function getFileIcon(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "pdf":
      return "PDF"
    case "jpg":
    case "jpeg":
    case "png":
    case "webp":
      return "IMG"
    case "doc":
    case "docx":
      return "DOC"
    default:
      return "FILE"
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface HoaDocumentsProps {
  projectId: string
  documents: ProjectDocument[]
  onDocumentsChange: (documents: ProjectDocument[]) => void
}

// ─── Upload Dialog ────────────────────────────────────────────────────────────

function UploadDialog({
  projectId,
  open,
  onClose,
  onUploaded,
}: {
  projectId: string
  open: boolean
  onClose: () => void
  onUploaded: (doc: ProjectDocument) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [docType, setDocType] = useState("hoa")
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0] ?? null
    setSelectedFile(file)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function handleUpload() {
    if (!selectedFile) {
      toast.error("Please select a file to upload")
      return
    }

    startTransition(async () => {
      try {
        const reader = new FileReader()
        reader.onload = async () => {
          const base64 = reader.result as string
          const result = await uploadHoaDocument(
            projectId,
            selectedFile.name,
            base64,
            selectedFile.type || "application/octet-stream"
          )
          if ("error" in result) {
            toast.error(result.error)
          } else {
            toast.success("Document uploaded")
            onUploaded(result.document)
            onClose()
            setSelectedFile(null)
            setDocType("hoa")
          }
        }
        reader.onerror = () => toast.error("Failed to read file")
        reader.readAsDataURL(selectedFile)
      } catch (err) {
        console.error("[UploadDialog]", err)
        toast.error("Failed to upload document")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Upload an HOA approval letter, architectural review, or other project document.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          {/* Document type */}
          <div className="flex flex-col gap-1.5">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Drop zone */}
          <div
            className={cn(
              "rounded-md border-2 border-dashed transition-colors cursor-pointer p-6 flex flex-col items-center gap-2 text-center",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/50"
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            {selectedFile ? (
              <>
                <span className="text-sm font-medium">{selectedFile.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(0)} KB — click to change
                </span>
              </>
            ) : (
              <>
                <span className="text-sm text-muted-foreground">
                  Drag and drop a file, or click to browse
                </span>
                <span className="text-xs text-muted-foreground">
                  PDF, images, or documents
                </span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isPending || !selectedFile}>
              Upload
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Document Row ─────────────────────────────────────────────────────────────

function DocumentRow({
  doc,
  onArchived,
}: {
  doc: ProjectDocument
  onArchived: (docId: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const supabase = createClient()

  async function handleDownload() {
    try {
      const { data, error } = await supabase.storage
        .from("project-documents")
        .createSignedUrl(doc.file_path, 60)
      if (error || !data?.signedUrl) {
        toast.error("Failed to get download link")
        return
      }
      window.open(data.signedUrl, "_blank")
    } catch {
      toast.error("Failed to download document")
    }
  }

  function handleArchive() {
    startTransition(async () => {
      const result = await deleteProjectDocument(doc.id)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Document archived")
        onArchived(doc.id)
        setConfirmArchive(false)
      }
    })
  }

  const fileIcon = getFileIcon(doc.file_name)

  return (
    <>
      <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
        {/* Icon */}
        <div className="shrink-0 w-9 h-9 rounded bg-muted flex items-center justify-center">
          <span className="text-[10px] font-mono font-bold text-muted-foreground">
            {fileIcon}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{doc.file_name}</p>
          <p className="text-xs text-muted-foreground">
            {DOCUMENT_TYPE_LABELS[doc.document_type] ?? doc.document_type}
            {" — "}
            {formatDate(doc.created_at)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownload}
            className="text-xs h-7"
          >
            Download
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmArchive(true)}
            disabled={isPending}
            className="text-xs h-7 text-destructive hover:text-destructive"
          >
            Archive
          </Button>
        </div>
      </div>

      {/* Confirm archive dialog */}
      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Document</DialogTitle>
            <DialogDescription>
              This will archive &ldquo;{doc.file_name}&rdquo;. Archived documents are not deleted
              and can be recovered if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConfirmArchive(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleArchive} disabled={isPending}>
              Archive
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── HoaDocuments ─────────────────────────────────────────────────────────────

/**
 * HoaDocuments — HOA and project document management UI.
 *
 * Upload area (drag-and-drop or file picker) + document list with
 * download and soft-archive per PROJ-91.
 */
export function HoaDocuments({ projectId, documents, onDocumentsChange }: HoaDocumentsProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)

  function handleDocumentUploaded(doc: ProjectDocument) {
    onDocumentsChange([...documents, doc])
  }

  function handleDocumentArchived(docId: string) {
    onDocumentsChange(documents.filter((d) => d.id !== docId))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">HOA &amp; Documents</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setUploadDialogOpen(true)}
          >
            Upload Document
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-1">
            No documents uploaded yet. Upload HOA approvals, architectural reviews, or other
            project documents.
          </p>
        ) : (
          <div className="flex flex-col">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onArchived={handleDocumentArchived}
              />
            ))}
          </div>
        )}
      </CardContent>

      <UploadDialog
        projectId={projectId}
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onUploaded={handleDocumentUploaded}
      />
    </Card>
  )
}
