export interface IVideoProcessingRepository {
  extractAudio(videoPath: string, outputPath: string): Promise<void>;
  mergeAudioIntoVideo(videoPath: string, audioPath: string, outputPath: string, options?: { blurSubtitles?: boolean }): Promise<void>;
  getVideoDuration(videoPath: string): Promise<number>;
}
