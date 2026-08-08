/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep @netlify/blobs as a runtime import (not bundled): on Netlify the
  // Blobs context env vars are injected at runtime, so the store must read
  // them fresh when getStore() is called.
  serverExternalPackages: ["@netlify/blobs"],
};

export default nextConfig;
