import cv, { Mat } from "@techstark/opencv-js";
import { IPlayer, Player } from "../shared/common";

export let oCVInitialized: boolean = false;

const minArea = 500;

type HsvColor = number[];

export function processVideo(
  img: Mat,
  lowerHsv: HsvColor,
  upperHsv: HsvColor,
): { player?: IPlayer; overlay?: Mat } {
  let hsv = new cv.Mat(img.rows, img.cols, cv.CV_8UC3);
  let mask = new cv.Mat(img.rows, img.cols, cv.CV_8UC1);
  cv.flip(img, img, 1);
  cv.cvtColor(img, hsv, cv.COLOR_RGBA2RGB);
  cv.GaussianBlur(hsv, hsv, new cv.Size(11, 11), 0);
  cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

  let matLower = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), lowerHsv);
  let matUpper = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), upperHsv);

  cv.inRange(hsv, matLower, matUpper, mask);
  let contours = new cv.MatVector();
  let hier = new cv.Mat();
  cv.findContours(
    mask,
    contours,
    hier,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE,
  );

  let objects: cv.Point[] = [];
  for (let i = 0; i < contours.size(); i++) {
    let contour = contours.get(i);
    let circle = cv.minEnclosingCircle(contour);
    let area = cv.contourArea(contour);

    if (area >= minArea && objects.length < 2) {
      objects.push(circle.center);
      cv.circle(img, circle.center, circle.radius, [0, 255, 0, 255], 2);
      cv.putText(
        img,
        `r: ${circle.radius}, a: ${area}`,
        circle.center,
        cv.FONT_HERSHEY_SIMPLEX,
        0.8,
        [255, 255, 255, 255],
        1,
      );
    }
  }

  const player = new Player(-1);
  const rotSens = 0.08;

  if (objects.length == 2) {
    const x = objects[0].x - objects[1].x;
    const y = objects[0].y - objects[1].y;
    const slope = Math.max(-10, Math.min(10, y / x));
    player.rotVel = Math.abs(slope);
    slope < -rotSens
      ? player.rotateRight()
      : slope > rotSens
        ? player.rotateLeft()
        : player.stopRotation();

    const length = Math.sqrt(x * x + y * y);
    const relLength = length / img.cols; //width proportion
    if (relLength >= 0.1) {
      player.velScaling = relLength;
      player.forward();
    } else {
      player.velScaling = 1;
      player.stop();
    }

    cv.line(img, objects[0], objects[1], [255, 0, 0, 255], 2);
    // const centerX = (objects[0].x + objects[1].x) / 2;
    // const centerY = (objects[0].y + objects[1].y) / 2;
    // cv.putText(
    //   img,
    //   `l: ${length}`,
    //   new cv.Point(centerX, centerY),
    //   cv.FONT_HERSHEY_SIMPLEX,
    //   0.8,
    //   [255, 255, 255, 255],
    // );
  } else {
    player.state.rotDir = 0;
    player.state.moving = 0;
  }

  hsv.delete();
  mask.delete();
  matLower.delete();
  matUpper.delete();
  contours.delete();
  hier.delete();

  return { player, overlay: img };
}

export async function initOCV() {
  setTimeout(() => {
    cv.onRuntimeInitialized = () => {
      oCVInitialized = true;
    };
  }, 0);
}
