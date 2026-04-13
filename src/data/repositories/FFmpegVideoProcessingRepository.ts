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
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .input(audioPath)
        // Map video stream from input 0, audio stream from input 1
        // (Replacing the original audio completely to prevent hearing the original language)
        .outputOptions([
          "-map 0:v:0",
          "-map 1:a:0",
          "-c:v copy",
          "-c:a aac"
        ])
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
