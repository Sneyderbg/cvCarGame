import { Player, ServerMessage, ClientMessage } from "../shared/common";
import { capturingCam, getImage, getSelectedRange, setImage } from "./camera";
import { Params, Result } from "./cvWorker";
import ProcessorWorker from "./cvWorker.ts?worker";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const playerIdEl = document.getElementById("playerId") as HTMLSpanElement;
if (!ctx) throw new Error("failed to get canvas context");

export class GameClient {
  // ===========
  // Game state
  // ===========
  ws!: WebSocket;
  me: number = -1;
  players: { [id: string]: Player } = {};
  playersOneTickBehind: typeof this.players = {};
  cameraEnabled: boolean = false;
  connectionStatus: "online" | "connecting" | "offline" = "offline";
  connectedAtTs = 0;
  messageQ: ServerMessage[] = [];
  actionQ: ClientMessage[] = []; // queue for prediction
  msgCount: number = 0;
  lastProcMsgSeq = -1;
  lastUpdateFromServer = 0;
  serverUrl = "ws://localhost:3000";
  keys = {
    left: false,
    right: false,
    up: false,
    down: false,
  };

  meAccordingToServer?: Player;
  interpolateGhost = false;
  interpolatedGhost?: Player;

  cvWorker: Worker;
  workerWorking = false;
  constructor() {
    this.setupKeys();
    this.connect();
    this.cvWorker = new ProcessorWorker();
    this.cvWorker.onmessage = (ev) => {
      this.workerWorking = false;
      const res = ev.data as Result;
      if (res.success) {
        this.processWorkerResult(res);
      }
    };
  }

  setupKeys() {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    document.addEventListener("keydown", (e) => {
      // DEBUG
      if (e.code === "KeyD") {
        console.log(this.actionQ[this.actionQ.length - 1].state);
      }

      // if an input key
      if (keys.indexOf(e.key) !== -1) {
        e.preventDefault();
      } else {
        return;
      }

      if (e.repeat) return;

      switch (e.code) {
        case "ArrowLeft":
          this.keys.left = true;
          break;
        case "ArrowRight":
          this.keys.right = true;
          break;
        case "ArrowUp":
          this.keys.up = true;
          break;
        case "ArrowDown":
          this.keys.down = true;
          break;
      }
    });
    document.addEventListener("keyup", (e) => {
      // if an input key
      if (keys.indexOf(e.key) !== -1) {
        e.preventDefault();
      } else {
        return;
      }

      switch (e.code) {
        case "ArrowLeft":
          this.keys.left = false;
          break;
        case "ArrowRight":
          this.keys.right = false;
          break;
        case "ArrowUp":
          this.keys.up = false;
          break;
        case "ArrowDown":
          this.keys.down = false;
          break;
      }
    });
  }

  connect() {
    this.messageQ = [];
    this.actionQ = [];
    this.msgCount = 0;
    for (let id in this.players) {
      if (id !== this.me.toString()) {
        delete this.players[id];
      }
    }
    this.connectionStatus = "connecting";
    playerIdEl.innerText = "Connecting...";

    if (this.ws && this.ws.readyState == this.ws.OPEN) {
      this.ws.close();
    }

    this.ws = new WebSocket(this.serverUrl);

    // timeout for server connection
    setTimeout(() => {
      if (this.connectionStatus !== "online") {
        console.log("Can't connect to server: timeout");
        this.ws.removeEventListener("open", () => {});
        this.connectionStatus = "offline";
        playerIdEl.innerText = `Offline`;
        this.me = 0;
        this.players[this.me] = new Player(this.me);
      }
    }, 1000);

    this.ws.addEventListener("open", () => {
      this.connectionStatus = "online";
      this.connectedAtTs = performance.now();

      this.ws.addEventListener("message", (ev) => {
        let msg = JSON.parse(ev.data.toString()) as ServerMessage;
        this.messageQ.push(msg);
      });

      this.ws.addEventListener("close", () => {
        setTimeout(() => {
          this.connect();
        }, 500);
      });
    });

    this.ws.addEventListener("error", (ev) => {
      console.error("Websocket error: ", ev);
      this.connectionStatus = "offline";
    });

    window.addEventListener("beforeunload", () => {
      this.ws.close();
    });
  }

  sendPlayerState() {
    if (
      this.connectionStatus === "online" &&
      this.ws.readyState === this.ws.OPEN &&
      this.me >= 0
    ) {
      const msg: ClientMessage = {
        msgSeq: this.msgCount++,
        ts: performance.now() - this.connectedAtTs,
        playerId: this.me,
        state: { ...this.players[this.me].state },
      };

      // setTimeout(() => {
      // }, 200);
      this.ws.send(JSON.stringify(msg));
      this.actionQ.push(msg);
    }
  }

  processMessages() {
    let msg = this.messageQ.length > 0 ? this.messageQ[0] : null;
    while (msg) {
      switch (msg.msgType) {
        case "welcome":
          if (this.me in this.players) {
            delete this.players[this.me];
          }
          this.me = msg.player!.id;
          this.players[this.me] = Player.fromPlayer(msg.player!);
          playerIdEl.innerText = `ID: ${this.me}`;
          break;

        case "playerJoined":
          if (msg.player!.id === this.me) break;
          this.players[msg.player!.id] = Player.fromPlayer(msg.player!);
          this.playersOneTickBehind[msg.player!.id] = Player.fromPlayer(
            msg.player!,
          );
          break;

        case "playerLeft":
          delete this.players[msg.player!.id];
          delete this.playersOneTickBehind[msg.player!.id];
          break;

        case "playerUpdate":
          for (const player of msg.players!) {
            if (player.id === this.me) {
              if (!this.meAccordingToServer) {
                this.meAccordingToServer = Player.fromPlayer(player);
                this.meAccordingToServer.color = "rgba(200, 0, 0, 0.4)";
              } else {
                this.meAccordingToServer.setTo(player);
              }

              this.lastProcMsgSeq = msg.lastProcMsgSeq!;
              this.lastUpdateFromServer =
                performance.now() - this.connectedAtTs;

              // reconciliation
              this.players[this.me].setTo(this.meAccordingToServer);
              let i = 0;
              while (
                i < this.actionQ.length &&
                this.actionQ[i].msgSeq <= this.lastProcMsgSeq
              ) {
                i++;
              } // stops at equal

              this.actionQ.splice(0, i - 1); // keep processed action

              // reapply unseen input by server
              for (i = 1; i < this.actionQ.length; i++) {
                const dt = this.actionQ[i].ts - this.actionQ[i - 1].ts;
                this.players[this.me].setState(this.actionQ[i].state);
                this.players[this.me].update(dt / 1000.0);
              }

              continue;
            }
            this.playersOneTickBehind[player.id].setTo(this.players[player.id]);
            this.players[player.id].setTo(player);
          }
          break;
        default:
          break;
      }

      this.messageQ.splice(0, 1);
      msg = this.messageQ.length > 0 ? this.messageQ[0] : null;
    }
  }

  render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const id in this.players) {
      if (id === this.me.toString()) {
        this.players[this.me].draw(ctx);
      } else {
        const progress =
          performance.now() - this.connectedAtTs - this.lastUpdateFromServer;
        const interpolatedP = Player.lerpPlayer(
          this.playersOneTickBehind[id],
          this.players[id],
          (progress * 3) / 1000.0,
        );
        interpolatedP.draw(ctx);
      }
    }

    if (
      import.meta.env.DEV &&
      this.connectionStatus &&
      this.meAccordingToServer
    ) {
      if (this.interpolateGhost) {
        if (!this.interpolatedGhost) {
          this.interpolatedGhost = Player.fromPlayer(this.meAccordingToServer);
        }
        this.interpolatedGhost.lerpTo(this.meAccordingToServer, 0.125);

        this.interpolatedGhost.draw(ctx);
      } else {
        this.meAccordingToServer.draw(ctx);
      }
    }
  }

  handleInput() {
    const p = this.players[this.me];
    if (!p) return;

    if (
      (!this.keys.left && !this.keys.right) ||
      (this.keys.left && this.keys.right)
    ) {
      p.stopRotation();
    }
    if (this.keys.left) {
      p.rotateLeft();
    }
    if (this.keys.right) {
      p.rotateRight();
    }

    if (
      (!this.keys.up && !this.keys.down) ||
      (this.keys.up && this.keys.down)
    ) {
      p.stop();
    }
    if (this.keys.up) {
      p.forward();
    }
    if (this.keys.down) {
      p.backward();
    }
  }

  processWorkerResult(res: Result) {
    setImage(res.overlay!);
    if (this.me in this.players && res.player) {
      if (res.player.state.moving !== 0) {
        this.players[this.me].velScaling = res.player.velScaling;
        if (res.player.state.moving === -1) {
          this.keys.up = false;
          this.keys.down = true;
        } else {
          this.keys.down = false;
          this.keys.up = true;
        }
      } else {
        this.players[this.me].velScaling = 1;
      }

      if (res.player.state.rotDir !== 0) {
        this.players[this.me].rotVel = res.player.rotVel;
        if (res.player.state.rotDir === -1) {
          this.keys.left = false;
          this.keys.right = true;
        } else {
          this.keys.right = false;
          this.keys.left = true;
        }
      } else {
        this.players[this.me].rotVel = 1;
      }
    }
  }

  updateWorker() {
    if (!this.workerWorking && capturingCam) {
      const frame = getImage();
      if (frame) {
        const params: Params = {
          image: {
            colorSpace: frame.colorSpace,
            data: frame.data,
            width: frame.width,
            height: frame.height,
          },
          colorRange: {
            ...getSelectedRange(),
          },
        };
        this.cvWorker.postMessage(params);
        this.workerWorking = true;
      }
    }
  }

  update(dt: number) {
    this.processMessages();
    this.handleInput();
    this.sendPlayerState();
    this.updateWorker();
    for (let id in this.players) {
      if (id === this.me.toString()) {
        this.players[this.me].update(dt);
      }
    }
  }
}
