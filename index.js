import FFMPEG from "fluent-ffmpeg";
const ffmpegPath = "D:\\Reference Data\\ffmpeg\\build\\ffmpeg\\bin\\ffmpeg.exe";
const ffprobePath =
  "D:\\Reference Data\\ffmpeg\\build\\ffmpeg\\bin\\ffprobe.exe";

const ffmpeg = new FFMPEG();
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
