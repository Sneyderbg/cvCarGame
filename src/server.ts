import { ServerWebSocket, sleep } from "bun";
import { ClientMessage, Player, ServerMessage } from "./common";
import { colors } from "./util";

class Server {
  TICKS_PER_SEC = 3;
  clients: {
    [playerId: number]: {
      ws: ServerWebSocket<unknown>;
      player: Player;
      lastProcessedMessage?: ClientMessage;
    };
  } = {};
  idCount = 0;
  serverMessageQ: ServerMessage[] = [];
  clienteMessageQ: ClientMessage[] = [];

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
      lastProcMsgSeq: -1,
      players: Object.values(this.clients).map(({ player }) => player),
    };

    this.broadcast(msg);
  }

  broadcast(msg: ServerMessage) {
    //TODO: change forEach to for in
    Object.entries(this.clients).forEach(([_k, v]) => {
      if (msg.msgType === "playerUpdate") {
        msg.lastProcMsgSeq = v.lastProcessedMessage?.msgSeq;
      }
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

    this.clienteMessageQ.push(message);
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
      lastProcMsgSeq: -1, // used only for playerUpdate
      msgType: "playerJoined",
      player,
    };

    this.serverMessageQ.push(message);
    this.idCount++;
  }

  removeClient(ws: ServerWebSocket<unknown>) {
    const playerId = this.getPlayerId(ws);
    if (playerId === -1) return;

    const msg: ServerMessage = {
      ts: performance.now(),
      lastProcMsgSeq: -1,
      msgType: "playerLeft",
      player: this.clients[playerId].player,
    };

    this.serverMessageQ.push(msg);
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
        const ws = this.clients[msg.player!.id]?.ws;
        if (!ws) return; // TODO: log invalid msg
        ws.sendText(JSON.stringify(msg), true);

        // notify new player of other players
        Object.entries(this.clients).forEach(([_k, v]) => {
          const pMsg: ServerMessage = {
            ts: performance.now(),
            msgType: "playerJoined",
            player: v.player,
          };
          console.log(
            `${colors.FgYellow}Notifying${colors.Reset} player ${v.player.id} joined with angle: ${v.player.angle}`,
          );
          ws.send(JSON.stringify(pMsg), true);
        });

        // notify other players of new player
        msg.msgType = "playerJoined";

        this.broadcast(msg);
        console.log(
          `player ${colors.FgCyan + msg.player!.id + colors.FgGreen} joined${colors.Reset}`,
        );
        break;

      case "welcome":
      case "playerUpdate":
        // never
        break;
    }
  }

  processClientMessage(msg: ClientMessage) {
    if (!(msg.playerId in this.clients)) {
      console.log("player id not registered in clients", msg.playerId);
      return;
    }

    const lastMsg = this.clients[msg.playerId].lastProcessedMessage;
    const dt = lastMsg ? msg.ts - lastMsg.ts : 0;
    this.clients[msg.playerId].player.update(dt / 1000.0);
    this.clients[msg.playerId].player.state = msg.state;
    this.clients[msg.playerId].lastProcessedMessage = msg;
    // console.log(`lastDt: ${dt} ms`);
  }

  processMessages() {
    let now = performance.now();
    // already sorted?
    while (this.serverMessageQ.length > 0) {
      const msg = this.serverMessageQ[0];
      if (msg.ts <= now) {
        this.processServerMessage(msg);
      } // process messages before current time

      this.serverMessageQ.splice(0, 1); // delete processed message
    }

    this.clienteMessageQ.sort((a, b) => a.msgSeq - b.msgSeq);
    now = performance.now();
    while (this.clienteMessageQ.length > 0) {
      const msg = this.clienteMessageQ[0];
      if (msg.ts <= now) {
        this.processClientMessage(msg);
      } // process messages before current time

      this.clienteMessageQ.splice(0, 1); // delete processed message
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
      await sleep(0);
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
