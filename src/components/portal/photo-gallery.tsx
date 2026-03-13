"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import Captions from "yet-another-react-lightbox/plugins/captions"
import type { PortalPhoto } from "@/actions/portal-data"

// yet-another-react-lightbox — loaded dynamically to avoid SSR issues.
// Only the Lightbox component itself needs dynamic — it accesses DOM APIs.
// Plugins are plain functions so they can be imported statically.
const Lightbox = dynamic(() => import("yet-another-react-lightbox"), { ssr: false })

interface PhotoGalleryProps {
  photos: PortalPhoto[]
}

/**
 * Formats a visit date ISO string into a readable label.
 * e.g. "2026-03-08T10:30:00Z" → "Mar 8, 2026"
 */
function formatVisitDate(isoDate: string): string {
  try {
    const date = new Date(isoDate)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  } catch {
    return isoDate
  }
}

/**
 * PhotoGallery — photo grid with lightbox for full-size viewing.
 *
 * Grid: 3 columns on desktop, 2 on mobile.
 * Each thumbnail shows visit date overlay at the bottom.
 * Clicking opens yet-another-react-lightbox for full-size view.
 *
 * Uses next/dynamic with ssr: false to avoid SSR issues with Lightbox component.
 * Captions plugin is a plain function — imported statically (no SSR issues).
 */
export function PhotoGallery({ photos }: PhotoGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }, [])

  if (photos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No photos yet.
      </p>
    )
  }

  const slides = photos.map((photo) => ({
    src: photo.url,
    title: photo.poolName,
    description: formatVisitDate(photo.visitDate),
  }))

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <button
            key={photo.url}
            type="button"
            onClick={() => openLightbox(index)}
            className="relative aspect-square overflow-hidden rounded-lg bg-muted cursor-pointer group focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            aria-label={`View photo from ${formatVisitDate(photo.visitDate)}`}
          >
            {/* Photo thumbnail */}
            <img
              src={photo.url}
              alt={`Service visit photo — ${photo.poolName} on ${formatVisitDate(photo.visitDate)}`}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              loading="lazy"
            />

            {/* Dark overlay with date */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
              <p className="text-[10px] text-white/90 leading-tight truncate">
                {formatVisitDate(photo.visitDate)}
              </p>
              {photo.poolName && photo.poolName !== "Pool" && (
                <p className="text-[9px] text-white/70 leading-tight truncate">
                  {photo.poolName}
                </p>
              )}
            </div>

            {/* Expand icon on hover */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4 text-white"
                  aria-hidden="true"
                >
                  <path
                    d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox — rendered client-side only via dynamic import */}
      {lightboxOpen && (
        <Lightbox
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          index={lightboxIndex}
          slides={slides}
          plugins={[Captions]}
          styles={{
            container: { backgroundColor: "rgba(0, 0, 0, 0.95)" },
          }}
        />
      )}
    </>
  )
}
