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
  webpack(config) {
    // @svar-ui/react-gantt exports map references ./dist/index.cjs.js
    // but the file is actually ./dist/index.cjs (missing .js extension).
    // Override the module resolution to point at the actual ES module bundle.
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string>),
      "@svar-ui/react-gantt": require("path").resolve(
        __dirname,
        "node_modules/@svar-ui/react-gantt/dist/index.es.js"
      ),
      "@svar-ui/react-gantt/style.css": require("path").resolve(
        __dirname,
        "node_modules/@svar-ui/react-gantt/dist/index.css"
      ),
    }
    return config
  },
}

export default withSerwist(nextConfig)
