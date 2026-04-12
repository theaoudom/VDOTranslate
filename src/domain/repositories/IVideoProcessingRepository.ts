export interface IVideoProcessingRepository {
  extractAudio(videoPath: string, outputPath: string): Promise<void>;
  mergeAudioIntoVideo(videoPath: string, audioPath: string, outputPath: string): Promise<void>;
  getVideoDuration(videoPath: string): Promise<number>;
}
