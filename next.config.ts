import type { NextConfig } from "next";

const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
const nextConfig: NextConfig = {
  agentRules: false,
  images: {
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    remotePatterns: storageUrl ? [{
      protocol: storageUrl.protocol === "https:" ? "https" : "http",
      hostname: storageUrl.hostname,
      port: storageUrl.port,
      pathname: "/storage/v1/object/public/event-covers/**",
      search: "",
    }] : [],
  },
};

export default nextConfig;
