/** @type {import('next').NextConfig} */
const nextConfig = {
  // In a workspace, point Turbopack at this app dir (silences the monorepo-root warning).
  turbopack: { root: import.meta.dirname },
  // @neighborly/shared ships raw .ts (types only); let Next compile it.
  transpilePackages: ['@neighborly/shared'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },
};

export default nextConfig;
