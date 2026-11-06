import {Config} from "@remotion/cli/config";

const browserExecutable =
  process.env.REMOTION_BROWSER_EXECUTABLE ||
  (process.platform === "android"
    ? "/data/data/com.termux/files/usr/bin/headless_shell"
    : null);
if (browserExecutable) {
  Config.setBrowserExecutable(browserExecutable);
}

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("swiftshader");
Config.setDelayRenderTimeoutInMilliseconds(120000);
Config.setCodec("h264");
Config.setCrf(20);
