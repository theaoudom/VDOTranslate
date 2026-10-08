import { withWorkflow } from "workflow/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // runs src/instrumentation.ts on startup (local maintenance; Vercel uses a cron instead)
    instrumentationHook: true,
    serverComponentsExternalPackages: ["fluent-ffmpeg", "@ffmpeg-installer/ffmpeg", "ffmpeg-static", "formidable"],
    // ffmpeg and the subtitle fonts are read from disk at run time, so ship them with the functions
    outputFileTracingIncludes: {
      "/**/*": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/ffmpeg.exe", "./assets/fonts/**/*"],
    },
  },
};

export default withWorkflow(nextConfig);
