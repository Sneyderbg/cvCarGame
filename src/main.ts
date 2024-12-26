import "./style.css";
import { GameClient } from "./client/game";
import { setupCamControls } from "./client/camera";
import { setupOtherControls } from "./client/controls";

const client = new GameClient();

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

setupCamControls();
setupOtherControls((url) => {
  client.connect(url);
});
nextFrame();
