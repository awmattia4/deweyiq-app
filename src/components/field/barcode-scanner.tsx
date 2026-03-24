"use client"

/**
 * Phase 13: Barcode Scanner Component
 *
 * Strategy:
 * 1. Try native BarcodeDetector API (Chrome 83+, Safari 17.2+) — fast, hardware-accelerated
 * 2. Fall back to @zxing/library JS decoder (works everywhere including iOS PWA WebView)
 * 3. Manual entry always available as last resort
 *
 * IMPORTANT: Load via next/dynamic with ssr: false.
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
// Raw scanner component
// ---------------------------------------------------------------------------

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onError?: (err: Error) => void
}

export function BarcodeScanner({ onScan, onError }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState<"loading" | "scanning" | "error">("loading")
  const [manualInput, setManualInput] = useState("")
  const scannedRef = useRef(false)

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) {
      clearTimeout(scanLoopRef.current)
      scanLoopRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        // 1. Get camera stream
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

        setStatus("scanning")

        // 2. Try native BarcodeDetector first
        if (window.BarcodeDetector) {
          try {
            const supported = await window.BarcodeDetector.getSupportedFormats()
            const wanted = [
              "ean_13", "ean_8", "upc_a", "upc_e",
              "code_128", "code_39", "code_93",
              "itf", "qr_code", "data_matrix",
            ]
            const formats = wanted.filter((f) => supported.includes(f))

            if (formats.length > 0) {
              const detector = new window.BarcodeDetector!({ formats })
              startNativeScan(detector)
              return
            }
          } catch {
            // BarcodeDetector failed — fall through to zxing
          }
        }

        // 3. Fallback: zxing JS decoder
        startZxingScan()
      } catch (err) {
        if (!cancelled) {
          setStatus("error")
          onError?.(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    function startNativeScan(detector: InstanceType<NonNullable<typeof window.BarcodeDetector>>) {
      const scan = async () => {
        if (cancelled || scannedRef.current) return

        try {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            const barcodes = await detector.detect(videoRef.current)
            if (barcodes.length > 0 && barcodes[0].rawValue && !scannedRef.current) {
              scannedRef.current = true
              if (navigator.vibrate) navigator.vibrate(100)
              onScan(barcodes[0].rawValue)
              return
            }
          }
        } catch {
          // Frame detection failed — continue
        }

        if (!cancelled && !scannedRef.current) {
          scanLoopRef.current = setTimeout(scan, 250)
        }
      }
      scan()
    }

    async function startZxingScan() {
      // Dynamic import — only load zxing when needed (~200KB)
      const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import("@zxing/library")

      if (cancelled || scannedRef.current) return
      if (!videoRef.current || !streamRef.current) return

      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.ITF,
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)

      const reader = new BrowserMultiFormatReader(hints)

      // Use decodeFromStream to reuse existing camera stream (don't request a new one)
      try {
        reader.decodeFromStream(
          streamRef.current,
          videoRef.current,
          (result) => {
            if (cancelled || scannedRef.current) return
            if (result) {
              const text = result.getText()
              if (text) {
                scannedRef.current = true
                reader.reset()
                if (navigator.vibrate) navigator.vibrate(100)
                onScan(text)
              }
            }
          }
        )
      } catch {
        // zxing setup failed — manual entry still available
      }
    }

    start()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [onScan, onError, stopCamera])

  const handleManualSubmit = () => {
    const code = manualInput.trim()
    if (code) {
      scannedRef.current = true
      onScan(code)
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          className="w-full object-cover"
          style={{ maxHeight: "60dvh" }}
          autoPlay
          playsInline
          muted
        />

        {/* Scanning overlay */}
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          <div className="relative h-40 w-64">
            <div className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-primary" />
            <div className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-primary" />
            <div className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-primary" />
            <div className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-primary" />

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
      </div>

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
