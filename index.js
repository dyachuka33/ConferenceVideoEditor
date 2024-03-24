const FFMPEG = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");

const ffmpegPath = "D:\\Reference Data\\ffmpeg\\build\\ffmpeg\\bin\\ffmpeg.exe";
const ffprobePath =
  "D:\\Reference Data\\ffmpeg\\build\\ffmpeg\\bin\\ffprobe.exe";
const inputDir = "./test/";
const tempDir = "./temp/";
const tempIndividualDir = tempDir + "individual/";
const tempIndividualClipsDir = tempIndividualDir + "clips/";
const tempMainDir = tempDir + "main/";
const tempMainClipsDir = tempMainDir + "clips/";
const outputDir = "./output/";

const config = require("./test/conference_poc.json");

const layout = {
  videoRectangle: {
    x: 0,
    y: 0,
    width: 1440,
    height: 1080,
  },
  chatRectangle: {
    x: 1440,
    y: 0,
    width: 480,
    height: 1080,
  },
  mainStreamRectangle: {
    x: 360,
    y: 30,
    width: 720,
    height: 540,
  },
  individualStreamsRectangle: {
    x: 0,
    y: 600,
    width: 1440,
    height: 480,
    singleWidth: 288,
    signleHeight: 240,
  },
};

const getIndividualStreamRectangle = (idx) => {
  if (idx < 5) {
    y = layout.individualStreamsRectangle.y;
    x = idx * layout.individualStreamsRectangle.singleWidth;
    return {
      x,
      y,
      width: layout.individualStreamsRectangle.singleWidth,
      height: layout.individualStreamsRectangle.signleHeight,
    };
  } else {
    idx -= 5;
    y =
      layout.individualStreamsRectangle.y +
      layout.individualStreamsRectangle.signleHeight;
    x = idx * layout.individualStreamsRectangle.singleWidth;
    return {
      x,
      y,
      width: layout.individualStreamsRectangle.singleWidth,
      height: layout.individualStreamsRectangle.signleHeight,
    };
  }
};

const sleep = (delay) =>
  new Promise((resolve) => {
    setTimeout(() => resolve(), delay);
  });

const buildVideoClipsForIndividualStream = async (participant, config) => {
  let clipNo = 1;
  if (participant.sessions[0].join > config.scheduled_start) {
    const duration = participant.sessions[0].join - config.scheduled_start;
    await buildVideoClipForIndividualStream(
      participant,
      config,
      0,
      clipNo,
      3,
      duration
    );
    clipNo++;
  }
  let sessionNo = 0;
  for (let session of participant.sessions) {
    //make a clip for session
    if (session.video) {
      await buildVideoClipForIndividualStream(
        participant,
        config,
        sessionNo,
        clipNo,
        session.duration,
        0
      );
      clipNo++;
    } else {
      if (session.audio) {
        await buildVideoClipForIndividualStream(
          participant,
          config,
          sessionNo,
          clipNo,
          session.duration,
          1
        );
        clipNo++;
      } else {
        await buildVideoClipForIndividualStream(
          participant,
          config,
          sessionNo,
          clipNo,
          session.duration,
          2
        );
        clipNo++;
      }
    }
    //make a video for between session
    let missingClipStartTime = participant.sessions[sessionNo].leave;
    let missinvClipEndTime = config.scheduled_finish;
    if (sessionNo < participant.sessions.length - 1) {
      missinvClipEndTime = participant.sessions[sessionNo + 1].join;
    }
    duration = missinvClipEndTime - missingClipStartTime;
    if (duration > 0) {
      await buildVideoClipForIndividualStream(
        participant,
        config,
        sessionNo,
        clipNo,
        duration,
        3
      );
      clipNo++;
    }
    sessionNo++;
  }
};
/*
 * based on type, make video clip for individual stream
 * type 0: camera on-> copy video to temp folder and rename /temp/individuals/clips/{clipNo}.mp4
 * type 1: camera off, audio on -> make video from camera_off_audio_on and copy video to temp folder and rename /temp/individuals/clips/{clipNo}.mp4
 * type 2: camera off, audio off -> make video from camera_off_audio_off and copy video to temp folder and rename /temp/individuals/clips/{clipNo}.mp4
 * type 3: missing -> make video from mising and copy video to temp folder and rename
 */
const buildVideoClipForIndividualStream = async (
  participant,
  config,
  sessionNo,
  clipNo,
  duration,
  type
) => {
  let sourceFile = inputDir + participant.id + "/" + sessionNo + ".mkv";
  let destinationFile =
    tempIndividualDir + "clips/" + participant.id + "/" + clipNo + ".mkv";
  if (type == 0) {
    fs.copyFileSync(sourceFile, destinationFile);
  } else {
    if (type == 1) sourceFile = inputDir + "camera_off_audio_on.png";
    else if (type == 2) sourceFile = inputDir + "camera_off_audio_off.png";
    else sourceFile = inputDir + "missing.png";
    await new Promise((resolve) => {
      console.log("running");
      const ffmpeg = new FFMPEG();
      ffmpeg.setFfmpegPath(ffmpegPath);
      ffmpeg.setFfprobePath(ffprobePath);
      ffmpeg
        .input(sourceFile)
        .inputOptions("-framerate 30")
        .inputOptions("-t " + duration)
        .inputOptions("-loop 1")
        .videoCodec("libx264")
        .outputOptions("-pix_fmt yuv420p")
        .outputOptions("-r 30")
        .output(destinationFile)
        .on("end", function () {
          console.log("Conversion finished");
          resolve();
        })
        .run();
    });
  }
};

const mergeVideoClipsForIndividualStream = async (participant, config) => {
  const clipsDir = tempIndividualClipsDir + participant.id + "/";
  const destinationFile = tempIndividualDir + participant.id + ".mkv";
  files = fs.readdirSync(clipsDir);
  const videoFiles = files.filter((file) =>
    [".mp4", ".avi", ".mkv"].includes(path.extname(file))
  );

  if (videoFiles.length === 0) {
    console.log("No video files found in the directory");
    return;
  }

  // Create an array of input paths for the videos
  const inputPaths = videoFiles.map((file) => path.join(clipsDir, file));
  let videoFilter = videoFiles.reduce(
    (filterString, file, fileIndex) =>
      (filterString += `[${fileIndex}:v]scale=1920:1080,setsar=1[v${fileIndex}];`),
    ""
  );
  videoFilter = videoFiles.reduce(
    (filterString, file, fileIndex) => (filterString += `[v${fileIndex}]`),
    videoFilter
  );
  videoFilter += `concat=n=${videoFiles.length}:v=1[outv]`;
  // Create a command to concatenate the videos
  await new Promise((resolve, reject) => {
    const ffmpeg = new FFMPEG();
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
    inputPaths.forEach((inputPath) => {
      ffmpeg.input(inputPath);
    });

    ffmpeg
      .complexFilter(videoFilter)
      .outputOptions("-map [outv]")
      .videoCodec("libx264")
      .outputOptions("-r 30")
      .outputOptions("-pix_fmt yuv420p")
      .output(destinationFile)
      .on("end", function () {
        console.log("Video concatenation finished");
        resolve();
      })
      .on("error", function (err) {
        console.error("Error concatenating videos:", err);
        reject();
      })
      .run();
  });
};

const buildIndividualStreamForNoSession = async (participant, config) => {
  const id = participant.id;
  const duration = config.scheduled_finish - config.scheduled_start;
  await new Promise((resolve) => {
    const ffmpeg = new FFMPEG();
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
    ffmpeg
      .input(inputDir + "missing.png")
      .inputOptions("-loop 1")
      .inputOptions("-framerate 30")
      .inputOptions("-t " + duration)
      .videoCodec("libx264")
      .outputOptions("-pix_fmt yuv420p")
      .outputOptions("-r 30")
      .output(tempIndividualDir + id + ".mkv")
      .on("end", function () {
        console.log("Conversion finished");
        resolve();
      })
      .run();
  });
};

//make individual stream for each participant
const buildIndividualStream = async (participant, config) => {
  if (participant.sessions.length == 0) {
    await buildIndividualStreamForNoSession(participant, config);
  } else {
    const tempClipsDir = tempIndividualClipsDir + participant.id;
    if (fs.existsSync(tempClipsDir)) {
      fs.rmdirSync(tempClipsDir, { recursive: true });
    }
    fs.mkdirSync(tempClipsDir);
    await buildVideoClipsForIndividualStream(participant, config);
    await mergeVideoClipsForIndividualStream(participant, config);
    if (fs.existsSync(tempClipsDir)) {
      fs.rmdirSync(tempClipsDir, { recursive: true });
    }
  }
};

//make individiaul streams
const buildIndividualStreams = async (config) => {
  if (fs.existsSync(tempIndividualDir)) {
    fs.rmdirSync(tempIndividualDir, { recursive: true });
  }
  fs.mkdirSync(tempIndividualDir);
  if (fs.existsSync(tempIndividualClipsDir)) {
    fs.rmdirSync(tempIndividualClipsDir, { recursive: true });
  }
  fs.mkdirSync(tempIndividualClipsDir);
  const participants = config.participants;
  for (let participant of participants) {
    await buildIndividualStream(participant, config);
  }
};

const buildMainStream = async (config) => {
  if (fs.existsSync(tempMainDir)) {
    fs.rmdirSync(tempMainDir, { recursive: true });
  }
  fs.mkdirSync(tempMainDir);
  if (fs.existsSync(tempMainClipsDir)) {
    fs.rmdirSync(tempMainClipsDir, { recursive: true });
  }
  fs.mkdirSync(tempMainClipsDir);
  await buildVideoClipsForMainStream(config);
  await mergeVideoClipsForMainStream(config);
  // if (fs.existsSync(tempMainClipsDir)) {
  //   fs.rmdirSync(tempMainClipsDir, { recursive: true });
  // }
};

const buildVideoClipsForMainStream = async (config) => {
  let clipNo = 0;
  let idx2 = 0; //idx for config.active_person_sessions
  const a = config.screen_sharing_sessions;
  const b = config.active_person_sessions;
  let processedTime = config.scheduled_start;
  for (let idx1 = 0; idx1 < a.length; idx1++) {
    while (processedTime >= b[idx2].end) {
      idx2++;
    }
    while (b[idx2].end < a[idx1].start) {
      await buildVideoClipForMainStream(
        config,
        processedTime,
        idx1,
        idx2,
        clipNo,
        0
      );
      processedTime = b[idx2].end;
      clipNo++;
      idx2++;
    }
    if (processedTime < a[idx1].start) {
      await buildVideoClipForMainStream(
        config,
        processedTime,
        idx1,
        idx2,
        clipNo,
        1
      );
      clipNo++;
      processedTime = a[idx1].start;
    }
    await buildVideoClipForMainStream(
      config,
      processedTime,
      idx1,
      idx2,
      clipNo,
      2
    );
    clipNo++;
    processedTime = a[idx1].end;
  }
  while (processedTime >= b[idx2].end) {
    idx2++;
  }
  while (idx2 < b.length) {
    await buildVideoClipForMainStream(
      config,
      processedTime,
      a.length,
      idx2,
      clipNo,
      0
    );
    processedTime = b[idx2].end;
    clipNo++;
    idx2++;
  }
};

/**
 * type 0, 1 => make clips using active speaker
 * type 2 => make clips using shared screen
 */
const buildVideoClipForMainStream = async (
  config,
  processedTime,
  idx1,
  idx2,
  clipNo,
  type
) => {
  const destinationFile = tempMainClipsDir + clipNo + ".mkv";
  if (type == 0 || type == 1) {
    const startTime = processedTime - config.scheduled_start;
    const endTime = type
      ? config.screen_sharing_sessions[idx1].start - config.scheduled_start
      : config.active_person_sessions[idx2].end - config.scheduled_start;
    const sourceFile =
      tempIndividualDir + config.active_person_sessions[idx2].id + ".mkv";
    await new Promise((resolve) => {
      console.log("getting main stream clip");
      const ffmpeg = new FFMPEG();
      ffmpeg.setFfmpegPath(ffmpegPath);
      ffmpeg.setFfprobePath(ffprobePath);
      ffmpeg
        .input(sourceFile)
        .inputOptions("-ss " + startTime)
        .inputOptions("-to " + endTime)
        .videoCodec("libx264")
        .outputOptions("-pix_fmt yuv420p")
        .outputOptions("-r 30")
        .output(destinationFile)
        .on("end", function () {
          console.log("Conversion finished");
          resolve();
        })
        .run();
    });
  } else {
    const sourceFile = inputDir + "screens/" + idx1 + ".mkv";
    fs.copyFileSync(sourceFile, destinationFile);
  }
};

const mergeVideoClipsForMainStream = async (config) => {
  const destinationFile = tempMainDir + "main.mkv";
  files = fs.readdirSync(tempMainClipsDir);
  const videoFiles = files.filter((file) =>
    [".mp4", ".avi", ".mkv"].includes(path.extname(file))
  );

  if (videoFiles.length === 0) {
    console.log("No video files found in the directory");
    return;
  }

  // Create an array of input paths for the videos
  const inputPaths = videoFiles.map((file) =>
    path.join(tempMainClipsDir, file)
  );
  let videoFilter = videoFiles.reduce(
    (filterString, file, fileIndex) =>
      (filterString += `[${fileIndex}:v]scale=1920:1080,setsar=1[v${fileIndex}];`),
    ""
  );
  videoFilter = videoFiles.reduce(
    (filterString, file, fileIndex) => (filterString += `[v${fileIndex}]`),
    videoFilter
  );
  videoFilter += `concat=n=${videoFiles.length}:v=1[outv]`;
  // Create a command to concatenate the videos
  await new Promise((resolve, reject) => {
    const ffmpeg = new FFMPEG();
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
    inputPaths.forEach((inputPath) => {
      ffmpeg.input(inputPath);
    });

    ffmpeg
      .complexFilter(videoFilter)
      .outputOptions("-map [outv]")
      .videoCodec("libx264")
      .outputOptions("-r 30")
      .outputOptions("-pix_fmt yuv420p")
      .output(destinationFile)
      .on("end", function () {
        console.log("Video concatenation finished");
        resolve();
      })
      .on("error", function (err) {
        console.error("Error concatenating videos:", err);
        reject();
      })
      .run();
  });
};

const buildSubtitleStream = (config) => {};

const exportFinalVideo = async (config) => {
  const destinationFile = outputDir + "result.mkv";
  await new Promise((resolve, reject) => {
    // let videoFilter = `[0:v]scale=1920:1080,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black[bkg]; [1:v]scale=720:540[main]; [2:v]scale=288:240[video1]; [3:v]scale=288:240[video2]; [bkg][main]overlay=360:30:enable='between(t,0,60)'[bg1]; [bg1][video1]overlay=0:600:enable='between(t,0,60)'[bg2]; [bg2][video2]overlay=288:600:enable='between(t,0,60)'`;
    // let videoFilter = `[0:v]scale=1920:1080,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black[bkg]; [1:v]scale=720:540[main]; [2:v]scale=288:240[video0]; [3:v]scale=288:240[video1]; [bkg][main]overlay=360:30:enable='between(t,0,60)'[bg0]; [bg0][video0]overlay=0:600:enable='between(t,0,60)'[bg1]; [bg1][video1]overlay=288:600:enable='between(t,0,60)'[bg2];`;
    let videoFilter = `[0:v]scale=1920:1080,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black[bkg]; [1:v]scale=${layout.mainStreamRectangle.width}:${layout.mainStreamRectangle.height}[main];`;

    const ffmpeg = new FFMPEG();
    const duration = config.scheduled_finish - config.scheduled_start;
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
    ffmpeg.input(inputDir + "background.jpg");
    ffmpeg.input(tempMainDir + "main.mkv");

    config.participants.forEach((participant, index) => {
      ffmpeg.input(tempIndividualDir + participant.id + ".mkv");
      videoFilter += `[${index + 2}:v]scale=${
        layout.individualStreamsRectangle.singleWidth
      }:${layout.individualStreamsRectangle.signleHeight}[video${index}];`;
    });
    videoFilter += `[bkg][main]overlay=360:30:enable='between(t,0,${duration})'[bg0];`;
    config.participants.forEach((participant, index) => {
      let singleRect = getIndividualStreamRectangle(index);
      videoFilter += `[bg${index}][video${index}]overlay=${singleRect.x}:${singleRect.y}:enable='between(t,0,${duration})'`;
      if (index < config.participants.length - 1)
        videoFilter += `[bg${index + 1}];`;
    });

    ffmpeg
      .complexFilter(videoFilter)
      .videoCodec("libx264")
      .outputOptions(`-crf 23`)
      .outputOptions(`-preset ultrafast`)
      .outputOptions(`-t ${duration}`)
      .output(destinationFile)
      .on("end", function () {
        console.log("Video concatenation finished");
        resolve();
      })
      .on("error", function (err) {
        console.error("Error concatenating videos:", err);
        reject();
      })
      .run();
  });
};

//render and export single video for video conference
const renderVideoConference = async () => {
  makeTempDir();
  await buildIndividualStreams(config);
  await buildMainStream(config);
  await buildSubtitleStream(config);
  await exportFinalVideo(config);
  clearTempDir();
};

const makeTempDir = () => {
  if (fs.existsSync(tempDir)) {
    fs.rmdirSync(tempDir, { recursive: true });
  }
  if (fs.existsSync(outputDir)) {
    fs.rmdirSync(outputDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);
  fs.mkdirSync(outputDir);
};

const clearTempDir = () => {
  if (fs.existsSync(tempDir)) {
    fs.rmdirSync(tempDir, { recursive: true });
  }
};

const run = () => {
  renderVideoConference();
};

run();
