import { ServerWebSocket, sleepSync } from "bun"
import { ClientMessage, Message, newPlayer, Player, updatePlayer } from "./common"

const clients: { [playerId: number]: { ws: ServerWebSocket<unknown>, player: Player } } = {}
let idCount = 0

const findId = (ws: ServerWebSocket<unknown>) => {
  let wsId: number = -1
  Object.entries(clients).forEach(([k, v]) => {
    if (v.ws === ws) wsId = parseInt(k)
  })
  return wsId
}

const messageHandler = (playerId: number, message: ClientMessage) => {
  sleepSync(200)
  if (playerId !== message.id) {
    console.log("not allowed to change another player's state")
    clients[playerId].ws.close(4444, "not allowed")
    return
  }
  const msg: Message = {
    msgType: "anotherClient",
    message
  }
  broadcast(msg, playerId)
}

function broadcast(msg: Message, except: number = -1) {
  Object.entries(clients).forEach(([k, v]) => {
    if (k !== except.toString()) {
      v.ws.sendText(JSON.stringify(msg))
    }
  })
}

const bun = Bun.serve({
  port: 3000,
  fetch(req, server) {
    if (server.upgrade(req)) {
      return undefined
    }
    return new Response("nothing", { status: 404 })
  },
  websocket: {
    open: (ws) => {
      const player = newPlayer(idCount)
      clients[idCount] = {
        ws,
        player
      }
      const message: Message = {
        msgType: "server",
        message: {
          msgType: "welcome",
          player
        }
      }
      ws.sendText(JSON.stringify(message), true)
      Object.entries(clients).forEach(([_k, v]) => {
        const pMsg: Message = {
          msgType: "server",
          message: {
            msgType: "playerJoined",
            player: v.player
          }
        }
        ws.send(JSON.stringify(pMsg), true)
      })
      message.message = {
        msgType: "playerJoined",
        player
      }
      broadcast(message)
      console.log(`player ${idCount++} joined`)
    },
    message: (ws, message) => {
      if (typeof message !== "string") {
        console.log("invalid message type")
        return
      }
      const id = findId(ws)
      messageHandler(id, JSON.parse(message) as ClientMessage)
      console.log(`got ${message} from player ${id}`)
    },
    close: (ws) => {
      const wsId = findId(ws)
      if (wsId === -1) return
      const msg: Message = {
        msgType: "server",
        message: {
          msgType: "playerLeft",
          player: clients[wsId].player
        }
      }
      delete clients[wsId]
      broadcast(msg, wsId)
      console.log(`player ${wsId} left`)
      console.log("num of players: ", Object.entries(clients).length)
    },
  }
})

function tick(dt: number) {
  Object.entries(clients).forEach(([_k, v]) => {
    updatePlayer(v.player, dt)
  })
}

const TICKS_PER_SEC = 60

setInterval(() => {
  tick(1 / TICKS_PER_SEC)
}, 1000 / TICKS_PER_SEC)

console.log(`Server running at ${bun.url}\n`)
