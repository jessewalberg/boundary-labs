const repoRoot = new URL("../..", import.meta.url).pathname;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  turbopack: {
    root: repoRoot
  }
};

export default nextConfig;
