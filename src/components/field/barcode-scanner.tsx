"use client"

/**
 * Phase 13: Barcode Scanner Component
 *
 * Wraps react-zxing to provide cross-platform barcode scanning (iOS + Android).
 * Uses the device camera to scan barcodes in real-time.
 *
 * IMPORTANT: This component must ONLY be loaded via next/dynamic with ssr: false.
 * The camera API is browser-only and will crash during SSR.
 *
 * Usage:
 *   const BarcodeScannerDialog = dynamic(
 *     () => import("@/components/field/barcode-scanner").then(m => m.BarcodeScannerDialog),
 *     { ssr: false }
 *   )
 */

import { useRef } from "react"
import { useZxing } from "react-zxing"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

// ---------------------------------------------------------------------------
// Raw scanner component (embed in any layout)
// ---------------------------------------------------------------------------

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onError?: (err: Error) => void
}

export function BarcodeScanner({ onScan, onError }: BarcodeScannerProps) {
  const { ref } = useZxing({
    onResult(result) {
      const text = result.getText()
      if (text) onScan(text)
    },
    onError(err) {
      if (onError) onError(err instanceof Error ? err : new Error(String(err)))
    },
    // Prefer rear camera on mobile — better for barcodes
    constraints: {
      video: {
        facingMode: { ideal: "environment" },
      },
    },
    timeBetweenDecodingAttempts: 300,
  })

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black">
      {/* Camera video feed */}
      <video
        ref={ref}
        className="w-full object-cover"
        style={{ maxHeight: "60dvh" }}
        autoPlay
        playsInline
        muted
      />

      {/* Scanning overlay — visual guide for barcode alignment */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        {/* Corner brackets */}
        <div className="relative h-40 w-64">
          {/* Top-left */}
          <div className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-primary" />
          {/* Top-right */}
          <div className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-primary" />
          {/* Bottom-left */}
          <div className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-primary" />
          {/* Bottom-right */}
          <div className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-primary" />

          {/* Scanning line animation */}
          <div
            className="absolute inset-x-0 h-0.5 bg-primary/70"
            style={{
              animation: "scan-line 2s ease-in-out infinite",
              top: "50%",
            }}
          />
        </div>
      </div>

      {/* Inject scan-line animation keyframes */}
      <style>{`
        @keyframes scan-line {
          0% { transform: translateY(-64px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(64px); opacity: 0; }
        }
      `}</style>

      <p className="absolute bottom-3 w-full text-center text-xs text-white/70">
        Point camera at barcode to scan
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog wrapper — scanner in a modal sheet
// ---------------------------------------------------------------------------

interface BarcodeScannerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (barcode: string) => void
  title?: string
}

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onScan,
  title = "Scan Barcode",
}: BarcodeScannerDialogProps) {
  const hasScanned = useRef(false)

  function handleScan(barcode: string) {
    // Debounce — only fire once per dialog open
    if (hasScanned.current) return
    hasScanned.current = true

    onScan(barcode)
    onOpenChange(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      hasScanned.current = false
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm p-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {open && (
          <div className="space-y-4">
            <BarcodeScanner
              onScan={handleScan}
              onError={(err) =>
                console.error("[BarcodeScannerDialog] scan error:", err)
              }
            />

            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
