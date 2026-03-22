import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["pdf-parse"],
  /**
   * Dev-only: allow Next.js to accept requests when the site is opened via a
   * Cloudflare quick tunnel (`*.trycloudflare.com`). Otherwise the dev server
   * rejects cross-origin dev routes (HMR, RSC) with 401 and the tunnel shows
   * a static-looking UI with broken interactivity.
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
   */
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
