import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@mastra/core", "@electric-sql/pglite", "@electric-sql/pglite-pgvector"],
  experimental: {
    externalDir: true,
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
