"use client"

import { useState, useTransition, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { updateOrgName, updateOrgLogo, createLogoUploadUrl, updateOrgSettings, createFaviconUploadUrl } from "@/actions/company-settings"
import { AddressAutocomplete } from "@/components/ui/address-autocomplete"
import { UploadIcon, TrashIcon, ImageIcon, Loader2Icon, NavigationIcon, PaletteIcon } from "lucide-react"

interface CompanyProfileSettingsProps {
  orgName: string
  logoUrl: string | null
  homeBaseAddress: string | null
  homeBaseLat: number | null
  homeBaseLng: number | null
  brandColor: string | null
  faviconPath: string | null
  portalWelcomeMessage: string | null
  orgSlug: string | null
}

export function CompanyProfileSettings({
  orgName,
  logoUrl,
  homeBaseAddress,
  homeBaseLat,
  homeBaseLng,
  brandColor: initialBrandColor,
  faviconPath: initialFaviconPath,
  portalWelcomeMessage: initialWelcomeMessage,
  orgSlug: initialOrgSlug,
}: CompanyProfileSettingsProps) {
  const [name, setName] = useState(orgName)
  const [nameError, setNameError] = useState<string | null>(null)
  const [isNamePending, startNameTransition] = useTransition()

  const [logo, setLogo] = useState<string | null>(logoUrl)
  const [isUploading, setIsUploading] = useState(false)
  const [isRemoving, startRemoveTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [homeAddress, setHomeAddress] = useState(homeBaseAddress ?? "")
  const [homeCoords, setHomeCoords] = useState<{ lat: number; lng: number } | null>(
    homeBaseLat != null && homeBaseLng != null ? { lat: homeBaseLat, lng: homeBaseLng } : null
  )
  const [isHomePending, startHomeTransition] = useTransition()

  // Portal branding state
  const [brandColor, setBrandColor] = useState(initialBrandColor ?? "#1e9cc0")
  const [faviconPath, setFaviconPath] = useState<string | null>(initialFaviconPath)
  const [isFaviconUploading, setIsFaviconUploading] = useState(false)
  const faviconInputRef = useRef<HTMLInputElement>(null)
  const [welcomeMessage, setWelcomeMessage] = useState(initialWelcomeMessage ?? "")
  const [orgSlug, setOrgSlug] = useState(initialOrgSlug ?? "")
  const [isPortalBrandingPending, startPortalBrandingTransition] = useTransition()

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setNameError(null)

    if (!name.trim()) {
      setNameError("Company name cannot be empty.")
      return
    }
    if (name.trim() === orgName) return

    startNameTransition(async () => {
      const result = await updateOrgName(name.trim())
      if (result.success) {
        toast.success("Company name saved")
      } else {
        setNameError(result.error ?? "Failed to save.")
      }
    })
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB")
      return
    }

    setIsUploading(true)
    try {
      const ext = file.name.split(".").pop() ?? "png"
      const fileName = `logo.${ext}`
      const result = await createLogoUploadUrl(fileName)

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      const uploadRes = await fetch(result.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })

      if (!uploadRes.ok) {
        toast.error("Upload failed")
        return
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/company-assets/${result.path}`

      const saveResult = await updateOrgLogo(publicUrl)
      if (saveResult.success) {
        setLogo(publicUrl)
        toast.success("Logo uploaded")
      } else {
        toast.error(saveResult.error ?? "Failed to save logo")
      }
    } catch {
      toast.error("Upload failed")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleRemoveLogo = () => {
    startRemoveTransition(async () => {
      const result = await updateOrgLogo(null)
      if (result.success) {
        setLogo(null)
        toast.success("Logo removed")
      } else {
        toast.error(result.error ?? "Failed to remove logo")
      }
    })
  }

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ["image/png", "image/x-icon", "image/vnd.microsoft.icon"]
    if (!allowedTypes.includes(file.type) && !file.name.endsWith(".ico")) {
      toast.error("Please select a PNG or ICO file")
      return
    }
    if (file.size > 256 * 1024) {
      toast.error("Favicon must be under 256KB")
      return
    }

    setIsFaviconUploading(true)
    try {
      const ext = file.name.split(".").pop() ?? "png"
      const result = await createFaviconUploadUrl(`favicon.${ext}`)

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      const uploadRes = await fetch(result.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/png" },
        body: file,
      })

      if (!uploadRes.ok) {
        toast.error("Upload failed")
        return
      }

      const saveResult = await updateOrgSettings({ favicon_path: result.path })
      if (saveResult.success) {
        setFaviconPath(result.path)
        toast.success("Favicon uploaded")
      } else {
        toast.error(saveResult.error ?? "Failed to save favicon")
      }
    } catch {
      toast.error("Upload failed")
    } finally {
      setIsFaviconUploading(false)
      if (faviconInputRef.current) faviconInputRef.current.value = ""
    }
  }

  const handlePortalBrandingSave = () => {
    startPortalBrandingTransition(async () => {
      const result = await updateOrgSettings({
        brand_color: brandColor.trim() || null,
        portal_welcome_message: welcomeMessage.trim() || null,
      })
      if (result.success) {
        toast.success("Portal branding saved")
      } else {
        toast.error(result.error ?? "Failed to save portal branding")
      }
    })
  }

  const handleRemoveFavicon = () => {
    startPortalBrandingTransition(async () => {
      const result = await updateOrgSettings({ favicon_path: null })
      if (result.success) {
        setFaviconPath(null)
        toast.success("Favicon removed")
      } else {
        toast.error(result.error ?? "Failed to remove favicon")
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Logo upload */}
      <div className="flex flex-col gap-2">
        <Label>Company logo</Label>
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-xl border border-border/60 bg-muted/10 overflow-hidden shrink-0">
            {logo ? (
              <img src={logo} alt="Company logo" className="w-full h-full object-contain" />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="cursor-pointer"
              >
                {isUploading ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadIcon className="h-4 w-4" />
                )}
                {isUploading ? "Uploading..." : logo ? "Change" : "Upload"}
              </Button>

              {logo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveLogo}
                  disabled={isRemoving}
                  className="text-destructive hover:text-destructive cursor-pointer"
                >
                  <TrashIcon className="h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, or WebP. Max 2MB. Shown in service reports.
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleLogoUpload}
        />
      </div>

      {/* Company name */}
      <form onSubmit={handleNameSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-name">Company name</Label>
          <Input
            id="company-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isNamePending}
            placeholder="Your company name"
            className="max-w-sm"
          />
          <p className="text-xs text-muted-foreground">
            Shown in service reports and customer emails.
          </p>
        </div>

        {nameError && (
          <p className="text-sm text-destructive" role="alert">{nameError}</p>
        )}

        <div className="flex justify-start">
          <Button
            type="submit"
            disabled={isNamePending || name.trim() === orgName || !name.trim()}
            size="sm"
            className="cursor-pointer"
          >
            {isNamePending ? "Saving..." : "Save Name"}
          </Button>
        </div>
      </form>

      {/* Home base address */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="flex items-center gap-1.5">
            <NavigationIcon className="h-4 w-4" />
            Home Base / Office Address
          </Label>
          <AddressAutocomplete
            id="home-base-address"
            value={homeAddress}
            onChange={(address, coords) => {
              setHomeAddress(address)
              if (coords) setHomeCoords(coords)
            }}
            placeholder="Enter your office or starting address"
            disabled={isHomePending}
            className="max-w-sm"
          />
          <p className="text-xs text-muted-foreground">
            Route optimization will start and end routes from this address.
          </p>
        </div>

        <div className="flex justify-start">
          <Button
            type="button"
            size="sm"
            disabled={isHomePending || (!homeAddress.trim() && !homeBaseAddress)}
            className="cursor-pointer"
            onClick={() => {
              startHomeTransition(async () => {
                const result = await updateOrgSettings({
                  home_base_address: homeAddress.trim() || null,
                  home_base_lat: homeCoords?.lat ?? null,
                  home_base_lng: homeCoords?.lng ?? null,
                })
                if (result.success) {
                  toast.success("Home base saved")
                } else {
                  toast.error(result.error ?? "Failed to save home base")
                }
              })
            }}
          >
            {isHomePending ? "Saving..." : "Save Home Base"}
          </Button>
        </div>
      </div>

      {/* Portal branding */}
      <div className="flex flex-col gap-4 pt-2 border-t border-border/40">
        <div className="flex items-center gap-2">
          <PaletteIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Portal Branding</span>
        </div>

        {/* Brand color */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-color">Brand color</Label>
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-md border border-border shrink-0"
              style={{ backgroundColor: brandColor || "#1e9cc0" }}
            />
            <Input
              id="brand-color"
              type="text"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              placeholder="#1e9cc0"
              className="max-w-[160px] font-mono text-sm"
              disabled={isPortalBrandingPending}
            />
            <Input
              type="color"
              value={brandColor || "#1e9cc0"}
              onChange={(e) => setBrandColor(e.target.value)}
              className="w-10 h-8 p-0.5 cursor-pointer rounded-md border border-border"
              title="Pick color"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Used as the accent color throughout the customer portal.
          </p>
        </div>

        {/* Favicon upload */}
        <div className="flex flex-col gap-2">
          <Label>Portal favicon</Label>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg border border-border/60 bg-muted/10 overflow-hidden shrink-0">
              {faviconPath ? (
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => faviconInputRef.current?.click()}
                  disabled={isFaviconUploading}
                  className="cursor-pointer"
                >
                  {isFaviconUploading ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <UploadIcon className="h-4 w-4" />
                  )}
                  {isFaviconUploading ? "Uploading..." : faviconPath ? "Change" : "Upload"}
                </Button>
                {faviconPath && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFavicon}
                    disabled={isPortalBrandingPending}
                    className="text-destructive hover:text-destructive cursor-pointer"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                PNG or ICO, max 64x64px. Shown in browser tab for portal visitors.
              </p>
            </div>
          </div>
          <input
            ref={faviconInputRef}
            type="file"
            accept="image/png,image/x-icon,.ico"
            className="hidden"
            onChange={handleFaviconUpload}
          />
        </div>

        {/* Portal welcome message */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="welcome-message">Welcome message</Label>
          <Textarea
            id="welcome-message"
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
            placeholder="Welcome to your pool portal!"
            className="max-w-sm resize-none"
            rows={3}
            disabled={isPortalBrandingPending}
          />
          <p className="text-xs text-muted-foreground">
            Shown at the top of the portal home page. Leave blank to use the default.
          </p>
        </div>

        {/* Company subdomain preview */}
        {(orgSlug || initialOrgSlug) && (
          <div className="flex flex-col gap-1.5">
            <Label>Portal URL</Label>
            <div className="flex items-center gap-2">
              <code className="text-sm bg-muted/50 px-2 py-1 rounded-md font-mono text-muted-foreground">
                {orgSlug || initialOrgSlug}.poolco.app
              </code>
            </div>
            <p className="text-xs text-muted-foreground">
              Your customers can access the portal at this address.
            </p>
          </div>
        )}

        <div className="flex justify-start">
          <Button
            type="button"
            size="sm"
            disabled={isPortalBrandingPending}
            className="cursor-pointer"
            onClick={handlePortalBrandingSave}
          >
            {isPortalBrandingPending ? "Saving..." : "Save Portal Branding"}
          </Button>
        </div>
      </div>
    </div>
  )
}
