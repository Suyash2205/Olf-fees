import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevents googleapis from being bundled into edge runtime
  serverExternalPackages: ["googleapis", "google-auth-library"],
};

export default nextConfig;
