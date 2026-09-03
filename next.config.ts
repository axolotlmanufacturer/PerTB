import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // No images anywhere on this site (brief §3, "Images: None"). Amazon requires
  // product images be served from their CDN, and they add a compliance surface
  // for no conversion benefit. Keeping the optimiser off makes an accidental
  // <Image> fail loudly rather than quietly work.
  images: { unoptimized: true },

  typescript: {
    // A type error must fail the build. Never set this to true.
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },

  experimental: {
    // capacityBytes is a BigInt in the domain model (trap 2). Nothing here
    // changes that; it is called out so the next person does not go looking
    // for a serialisation setting that does not exist. Stringify at boundaries.
  },
};

export default nextConfig;
