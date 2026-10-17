import { withWorkflow } from "workflow/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // the deployed version: open pages compare it with /api/version to know when to reload
    APP_VERSION: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "dev",
  },
  experimental: {
    // runs src/instrumentation.ts on startup (local maintenance; Vercel uses a cron instead)
    instrumentationHook: true,
    serverComponentsExternalPackages: ["fluent-ffmpeg", "@ffmpeg-installer/ffmpeg", "ffmpeg-static", "formidable"],
    // ffmpeg and the subtitle fonts are read from disk at run time, so ship them with the functions
    outputFileTracingIncludes: {
      "/**/*": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/ffmpeg.exe", "./assets/**/*"],
    },
  },
};

export default withWorkflow(nextConfig);
