"use client"

/**
 * Phase 13: Barcode Scanner Component
 *
 * Uses `barcode-detector` polyfill which provides the native BarcodeDetector API
 * everywhere — uses hardware-accelerated native API on Chrome/Android/Safari 17.2+,
 * and a reliable ZXing-based polyfill on older browsers and iOS PWA.
 *
 * This is the "Scan & Go" style live scanner — real-time video feed with
 * frame-by-frame barcode detection.
 *
 * Load via next/dynamic with ssr: false.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { BarcodeDetector } from "barcode-detector"
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const [status, setStatus] = useState<"loading" | "scanning" | "error">("loading")
  const [manualInput, setManualInput] = useState("")
  const scannedRef = useRef(false)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    scannedRef.current = false

    async function start() {
      try {
        // Request high-resolution rear camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) return

        video.srcObject = stream
        await video.play()

        // Apply continuous autofocus
        const track = stream.getVideoTracks()[0]
        if (track) {
          try {
            await track.applyConstraints({
              // @ts-expect-error — focusMode is valid but not in TS types
              advanced: [{ focusMode: "continuous" }],
            })
          } catch {
            // Not supported — fine
          }
        }

        // Create barcode detector with all common formats
        const detector = new BarcodeDetector({
          formats: [
            "upc_a", "upc_e", "ean_13", "ean_8",
            "code_128", "code_39", "code_93",
            "itf", "qr_code",
          ],
        })

        setStatus("scanning")

        // Scan loop — detect barcodes from video frames
        let lastScanTime = 0
        const SCAN_INTERVAL = 150 // ms between scans

        function scanFrame(timestamp: number) {
          if (cancelled || scannedRef.current) return

          if (timestamp - lastScanTime >= SCAN_INTERVAL) {
            lastScanTime = timestamp

            if (video!.readyState >= 2) {
              detector.detect(video!).then((barcodes) => {
                if (cancelled || scannedRef.current) return
                if (barcodes.length > 0 && barcodes[0].rawValue) {
                  scannedRef.current = true
                  if (navigator.vibrate) navigator.vibrate(100)
                  onScanRef.current(barcodes[0].rawValue)
                  return
                }
              }).catch(() => {
                // Detection failed on this frame — continue
              })
            }
          }

          if (!cancelled && !scannedRef.current) {
            rafRef.current = requestAnimationFrame(scanFrame)
          }
        }

        rafRef.current = requestAnimationFrame(scanFrame)
      } catch (err) {
        if (!cancelled) {
          setStatus("error")
          onError?.(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    start()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [cleanup, onError])

  const handleManualSubmit = () => {
    const code = manualInput.trim()
    if (code && !scannedRef.current) {
      scannedRef.current = true
      onScan(code)
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ minHeight: 250 }}>
        <video
          ref={videoRef}
          className="w-full object-cover"
          style={{ maxHeight: "55dvh" }}
          autoPlay
          playsInline
          muted
        />

        {/* Scan guide overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <div className="relative" style={{ width: "80%", height: "30%" }}>
            <div className="absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2 border-white/70 rounded-tl-sm" />
            <div className="absolute right-0 top-0 h-6 w-6 border-r-2 border-t-2 border-white/70 rounded-tr-sm" />
            <div className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-white/70 rounded-bl-sm" />
            <div className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-white/70 rounded-br-sm" />
          </div>
        </div>

        <p className="absolute bottom-3 w-full text-center text-xs text-white/70">
          {status === "loading" && "Starting camera..."}
          {status === "scanning" && "Align barcode within the frame"}
          {status === "error" && "Camera error — try manual entry"}
        </p>
      </div>

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
