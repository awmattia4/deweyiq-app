import type { NextConfig } from "next"
import withSerwistInit from "@serwist/next"

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
})

const nextConfig: NextConfig = {
  turbopack: {},
  // @react-pdf/renderer uses Node.js APIs that are incompatible with
  // Next.js's edge runtime. Marking as serverExternalPackages prevents
  // "Component is not a constructor" errors during PDF generation.
  serverExternalPackages: ["@react-pdf/renderer"],
}

export default withSerwist(nextConfig)
