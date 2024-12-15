import { ServerWebSocket } from "bun";
import Logger, { ILogLevel } from "js-logger";
import { Player, ClientMessage, ServerMessage } from "./shared/common";
import { colors } from "./shared/util";

class Server {
  TICKS_PER_SEC = 3;
  LOG_LEVEL: ILogLevel = Logger.INFO;

  clients: {
    [playerId: number]: {
      ws: ServerWebSocket<unknown>;
      player: Player;
      lastProcessedMessage?: ClientMessage;
    };
  } = {};
  idCount = 0;
  serverMessageQ: ServerMessage[] = [];
  clientMessageQ: ClientMessage[] = [];

  constructor() {
    Logger.useDefaults({
      defaultLevel: this.LOG_LEVEL,
      formatter: (msgs, ctx) => {
        msgs.unshift(`${ctx.level.name}:`);
      },
    });
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
      Logger.warn(
        "not allowed to change another player's state",
        `player ${playerId} tried to change ${message.playerId}`,
      );
      Logger.warn("disconnecting player", playerId);
      this.clients[playerId].ws.close(4444, "not allowed");
      return;
    }

    this.clientMessageQ.push(message);
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
        // discard this client's messages
        this.clientMessageQ = this.clientMessageQ.filter(
          (m) => m.playerId !== playerId,
        );

        Logger.info(
          `player ${colors.FgCyan + playerId + colors.FgRed} left  ${colors.Reset}`,
          "| total:",
          Object.keys(this.clients).length,
        );
        break;

      case "playerJoined":
        msg.msgType = "welcome";
        const ws = this.clients[msg.player!.id]?.ws;
        if (!ws) {
          Logger.error("player", msg.player!.id, "not in clients");
          return;
        }
        ws.send(JSON.stringify(msg), true);

        // notify new player of other players
        Object.entries(this.clients).forEach(([_k, v]) => {
          const pMsg: ServerMessage = {
            ts: performance.now(),
            msgType: "playerJoined",
            player: v.player,
          };
          ws.send(JSON.stringify(pMsg), true);
        });
        Logger.debug(
          `${colors.FgYellow}Notifying${colors.Reset} players already in game to player ${colors.FgCyan}${msg.player!.id}${colors.Reset}`,
        );

        // notify other players of new player
        msg.msgType = "playerJoined";

        this.broadcast(msg);
        Logger.debug(
          `${colors.FgYellow}Notifying${colors.Reset} all players that player ${colors.FgCyan}${msg.player!.id} ${colors.FgGreen}joined${colors.Reset}`,
        );
        Logger.info(
          `player ${colors.FgCyan + msg.player!.id + colors.FgGreen} joined${colors.Reset}`,
          "| total:",
          Object.keys(this.clients).length,
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
      Logger.warn(
        "player id not registered in clients: ",
        msg.playerId,
        Object.keys(this.clients),
        "-> Discarding msg",
      );
      return;
    }

    const lastMsg = this.clients[msg.playerId].lastProcessedMessage;
    const dt = lastMsg ? msg.ts - lastMsg.ts : 0;
    this.clients[msg.playerId].player.update(dt / 1000.0);
    this.clients[msg.playerId].player.state = msg.state;
    this.clients[msg.playerId].lastProcessedMessage = msg;
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

    this.clientMessageQ.sort((a, b) => a.msgSeq - b.msgSeq);
    now = performance.now();
    while (this.clientMessageQ.length > 0) {
      const msg = this.clientMessageQ[0];
      if (msg.ts <= now) {
        this.processClientMessage(msg);
      } // process messages before current time

      this.clientMessageQ.splice(0, 1); // delete processed message
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
      if (typeof message !== "string") {
        Logger.error("invalid message type");
        return;
      }
      Logger.trace(`got ${message}`);
      server.addMessage(ws, JSON.parse(message));
    },
    close: (ws) => {
      server.removeClient(ws);
    },
  },
});

console.log(`Server running at ${bun.url}\n`);
