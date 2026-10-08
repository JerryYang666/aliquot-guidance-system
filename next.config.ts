import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Parsed on the server only; bundling them gains nothing.
  serverExternalPackages: ["exceljs", "pg"],
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
