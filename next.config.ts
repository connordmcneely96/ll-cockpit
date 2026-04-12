import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Required for Cloudflare Workers compatibility
  experimental: {},
  // Disable image optimization (not supported in Cloudflare Workers without paid plan)
  images: {
    unoptimized: true,
  },
}

export default nextConfig
