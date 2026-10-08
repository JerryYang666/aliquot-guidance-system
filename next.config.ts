import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Postgres driver loads optional native bindings; leave it unbundled.
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The aliquoter's screen needs the camera; nothing else does.
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
