import { ServerWebSocket, sleep } from "bun";
import { ClientMessage, Player, ServerMessage } from "./common";
import { colors } from "./util";

class Server {
  TICKS_PER_SEC = 60;
  clients: {
    [playerId: number]: {
      ws: ServerWebSocket<unknown>;
      player: Player;
      lastProcessedMessage?: ClientMessage;
    };
  } = {};
  idCount = 0;
  messageQ: (ClientMessage | ServerMessage)[] = [];

  constructor() {
    setInterval(() => {
      this.tick(1 / this.TICKS_PER_SEC);
    }, 1000 / this.TICKS_PER_SEC);
  }

  getPlayerId(ws: ServerWebSocket<unknown>) {
    let playerId: number = -1;
    Object.entries(this.clients).forEach(([k, v]) => {
      if (v.ws === ws) playerId = parseInt(k);
    });
    return playerId;
  }

  tick(_dt: number) {
    this.processMessages();
    this.broadcastState();
  }

  broadcastState() {
    const msg: ServerMessage = {
      ts: performance.now(),
      msgType: "playerUpdate",
      players: Object.values(this.clients).map(({ player }) => player),
    };

    this.broadcast(msg);
  }

  broadcast(msg: ServerMessage) {
    //TODO: change forEach to for in
    Object.entries(this.clients).forEach(([_k, v]) => {
      v.ws.sendText(JSON.stringify(msg));
    });
  }

  addMessage(ws: ServerWebSocket<unknown>, message: ClientMessage) {
    const playerId = server.getPlayerId(ws);
    if (playerId == -1) {
      return;
    }
    if (playerId !== message.playerId) {
      console.log("not allowed to change another player's state");
      this.clients[playerId].ws.close(4444, "not allowed");
      return;
    }

    this.messageQ.push(message);
  }

  addClient(ws: ServerWebSocket<unknown>) {
    // create and notify player
    const player = new Player(this.idCount);
    this.clients[this.idCount] = {
      ws,
      player,
    };
    const message: ServerMessage = {
      ts: performance.now(),
      msgType: "playerJoined",
      player,
    };

    this.messageQ.push(message);
  }

  removeClient(ws: ServerWebSocket<unknown>) {
    const playerId = this.getPlayerId(ws);
    if (playerId === -1) return;

    const msg: ServerMessage = {
      ts: performance.now(),
      msgType: "playerLeft",
      player: this.clients[playerId].player,
    };

    this.messageQ.push(msg);
  }

  processServerMessage(msg: ServerMessage) {
    switch (msg.msgType) {
      case "playerLeft":
        const playerId = msg.player!.id;
        delete this.clients[playerId];
        this.broadcast(msg);

        console.log(
          `player ${colors.FgCyan + playerId + colors.FgRed} left`,
          colors.Reset,
        );
        console.log("num of players: ", Object.entries(this.clients).length);
        break;

      case "playerJoined":
        msg.msgType = "welcome";
        const ws = this.clients[msg.player!.id].ws;
        ws.sendText(JSON.stringify(msg), true);

        // notify new player of other players
        Object.entries(this.clients).forEach(([_k, v]) => {
          const pMsg: ServerMessage = {
            ts: performance.now(),
            msgType: "playerJoined",
            player: v.player,
          };
          console.log(
            `Notifying player ${v.player.id} joined with angle: ${v.player.angle}`,
          );
          ws.send(JSON.stringify(pMsg), true);
        });

        // notify other players of new player
        msg.msgType = "playerJoined";

        this.broadcast(msg);
        console.log(`player ${this.idCount++} joined`);
        break;

      case "welcome":
      case "playerUpdate":
        // never
        break;
    }
  }
  processClientMessage(msg: ClientMessage) {
    const lastMsg = this.clients[msg.playerId].lastProcessedMessage;
    const dt = lastMsg ? msg.ts - lastMsg.ts : 0;
    this.clients[msg.playerId].player.update(dt / 1000.0);
    this.clients[msg.playerId].player.state = msg.state;
    this.clients[msg.playerId].lastProcessedMessage = msg;
    console.log(`lastDt: ${dt} ms`);
  }

  processMessages() {
    const now = performance.now();
    for (let i = 0; i < this.messageQ.length; i++) {
      const msg = this.messageQ[i];
      if (msg.ts > now) {
        continue;
      } // dont process messages after current time
      if ("msgType" in msg) {
        this.processServerMessage(msg);
      } else {
        this.processClientMessage(msg);
      }
      this.messageQ.splice(i, 1); // delete processed message
    }
  }
}

const server = new Server();
const bun = Bun.serve({
  port: 3000,
  fetch(req, server) {
    if (server.upgrade(req)) {
      return;
    }
    return new Response("nothing", { status: 404 });
  },
  websocket: {
    open: (ws) => {
      server.addClient(ws);
    },
    message: async (ws, message) => {
      //TODO: change this
      //simulate lag
      await sleep(500);
      if (typeof message !== "string") {
        console.log("invalid message type");
        return;
      }
      // console.log(`got ${message}`);
      server.addMessage(ws, JSON.parse(message));
    },
    close: (ws) => {
      server.removeClient(ws);
    },
  },
});

console.log(`Server running at ${bun.url}\n`);
