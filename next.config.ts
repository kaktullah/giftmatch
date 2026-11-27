import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prompts are read from /prompts at runtime; make sure they ship with the
  // server bundle on hosts like Vercel.
  outputFileTracingIncludes: {
    "/api/recommend": ["./prompts/**/*"],
  },
};

export default nextConfig;
