"use client"

/**
 * SignaturePad — Draw or type a legal e-signature for proposal approval.
 *
 * Two modes:
 *  - Draw: react-signature-canvas (touch + mouse). Clear + undo buttons.
 *  - Type: Text input rendered in a stylized cursive font. Preview before submitting.
 *
 * Both modes output a PNG data URL via onSign(dataUrl, name) callback.
 * Component also captures signed_name and signed_at (timestamp).
 *
 * Usage:
 *   <SignaturePad onSign={(dataUrl, name) => ...} disabled={false} />
 */

import React, { useRef, useState, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Dynamic import — react-signature-canvas requires a DOM (not SSR compatible)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactSignatureCanvas = dynamic<any>(() => import("react-signature-canvas"), {
  ssr: false,
  loading: () => (
    <div className="h-36 flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-400">
      Loading signature pad...
    </div>
  ),
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignatureResult {
  dataUrl: string
  signedName: string
  signedAt: string // ISO timestamp
}

interface SignaturePadProps {
  onSign: (result: SignatureResult) => void
  onClear?: () => void
  disabled?: boolean
  /** Pre-fill the name field (e.g. customer's name from proposal) */
  defaultName?: string
}

// ---------------------------------------------------------------------------
// Font loading helper — load Dancing Script for typed signature preview
// ---------------------------------------------------------------------------

const FONT_FAMILY = "Dancing Script"
const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap"

function useFontLoaded() {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (typeof document === "undefined") return
    // Inject the Google Font link tag if not already present
    if (!document.getElementById("dancing-script-font")) {
      const link = document.createElement("link")
      link.id = "dancing-script-font"
      link.rel = "stylesheet"
      link.href = FONT_URL
      document.head.appendChild(link)
      link.onload = () => setLoaded(true)
    } else {
      setLoaded(true)
    }
  }, [])
  return loaded
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SignaturePad({
  onSign,
  onClear,
  disabled = false,
  defaultName = "",
}: SignaturePadProps) {
  const [mode, setMode] = useState<"draw" | "type">("draw")
  const [typedName, setTypedName] = useState(defaultName)
  const [signedName, setSignedName] = useState(defaultName)
  const [hasSigned, setHasSigned] = useState(false)

  // react-signature-canvas ref (typed as any to avoid SSR type import issues)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasRef = useRef<any>(null)

  // Offscreen canvas for converting typed name to data URL
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)

  const fontLoaded = useFontLoaded()

  // ---------------------------------------------------------------------------
  // Draw mode handlers
  // ---------------------------------------------------------------------------

  const handleClearDraw = useCallback(() => {
    canvasRef.current?.clear()
    setHasSigned(false)
    onClear?.()
  }, [onClear])

  const handleUndoDraw = useCallback(() => {
    if (!canvasRef.current) return
    const data = canvasRef.current.toData()
    if (data && data.length > 0) {
      data.pop()
      canvasRef.current.fromData(data)
    }
    setHasSigned((canvasRef.current?.toData()?.length ?? 0) > 0)
  }, [])

  const handleDrawEnd = useCallback(() => {
    if (!canvasRef.current) return
    const isEmpty = canvasRef.current.isEmpty()
    setHasSigned(!isEmpty)
  }, [])

  const handleSubmitDraw = useCallback(() => {
    if (!canvasRef.current || canvasRef.current.isEmpty()) return
    const dataUrl = canvasRef.current.getTrimmedCanvas().toDataURL("image/png")
    onSign({ dataUrl, signedName, signedAt: new Date().toISOString() })
  }, [onSign, signedName])

  // ---------------------------------------------------------------------------
  // Type mode handlers
  // ---------------------------------------------------------------------------

  /**
   * Render the typed name onto an offscreen canvas using Dancing Script and
   * return a PNG data URL. Waits for the font to load first.
   */
  const buildTypedSignatureDataUrl = useCallback(
    (name: string): string => {
      // Create or reuse offscreen canvas
      if (!offscreenRef.current) {
        offscreenRef.current = document.createElement("canvas")
      }
      const canvas = offscreenRef.current
      canvas.width = 480
      canvas.height = 120

      const ctx = canvas.getContext("2d")!
      // White background
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Signature underline
      ctx.strokeStyle = "#94a3b8"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(20, 98)
      ctx.lineTo(460, 98)
      ctx.stroke()

      // Cursive text
      const font = fontLoaded ? `${FONT_FAMILY}, cursive` : "cursive"
      ctx.font = `52px "${font}"`
      ctx.fillStyle = "#0f172a"
      ctx.textBaseline = "alphabetic"

      // Center the text
      const metrics = ctx.measureText(name)
      const x = Math.max(20, (canvas.width - metrics.width) / 2)
      ctx.fillText(name, x, 85)

      return canvas.toDataURL("image/png")
    },
    [fontLoaded]
  )

  const handleSubmitType = useCallback(() => {
    if (!typedName.trim()) return
    const dataUrl = buildTypedSignatureDataUrl(typedName.trim())
    onSign({
      dataUrl,
      signedName: typedName.trim(),
      signedAt: new Date().toISOString(),
    })
    setHasSigned(true)
  }, [typedName, buildTypedSignatureDataUrl, onSign])

  // Update typed preview when name changes
  const typedPreviewDataUrl =
    typedName.trim() && fontLoaded
      ? buildTypedSignatureDataUrl(typedName.trim())
      : null

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Name field (both modes) */}
      <div className="space-y-1">
        <Label className="text-sm font-medium text-gray-700">
          Full legal name <span className="text-red-500">*</span>
        </Label>
        <Input
          value={signedName}
          onChange={(e) => {
            setSignedName(e.target.value)
            if (mode === "type") setTypedName(e.target.value)
          }}
          placeholder="Your full legal name"
          disabled={disabled}
          className="bg-white border-gray-300"
        />
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setMode("draw"); setHasSigned(false); onClear?.() }}
          className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
            mode === "draw"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
          }`}
          disabled={disabled}
        >
          Draw signature
        </button>
        <button
          type="button"
          onClick={() => { setMode("type"); setHasSigned(false); onClear?.() }}
          className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
            mode === "type"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
          }`}
          disabled={disabled}
        >
          Type signature
        </button>
      </div>

      {/* Draw mode */}
      {mode === "draw" && (
        <div className="space-y-2">
          <div className="relative rounded-lg border border-gray-300 bg-white overflow-hidden">
            <ReactSignatureCanvas
              ref={canvasRef}
              penColor="#0f172a"
              canvasProps={{
                className: "w-full",
                style: { height: "144px", touchAction: "none" },
              }}
              onEnd={handleDrawEnd}
            />
            {!hasSigned && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400 select-none">
                Sign here
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearDraw}
              disabled={disabled || !hasSigned}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUndoDraw}
              disabled={disabled || !hasSigned}
            >
              Undo
            </Button>
          </div>
          <Button
            type="button"
            className="w-full bg-slate-900 text-white hover:bg-slate-800"
            onClick={handleSubmitDraw}
            disabled={disabled || !hasSigned || !signedName.trim()}
          >
            Apply signature
          </Button>
        </div>
      )}

      {/* Type mode */}
      {mode === "type" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-sm font-medium text-gray-700">
              Type your name to sign
            </Label>
            <Input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Type your name"
              disabled={disabled}
              className="bg-white border-gray-300"
            />
          </div>

          {/* Typed preview */}
          {typedPreviewDataUrl ? (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500 mb-2">Signature preview:</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={typedPreviewDataUrl}
                alt="Signature preview"
                className="max-w-full h-auto"
                style={{ maxHeight: "80px" }}
              />
            </div>
          ) : (
            <div className="h-20 rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
              {typedName.trim() ? "Loading preview..." : "Type your name above to preview signature"}
            </div>
          )}

          <Button
            type="button"
            className="w-full bg-slate-900 text-white hover:bg-slate-800"
            onClick={handleSubmitType}
            disabled={disabled || !typedName.trim() || !signedName.trim() || !fontLoaded}
          >
            Apply signature
          </Button>
        </div>
      )}

      <p className="text-xs text-gray-500">
        By applying your signature, you confirm that you have read and agree to the terms above.
        This constitutes a legally binding electronic signature.
      </p>
    </div>
  )
}
