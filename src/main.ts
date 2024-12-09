import "./style.css";
// import { init, initialized, processVideo } from "./client/cv";
import { Client } from "./client/client";

const client = new Client();

let lastTime = 0;
const nextFrame = () =>
  requestAnimationFrame((time) => {
    const dt = time - lastTime;
    lastTime = time;
    loop(dt / 1000.0);
  });

function loop(dt: number) {
  // if (initialized && cameraEnabled) {
  //   processVideo();
  // }
  client.update(dt);
  client.render();
  nextFrame();
}

// init();
nextFrame();
