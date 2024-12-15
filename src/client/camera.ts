import { clamp, hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from "../shared/util";
import { initOCV } from "./cv";

const camVideo = document.getElementById("cam") as HTMLVideoElement;
const camCanvas = document.getElementById("camCanvas") as HTMLCanvasElement;
const camSelect = document.getElementById("camSelect") as HTMLSelectElement;
const enableCamBtn = document.getElementById("enableCam") as HTMLInputElement;
const middleColorPicker = document.getElementById("color") as HTMLInputElement;
const colorAmplitude = document.getElementById("colorAmp") as HTMLInputElement;
const ctx = camCanvas.getContext("2d") as CanvasRenderingContext2D;
let devices: MediaDeviceInfo[] = [];
let camInitd = false;
let selectedCamId: string | "none" = "none";
export let capturingCam = false;
let image: ImageBitmap | undefined = undefined;

// const width = camVideo.width;
// const height = camVideo.height;

function stopCam() {
  camVideo.pause();
  (camVideo.srcObject as MediaStream)
    .getVideoTracks()
    .forEach((track) => track.stop());
  camVideo.srcObject = null;
  capturingCam = false;
}

// let cap: cv.VideoCapture;
async function startCam() {
  if (selectedCamId === "none") {
    return;
  }

  const mediaStream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: {
        exact: selectedCamId,
      },
    },
  });
  camVideo.srcObject = mediaStream;
  camVideo.play();
  // cap = new cv.VideoCapture(camVideo);
  capturingCam = true;
}

function draw() {
  if (image) {
    ctx.fillRect(0, 0, 400, 300);
    ctx.drawImage(
      image,
      0,
      0,
      image.width,
      image.height,
      0,
      0,
      camCanvas.width,
      camCanvas.height,
    );
  } else if (selectedCamId !== "none") {
    ctx.fillRect(0, 0, 400, 300);
    ctx.scale(-1, 1);
    ctx.drawImage(camVideo, 0, 0, -400, 300);
    ctx.resetTransform();
  } else {
    ctx.fillRect(0, 0, 400, 300);
  }
  requestAnimationFrame(draw);
}

async function initCams() {
  await navigator.mediaDevices.getUserMedia({ video: true });
  devices = await navigator.mediaDevices.enumerateDevices();

  devices.forEach((dev, idx) => {
    if (dev.kind === "videoinput") {
      const option = document.createElement("option");
      option.id = idx.toString();
      option.value = dev.deviceId;
      option.innerText = dev.label;
      camSelect.add(option);
    }

    camSelect.onchange = async (e) => {
      if (!e.target) return;
      const target = e.target as HTMLInputElement;

      if (capturingCam) {
        stopCam();
      }
      selectedCamId = target.value;
      startCam();
    };
  });
}

const actualVideo = new OffscreenCanvas(camVideo.width, camVideo.height);
const actualCtx = actualVideo.getContext("2d", {
  willReadFrequently: true,
}) as OffscreenCanvasRenderingContext2D;

export function getImage(): ImageData {
  actualCtx.drawImage(camVideo, 0, 0);
  return actualCtx.getImageData(0, 0, camVideo.width, camVideo.height);
}

export async function setImage(img: ImageData) {
  if (image) {
    image.close();
  }
  image = await createImageBitmap(
    new ImageData(img.data, img.width, img.height),
  );
}

let lowerHsv = [100, 100, 30, 0];
let upperHsv = [140, 255, 255, 255];
export function getSelectedRange() {
  return { lower: lowerHsv, upper: upperHsv };
}

export function setupCamControls() {
  enableCamBtn.onchange = async (e: any) => {
    if (!camInitd) {
      await initCams();
      camInitd = true;
    }
    if (e.target.checked) {
      startCam();
    } else {
      stopCam();
    }
  };
  draw();
  initOCV();

  // initial color
  const { r, g, b } = hsvToRgb(120 / 180, 172 / 255, 142 / 255);
  middleColorPicker.value = rgbToHex(r, g, b);

  function setColors(hex: string, amp: number) {
    const { r, g, b } = hexToRgb(hex);
    let [h, _s, _v] = rgbToHsv(r, g, b);
    h *= 180;
    // s *= 255;
    // v *= 255;

    lowerHsv = [clamp(h - 180 * amp, 0, 180), 80, 30, 0];
    upperHsv = [clamp(h + 180 * amp, 0, 180), 255, 255, 255];
  }

  colorAmplitude.min = "0";
  colorAmplitude.max = ".75";
  colorAmplitude.step = ".01";
  colorAmplitude.defaultValue = ".4";
  middleColorPicker.onchange = (e) => {
    const target = e.target as HTMLInputElement;
    setColors(target.value, parseFloat(colorAmplitude.value));
  };

  colorAmplitude.onchange = (e) => {
    const target = e.target as HTMLInputElement;
    setColors(middleColorPicker.value, parseFloat(target.value));
  };
}
