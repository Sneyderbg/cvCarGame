import { oCVInitialized, initOCV, processVideo } from "./cv";
import { IPlayer } from "../shared/common";
import cv from "@techstark/opencv-js";

declare var self: ServiceWorkerGlobalScope;

export interface Params {
  image: ImageData;
  colorRange: {
    lower: number[];
    upper: number[];
  };
}

export interface Result {
  success: boolean;
  error: string;
  overlay?: ImageData;
  player?: IPlayer;
}

initOCV();

self.addEventListener("message", (ev) => {
  const res: Result = {
    success: false,
    error: "",
  };
  if (!oCVInitialized) {
    res.error = "OpenCV not initialized yet";
    postMessage(res);
    return;
  }
  const params = ev.data as Params;

  const proc = processVideo(
    cv.matFromImageData(params.image),
    params.colorRange.lower,
    params.colorRange.upper,
  );
  res.player = proc.player;
  res.overlay = {
    colorSpace: params.image.colorSpace,
    data: new Uint8ClampedArray(proc.overlay!.data),
    width: proc.overlay!.cols,
    height: proc.overlay!.rows,
  };

  // res.overlay = {
  //   colorSpace: params.image.colorSpace,
  //   data: params.image.data,
  //   width: params.image.width,
  //   height: params.image.height,
  // };

  res.success = true;
  postMessage(res);
});
