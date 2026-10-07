/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // runs src/instrumentation.ts on startup (recovers stuck jobs, cleans old files)
    instrumentationHook: true,
    serverComponentsExternalPackages: ["fluent-ffmpeg", "@ffmpeg-installer/ffmpeg", "ffmpeg-static", "formidable"],
  },
};

export default nextConfig;
