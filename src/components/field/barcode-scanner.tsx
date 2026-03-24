"use client"

/**
 * Phase 13: Barcode Scanner Component
 *
 * Two-tier strategy:
 * 1. Native BarcodeDetector API (Chrome desktop/Android) — fast, hardware-accelerated
 * 2. @zxing/library fallback (iOS PWA, older browsers) — zxing manages its own video stream
 * 3. Manual entry always available
 *
 * Load via next/dynamic with ssr: false.
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
// BarcodeDetector type (native browser API)
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const zxingReaderRef = useRef<{ reset: () => void } | null>(null)
  const [status, setStatus] = useState<"loading" | "scanning" | "error">("loading")
  const [manualInput, setManualInput] = useState("")
  const scannedRef = useRef(false)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (zxingReaderRef.current) {
      try { zxingReaderRef.current.reset() } catch {}
      zxingReaderRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    scannedRef.current = false

    async function tryNativeDetector(): Promise<boolean> {
      if (!window.BarcodeDetector) return false

      try {
        const supported = await window.BarcodeDetector.getSupportedFormats()
        const wanted = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"]
        const formats = wanted.filter((f) => supported.includes(f))
        if (formats.length === 0) return false

        // Get camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return true }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        const detector = new window.BarcodeDetector!({ formats })
        setStatus("scanning")

        // Scan loop
        const scan = async () => {
          if (cancelled || scannedRef.current) return
          try {
            if (videoRef.current && videoRef.current.readyState >= 2) {
              const barcodes = await detector.detect(videoRef.current)
              if (barcodes.length > 0 && barcodes[0].rawValue && !scannedRef.current) {
                scannedRef.current = true
                if (navigator.vibrate) navigator.vibrate(100)
                onScanRef.current(barcodes[0].rawValue)
                return
              }
            }
          } catch {}
          if (!cancelled && !scannedRef.current) {
            timerRef.current = setTimeout(scan, 250)
          }
        }
        scan()
        return true
      } catch {
        return false
      }
    }

    async function useZxingFallback() {
      try {
        const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import("@zxing/library")
        if (cancelled) return

        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE, BarcodeFormat.ITF,
        ])
        hints.set(DecodeHintType.TRY_HARDER, true)

        const reader = new BrowserMultiFormatReader(hints)
        zxingReaderRef.current = reader

        // Let zxing manage the video element entirely — it requests its own stream
        // This is the ONLY reliable way on iOS PWA
        await reader.decodeFromVideoDevice(
          undefined as unknown as string,  // null = default camera
          videoRef.current!,
          (result) => {
            if (cancelled || scannedRef.current) return
            if (result) {
              const text = result.getText()
              if (text) {
                scannedRef.current = true
                if (navigator.vibrate) navigator.vibrate(100)
                onScanRef.current(text)
                try { reader.reset() } catch {}
              }
            }
            // No result = no barcode in this frame, zxing will retry automatically
          }
        )

        if (!cancelled) setStatus("scanning")
      } catch (err) {
        if (!cancelled) {
          setStatus("error")
          onError?.(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    async function start() {
      // Try native first, fall back to zxing
      const nativeWorked = await tryNativeDetector()
      if (!nativeWorked && !cancelled) {
        await useZxingFallback()
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
      <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ minHeight: 200 }}>
        <video
          ref={videoRef}
          className="w-full object-cover"
          style={{ maxHeight: "60dvh" }}
          autoPlay
          playsInline
          muted
        />

        {/* Scanning overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <div className="relative h-40 w-64">
            <div className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-primary" />
            <div className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-primary" />
            <div className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-primary" />
            <div className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-primary" />
            <div
              className="absolute inset-x-0 h-0.5 bg-primary/70"
              style={{ animation: "scan-line 2s ease-in-out infinite", top: "50%" }}
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
