const repoRoot = new URL("../..", import.meta.url).pathname;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root: repoRoot
  }
};

export default nextConfig;
