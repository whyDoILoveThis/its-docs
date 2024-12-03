import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    domains: ["firebasestorage.googleapis.com", 'img.clerk.com',], // Add the Clerk image domain here
  },
};

export default nextConfig;
