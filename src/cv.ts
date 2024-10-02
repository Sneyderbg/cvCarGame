import cv from "@techstark/opencv-js"
import { Player } from "./common"
const camVideo = document.getElementById("cam") as HTMLVideoElement
const camSelect = document.getElementById("camSelect") as HTMLSelectElement
const pBtn = document.getElementById("togglePause") as HTMLButtonElement
const lowPicker = document.getElementById("lowColor") as HTMLInputElement
const upperPicker = document.getElementById("upperColor") as HTMLInputElement
let devices: MediaDeviceInfo[] = []

export let player: Player | null = null
export function setPlayer(p: Player) {
  player = p
}

const width = camVideo.width
const height = camVideo.height
let cap: cv.VideoCapture

let lowerHsvYellow = [20, 120, 100, 0]
let upperHsvYellow = [60, 255, 255, 255]
const minArea = 500

export let initialized: boolean = false
export function processVideo() {
  let img = new cv.Mat(height, width, cv.CV_8UC4);
  let hsv = new cv.Mat(height, width, cv.CV_8UC3);
  let mask = new cv.Mat(height, width, cv.CV_8UC1)
  cap.read(img);
  cv.flip(img, img, 1)
  cv.cvtColor(img, hsv, cv.COLOR_RGBA2RGB)
  cv.GaussianBlur(hsv, hsv, new cv.Size(11, 11), 0)
  cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV)

  let matLower = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), lowerHsvYellow);
  let matUpper = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), upperHsvYellow);

  cv.inRange(hsv, matLower, matUpper, mask)
  let contours = new cv.MatVector()
  let hier = new cv.Mat()
  cv.findContours(mask, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

  let objects: cv.Point[] = []
  for (let i = 0; i < contours.size(); i++) {
    let contour = contours.get(i)
    let circle = cv.minEnclosingCircle(contour)
    let area = cv.contourArea(contour)

    if (area >= minArea && objects.length < 2) {
      objects.push(circle.center)
      cv.circle(img, circle.center, circle.radius, [0, 255, 0, 255], 2)
      cv.putText(img, `r: ${circle.radius}, a: ${area}`,
        circle.center, cv.FONT_HERSHEY_SIMPLEX, 0.8, [255, 255, 255, 255], 1
      )
    }
  }

  if (player && objects.length == 2) {
    const x = objects[0].x - objects[1].x
    const y = objects[0].y - objects[1].y
    const slope = Math.max(-10, Math.min(10, y / x))
    player.rotVel = Math.abs(slope)
    player.state.rotDir = slope < -0.08 ? -1 : (slope > 0.08 ? 1 : 0)

    const length = Math.sqrt(x * x + y * y)
    const relLength = length / width
    player.velScaling = relLength
    player.state.moving = true
    const centerX = (objects[0].x + objects[1].x) / 2
    const centerY = (objects[0].y + objects[1].y) / 2
    cv.line(img, objects[0], objects[1], [255, 0, 0, 255], 2)
    cv.putText(img, `l: ${length}`, new cv.Point(centerX, centerY), cv.FONT_HERSHEY_SIMPLEX, 0.8, [255, 255, 255, 255])
  } else {
    if (player) {
      player.state.rotDir = 0
      player.state.moving = false
    }
  }
  // cv.drawContours(img, contours, -1, [255, 0, 0, 255], 4)

  cv.imshow("camCanvas", img)

  img.delete()
  hsv.delete()
  mask.delete()
  matLower.delete()
  matUpper.delete()
  contours.delete()
  hier.delete()

}

function initOCV() {
  cap = new cv.VideoCapture(camVideo)
}

function hexToRgb(hex: string) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, b: 0, g: 0 };
}

function rgbToHsv(r: number, g: number, b: number) {
  r /= 255, g /= 255, b /= 255;

  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, v = max;
  h = max

  var d = max - min;
  s = max == 0 ? 0 : d / max;

  if (max == min) {
    h = 0; // achromatic
  } else {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }

    h /= 6;
  }

  return [h, s, v];
}

export async function init() {
  setTimeout(() => {
    cv.onRuntimeInitialized = () => {
      initOCV()
      initialized = true
    }
  }, 0)

  await navigator.mediaDevices.getUserMedia({ video: true })
  devices = await navigator.mediaDevices.enumerateDevices()

  devices.forEach((dev, idx) => {
    if (dev.kind === "videoinput") {

      const option = document.createElement("option")
      option.id = idx.toString()
      option.value = dev.deviceId
      option.innerText = dev.label
      camSelect.add(option)
    }
    camSelect.onchange = async (e) => {
      if (!e.target) return
      const target = e.target as HTMLInputElement
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: {
            exact: target.value
          }
        }
      })
      camVideo.srcObject = mediaStream
      camVideo.play()
    }
  })

  pBtn.onclick = (_e) => {
    if (camVideo.paused) {
      camVideo.play()
    } else {
      camVideo.pause()
    }
  }
  camVideo.srcObject = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: devices.filter((dev) => dev.label.toLowerCase().indexOf("hd") !== -1)[0].deviceId
    }
  })

  lowPicker.onchange = (e) => {
    const target = e.target as HTMLInputElement
    const { r, g, b } = hexToRgb(target.value)
    const [h, s, v] = rgbToHsv(r, g, b)
    lowerHsvYellow = [h, s, v, 0]
  }
  upperPicker.onchange = (e) => {
    const target = e.target as HTMLInputElement
    const { r, g, b } = hexToRgb(target.value)
    const [h, s, v] = rgbToHsv(r, g, b)
    upperHsvYellow = [h, s, v, 255]
  }
}
