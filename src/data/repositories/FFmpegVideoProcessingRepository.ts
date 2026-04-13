import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import type { IVideoProcessingRepository } from "@/domain/repositories/IVideoProcessingRepository";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export class FFmpegVideoProcessingRepository implements IVideoProcessingRepository {
  async extractAudio(videoPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .audioQuality(2)
        .save(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });
  }

  async mergeAudioIntoVideo(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    options?: { blurSubtitles?: boolean }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const outputOptions = options?.blurSubtitles
        ? [
            // To remove burned-in subtitles, we split the video, crop out the subtitle area,
            // apply a heavy "frosted glass" blur to it, and overlay it back on top!
            // Start at 60% height (higher up) and 12% tall to be precise
            "-filter_complex", "[0:v]split[v1][v2];[v1]crop=iw:ih*0.12:0:ih*0.60,boxblur=40[bottom];[v2][bottom]overlay=0:H*0.60[v]",
            "-map", "[v]",
            "-map", "1:a:0",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "aac"
          ]
        : [
            // Fast copy, no visual edits
            "-map 0:v:0",
            "-map 1:a:0",
            "-c:v copy",
            "-c:a aac"
          ];

      ffmpeg(videoPath)
        .input(audioPath)
        .outputOptions(outputOptions)
        .save(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });
  }

  async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration ?? 0);
      });
    });
  }
}
