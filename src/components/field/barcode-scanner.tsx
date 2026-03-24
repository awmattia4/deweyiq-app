"use client"

/**
 * Phase 13: Barcode Scanner Component
 *
 * Uses html5-qrcode — supports all barcode formats:
 * UPC-A, UPC-E, EAN-13, EAN-8, Code 128, Code 39, ITF, QR, DataMatrix.
 *
 * Load via next/dynamic with ssr: false.
 */

import { useEffect, useRef, useState } from "react"
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode"
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
  const containerRef = useRef<HTMLDivElement>(null)
  const containerId = useRef(`scanner-${Math.random().toString(36).slice(2, 8)}`)
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
        const scanner = new Html5Qrcode(containerId.current, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        })
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.7778,
          },
          (decodedText) => {
            if (scannedRef.current) return
            scannedRef.current = true
            if (navigator.vibrate) navigator.vibrate(100)
            // Don't call scanner.stop() here — it mutates the DOM and crashes React.
            // The parent will set showScanner=false, unmounting this component,
            // which triggers the cleanup effect that calls stop().
            onScanRef.current(decodedText)
          },
          () => {} // onScanFailure — ignore (fires every non-barcode frame)
        )

        if (mounted) setStatus("scanning")
      } catch (err) {
        if (mounted) {
          setStatus("error")
          onError?.(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    // Delay to ensure DOM container is rendered
    const timer = setTimeout(start, 150)

    return () => {
      mounted = false
      clearTimeout(timer)
      const s = scannerRef.current
      if (s) {
        // Only stop — do NOT call s.clear() as it removes DOM nodes that React manages
        s.stop().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [onError])

  const handleManualSubmit = () => {
    const code = manualInput.trim()
    if (code && !scannedRef.current) {
      scannedRef.current = true
      // Don't stop scanner here — cleanup effect handles it on unmount
      onScan(code)
    }
  }

  return (
    <div className="space-y-3">
      {/* html5-qrcode renders into this div */}
      <div
        ref={containerRef}
        id={containerId.current}
        className="w-full overflow-hidden rounded-lg bg-black"
        style={{ minHeight: 250 }}
      />

      <p className="text-center text-xs text-muted-foreground">
        {status === "loading" && "Starting camera..."}
        {status === "scanning" && "Point camera at barcode — hold steady"}
        {status === "error" && "Camera error — check permissions or try manual entry"}
      </p>

      {/* Manual entry */}
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
