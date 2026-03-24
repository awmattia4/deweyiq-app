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
          useBarCodeDetectorIfSupported: true,
        })
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 20,
            // Dynamic scan box — 80% of video width, maintains barcode aspect ratio
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => ({
              width: Math.floor(viewfinderWidth * 0.85),
              height: Math.floor(viewfinderHeight * 0.4),
            }),
          },
          (decodedText) => {
            if (scannedRef.current) return
            scannedRef.current = true
            if (navigator.vibrate) navigator.vibrate(100)
            onScanRef.current(decodedText)
          },
          () => {} // onScanFailure — fires every non-barcode frame, ignore
        )

        // Apply continuous autofocus AFTER camera starts — critical for close-up barcode scanning
        // html5-qrcode doesn't expose focus config, so we reach into the video track directly
        setTimeout(() => {
          try {
            const videoEl = document.querySelector(`#${containerId.current} video`) as HTMLVideoElement | null
            if (videoEl?.srcObject && videoEl.srcObject instanceof MediaStream) {
              const track = videoEl.srcObject.getVideoTracks()[0]
              if (track) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const caps = (track as any).getCapabilities?.()
                if (caps?.focusMode?.includes?.("continuous")) {
                  track.applyConstraints({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    advanced: [{ focusMode: "continuous" } as any],
                  }).catch(() => {})
                }
              }
            }
          } catch {
            // Focus not supported on this device — scanner still works, just no macro focus
          }
        }, 500)

        if (mounted) setStatus("scanning")
      } catch (err) {
        if (mounted) {
          setStatus("error")
          onError?.(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    const timer = setTimeout(start, 150)

    return () => {
      mounted = false
      clearTimeout(timer)
      const s = scannerRef.current
      scannerRef.current = null
      if (s) {
        // Must fully stop camera to release it on iOS (Dynamic Island indicator)
        s.stop()
          .then(() => {
            try { s.clear() } catch {}
          })
          .catch(() => {
            try { s.clear() } catch {}
          })
      }
    }
  }, [onError])

  const handleManualSubmit = () => {
    const code = manualInput.trim()
    if (code && !scannedRef.current) {
      scannedRef.current = true
      onScan(code)
    }
  }

  return (
    <div className="space-y-3">
      <div
        id={containerId.current}
        className="w-full overflow-hidden rounded-lg bg-black"
        style={{ minHeight: 250 }}
      />

      <p className="text-center text-xs text-muted-foreground">
        {status === "loading" && "Starting camera..."}
        {status === "scanning" && "Point camera at barcode — hold steady"}
        {status === "error" && "Camera error — check permissions or try manual entry"}
      </p>

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
// Dialog wrapper — for standalone use (not inside another Dialog)
// ---------------------------------------------------------------------------

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
