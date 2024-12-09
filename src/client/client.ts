import { ClientMessage, Player, ServerMessage } from "../common";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const playerIdEl = document.getElementById("playerId") as HTMLSpanElement;
if (!ctx) throw new Error("failed to get canvas context");

export class Client {
  // ===========
  // Game state
  // ===========
  ws!: WebSocket;
  me: number = -1;
  players: { [id: string]: Player } = {};
  cameraEnabled: boolean = false;
  connected = false;
  messageQ: ServerMessage[] = [];
  actionQ: ClientMessage[] = []; // queue for prediction
  msgCount: number = 0;

  meAccordingToServer?: Player;

  constructor() {
    this.setupKeys();
    this.connect("ws://localhost:3000");
  }

  setupKeys() {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    document.addEventListener("keydown", (e) => {
      // if an input key
      if (keys.indexOf(e.key) !== -1) {
        e.preventDefault();
      } else {
        return;
      }

      if (e.repeat) return;

      // rotation
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        if (e.code === "ArrowLeft") {
          this.players[this.me].rotateLeft();
        } else {
          this.players[this.me].rotateRight();
        }
      }

      // movement
      if (e.code === "ArrowUp") {
        this.players[this.me].forward();
      }
      if (e.code === "ArrowDown") {
        this.players[this.me].backward();
      }

      if (this.actionQ.length >= 2) {
        const dt =
          this.actionQ[this.actionQ.length - 1].ts -
          this.actionQ[this.actionQ.length - 2].ts;
        console.log(`lastDt: ${dt} ms`);
      }
    });
    document.addEventListener("keyup", (e) => {
      // if an input key
      if (keys.indexOf(e.key) !== -1) {
        e.preventDefault();
      } else {
        return;
      }

      // rotation
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        this.players[this.me].stopRotation();
      }

      // movement
      if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        this.players[this.me].stop();
      }
    });
  }

  connect(url: string) {
    this.ws = new WebSocket(url);

    // timeout for server connection
    setTimeout(() => {
      if (!this.connected) {
        console.log("Can't connect to server: timeout");
        this.ws.removeEventListener("open", () => {});
        playerIdEl.innerText = `Offline`;
        this.me = 0;
        this.players[this.me] = new Player(this.me);
      }
    }, 1000);

    this.ws.addEventListener("open", () => {
      this.connected = true;

      this.ws.addEventListener("message", (ev) => {
        let msg = JSON.parse(ev.data.toString()) as ServerMessage;
        if (msg.msgType == "welcome") {
          this.me = msg.player!.id;
          this.players[this.me] = Player.fromPlayer(msg.player!);
          playerIdEl.innerText = `ID: ${this.me}`;
        }
        this.messageQ.push(msg);
      });
    });

    this.ws.addEventListener("error", (ev) => {
      console.error("Websocket error: ", ev);
      this.connected = false;
    });

    window.addEventListener("beforeunload", () => {
      this.ws.close();
    });
  }

  sendPlayerState() {
    if (this.connected && this.ws.readyState === this.ws.OPEN) {
      const msg: ClientMessage = {
        msgSeq: this.msgCount++,
        ts: performance.now(),
        playerId: this.me,
        state: this.players[this.me].state,
      };

      this.ws.send(JSON.stringify(msg));
      this.actionQ.push(msg);
    }
  }

  processMessages() {
    let msg = this.messageQ.length > 0 ? this.messageQ[0] : null;
    while (msg) {
      switch (msg.msgType) {
        case "playerJoined":
          console.log("player joined with angle: ", msg.player!.angle);
          this.players[msg.player!.id] = Player.fromPlayer(msg.player!);
          break;

        case "playerLeft":
          delete this.players[msg.player!.id];
          break;

        case "playerUpdate":
          for (const player of msg.players!) {
            if (player.id === this.me) {
              if (!this.meAccordingToServer) {
                this.meAccordingToServer = Player.fromPlayer(player);
              } else {
                this.meAccordingToServer.updateState(player);
              }
              continue;
            }
            this.players[player.id].updateState(player);
          }
          break;
        default:
          break;
      }

      this.messageQ.splice(0, 1);
      msg = this.messageQ.length > 0 ? this.messageQ[0] : null;
    }

    // if (msg.msgType === "server") {
    //   const message = msg.message as ServerMessage;
    //   if (message.msgType === "welcome") {
    //     me = message.player.id;
    //     players[me] = message.player;
    //     setPlayer(players[me]);
    //   }
    //   if (message.msgType === "playerJoined" && message.player.id !== me) {
    //     players[message.player.id] = message.player;
    //     console.log(message.player.id, message.player.angle);
    //   }
    //   if (message.msgType === "playerLeft" && message.player.id !== me) {
    //     delete players[message.player.id];
    //   }
    // } else {
    //   const clientMessage = msg.message as ClientMessage;
    //   if (clientMessage.msType === "updateMovement") {
    //     players[clientMessage.id].state.moving = clientMessage.moving ?? false;
    //     players[clientMessage.id].x = clientMessage.x ?? 0;
    //     players[clientMessage.id].y = clientMessage.y ?? 0;
    //   }
    //   if (clientMessage.msType === "updateRotation") {
    //     players[clientMessage.id].state.rotDir = clientMessage.rotDir ?? 0;
    //     players[clientMessage.id].angle = clientMessage.angle ?? 0;
    //   }
    // }
  }

  render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const [w, h] = [50, 20];
    for (const id in this.players) {
      const player = this.players[id];
      ctx.fillStyle = "red";
      ctx.strokeStyle = "blue";
      ctx.lineWidth = 2;
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.resetTransform();
    }

    const player = this.meAccordingToServer;
    if (player) {
      ctx.fillStyle = "rgba(200, 0, 0, 0.6)";
      ctx.strokeStyle = "blue";
      ctx.lineWidth = 2;
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.resetTransform();
    }
  }

  update(dt: number) {
    for (let id in this.players) {
      this.processMessages();
      this.players[id].update(dt);
    }
    if (this.me >= 0) {
      this.sendPlayerState();
    }
  }
}
