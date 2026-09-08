/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the app to be served from any origin in production
  // CORS headers are handled by the backend; this just ensures
  // Next.js itself doesn't restrict cross-origin requests to its APIs.
  reactStrictMode: true,
};

module.exports = nextConfig;
