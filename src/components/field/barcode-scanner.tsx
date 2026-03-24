"use client"

/**
 * Phase 13: Barcode Scanner Component
 *
 * Uses the native BarcodeDetector API (Chrome 83+, Safari 17.2+) for fast,
 * reliable hardware-accelerated barcode detection. Falls back to manual
 * entry if BarcodeDetector is unavailable.
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

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// ---------------------------------------------------------------------------
// BarcodeDetector type (native browser API, not yet in TS lib)
// ---------------------------------------------------------------------------

interface DetectedBarcode {
  rawValue: string
  format: string
  boundingBox: DOMRectReadOnly
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats: string[] }): {
        detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>
      }
      getSupportedFormats: () => Promise<string[]>
    }
  }
}

// ---------------------------------------------------------------------------
// Raw scanner component (embed in any layout)
// ---------------------------------------------------------------------------

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onError?: (err: Error) => void
}

export function BarcodeScanner({ onScan, onError }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanLoopRef = useRef<number | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "scanning" | "no-api" | "error">("loading")
  const [manualInput, setManualInput] = useState("")
  const scannedRef = useRef(false)

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current)
      scanLoopRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    // Check for native BarcodeDetector
    if (!window.BarcodeDetector) {
      setStatus("no-api")
      return
    }

    let cancelled = false

    async function startScanning() {
      try {
        // Get camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        // Create detector with all common product barcode formats
        const supportedFormats = await window.BarcodeDetector!.getSupportedFormats()
        const wantedFormats = [
          "ean_13", "ean_8", "upc_a", "upc_e",
          "code_128", "code_39", "code_93",
          "itf", "qr_code", "data_matrix",
        ]
        const formats = wantedFormats.filter((f) => supportedFormats.includes(f))

        if (formats.length === 0) {
          setStatus("no-api")
          return
        }

        const detector = new window.BarcodeDetector!({ formats })

        setStatus("scanning")

        // Scan loop — detect barcodes every 250ms
        const scan = async () => {
          if (cancelled || scannedRef.current) return

          try {
            if (videoRef.current && videoRef.current.readyState >= 2) {
              const barcodes = await detector.detect(videoRef.current)
              if (barcodes.length > 0 && !scannedRef.current) {
                const code = barcodes[0].rawValue
                if (code) {
                  scannedRef.current = true
                  // Haptic feedback on mobile
                  if (navigator.vibrate) navigator.vibrate(100)
                  onScan(code)
                  return
                }
              }
            }
          } catch {
            // Detection frame failed — continue scanning
          }

          if (!cancelled && !scannedRef.current) {
            scanLoopRef.current = requestAnimationFrame(() => {
              setTimeout(scan, 250)
            })
          }
        }

        scan()
      } catch (err) {
        if (!cancelled) {
          setStatus("error")
          if (onError) onError(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    startScanning()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [onScan, onError, stopCamera])

  // Manual entry fallback
  const handleManualSubmit = () => {
    const code = manualInput.trim()
    if (code) {
      scannedRef.current = true
      onScan(code)
    }
  }

  // No native API — show manual entry only
  if (status === "no-api") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Camera barcode scanning isn&apos;t supported on this device. Enter the barcode manually:
        </p>
        <div className="flex gap-2">
          <Input
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Enter barcode number..."
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
            autoFocus
          />
          <Button onClick={handleManualSubmit} disabled={!manualInput.trim()}>
            Go
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black">
      {/* Camera video feed */}
      <video
        ref={videoRef}
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

      <style>{`
        @keyframes scan-line {
          0% { transform: translateY(-64px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(64px); opacity: 0; }
        }
      `}</style>

      <p className="absolute bottom-3 w-full text-center text-xs text-white/70">
        {status === "loading" && "Starting camera..."}
        {status === "scanning" && "Point camera at barcode — hold steady"}
        {status === "error" && "Camera error — check permissions"}
      </p>

      {/* Manual entry fallback always available below camera */}
      <div className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground text-center">Or enter manually:</p>
        <div className="flex gap-2">
          <Input
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Barcode number..."
            className="flex-1 h-9 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
          />
          <Button size="sm" onClick={handleManualSubmit} disabled={!manualInput.trim()}>
            Go
          </Button>
        </div>
      </div>
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
