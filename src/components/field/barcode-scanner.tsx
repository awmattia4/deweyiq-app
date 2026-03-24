"use client"

/**
 * Phase 13: Barcode Scanner Component
 *
 * Uses html5-qrcode (supports ALL barcode formats despite the name):
 * UPC-A, UPC-E, EAN-13, EAN-8, Code 128, Code 39, ITF, QR, DataMatrix, etc.
 *
 * Battle-tested on iOS PWA, Safari, Chrome, Android.
 *
 * Load via next/dynamic with ssr: false.
 */

import { useEffect, useRef, useState } from "react"
import { Html5Qrcode } from "html5-qrcode"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// ---------------------------------------------------------------------------
// Raw scanner component
// ---------------------------------------------------------------------------

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onError?: (err: Error) => void
}

export function BarcodeScanner({ onScan, onError }: BarcodeScannerProps) {
  const containerId = useRef(`barcode-scanner-${Math.random().toString(36).slice(2, 8)}`)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [status, setStatus] = useState<"loading" | "scanning" | "error">("loading")
  const [manualInput, setManualInput] = useState("")
  const scannedRef = useRef(false)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    let mounted = true
    scannedRef.current = false

    async function start() {
      try {
        const scanner = new Html5Qrcode(containerId.current)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.7778,
          },
          // onScanSuccess
          (decodedText) => {
            if (scannedRef.current) return
            scannedRef.current = true
            if (navigator.vibrate) navigator.vibrate(100)
            onScanRef.current(decodedText)
            // Stop scanning after success
            scanner.stop().catch(() => {})
          },
          // onScanFailure — fires every frame without a barcode, ignore
          () => {}
        )

        if (mounted) setStatus("scanning")
      } catch (err) {
        if (mounted) {
          setStatus("error")
          onError?.(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    // Small delay to ensure the container div is in the DOM
    const timer = setTimeout(start, 100)

    return () => {
      mounted = false
      clearTimeout(timer)
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current.clear()
        scannerRef.current = null
      }
    }
  }, [onError])

  const handleManualSubmit = () => {
    const code = manualInput.trim()
    if (code && !scannedRef.current) {
      scannedRef.current = true
      // Stop camera before firing callback
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
      }
      onScan(code)
    }
  }

  return (
    <div className="space-y-3">
      {/* html5-qrcode renders into this div */}
      <div
        id={containerId.current}
        className="w-full overflow-hidden rounded-lg"
        style={{ minHeight: 200 }}
      />

      <p className="text-center text-xs text-muted-foreground">
        {status === "loading" && "Starting camera..."}
        {status === "scanning" && "Point camera at barcode — hold steady"}
        {status === "error" && "Camera error — check permissions"}
      </p>

      {/* Manual entry — always available */}
      <div className="flex gap-2">
        <Input
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder="Or type barcode number..."
          className="flex-1 h-9 text-sm"
          onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
        />
        <Button size="sm" onClick={handleManualSubmit} disabled={!manualInput.trim()}>
          Go
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog wrapper
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
    if (hasScanned.current) return
    hasScanned.current = true
    onScan(barcode)
    onOpenChange(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) hasScanned.current = false
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
              onError={(err) => console.error("[BarcodeScannerDialog] scan error:", err)}
            />
            <Button variant="outline" className="w-full" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
