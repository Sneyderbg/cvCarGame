import { ClientMessage, Message, newPlayer, Player, ServerMessage, updatePlayer } from './common'
import './style.css'
import { init, initialized, player, processVideo, setPlayer } from './cv'

let lastTime = 0
const canvas = document.getElementById("canvas") as HTMLCanvasElement
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D
let ws: WebSocket

let me: number = -1
let players: { [id: string]: Player } = {}

const nextFrame = () => requestAnimationFrame((time) => {
  const dt = time - lastTime
  lastTime = time
  loop(dt / 1000.0)
})

function configWS() {
  ws = new WebSocket("ws://localhost:3000")
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.addEventListener("message", (ev) => {
      let msg = JSON.parse(ev.data.toString()) as Message
      if (msg.msgType === "server") {
        const message = msg.message as ServerMessage
        if (message.msgType === "welcome") {
          me = message.player.id
          players[me] = message.player
          setPlayer(players[me])
        }
        if (message.msgType === "playerJoined" && message.player.id !== me) {
          players[message.player.id] = message.player
        }
        if (message.msgType === "playerLeft" && message.player.id !== me) {
          delete players[message.player.id]
        }
      } else {
        const clientMessage = msg.message as ClientMessage
        if (clientMessage.msType === "updateMovement") {
          players[clientMessage.id].state.moving = clientMessage.moving ?? false
          players[clientMessage.id].x = clientMessage.x ?? 0
          players[clientMessage.id].y = clientMessage.y ?? 0
        }
        if (clientMessage.msType === "updateRotation") {
          players[clientMessage.id].state.rotDir = clientMessage.rotDir ?? 0
          players[clientMessage.id].angle = clientMessage.angle ?? 0
        }
      }
    })
    window.addEventListener("beforeunload", () => {
      ws.close()
    })
  } else {
    me = 0
    players[me] = newPlayer(me)
    setPlayer(players[me])
  }
}

function configKeys() {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp"]
  document.addEventListener("keydown", (e) => {
    if (keys.indexOf(e.key) !== -1) e.preventDefault()
    if (!e.repeat && (e.code === "ArrowLeft" || e.code === "ArrowRight")) {
      const rotDir = e.code === "ArrowLeft" ? -1 : 1
      players[me].state.rotDir = rotDir

      const msg: ClientMessage = {
        msType: "updateRotation",
        id: me,
        rotDir: rotDir,
        angle: players[me].angle
      }
      ws.send(JSON.stringify(msg))
    }
    if (!e.repeat && e.code === "ArrowUp") {
      players[me].state.moving = true
      const msg: ClientMessage = {
        msType: "updateMovement",
        id: me,
        moving: true,
        x: players[me].x,
        y: players[me].y
      }
      ws.send(JSON.stringify(msg))
    }
  })
  document.addEventListener("keyup", (e) => {
    if (keys.indexOf(e.key) !== -1) e.preventDefault()
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      players[me].state.rotDir = 0
      const msg: ClientMessage = {
        msType: "updateRotation",
        id: me,
        rotDir: 0,
        angle: players[me].angle
      }
      ws.send(JSON.stringify(msg))
    }
    if (e.code === "ArrowUp") {
      players[me].state.moving = false
      const msg: ClientMessage = {
        msType: "updateMovement",
        id: me,
        moving: false,
        x: players[me].x,
        y: players[me].y
      }
      ws.send(JSON.stringify(msg))
    }
  })
}

function start() {
  if (!ctx) throw new Error("failed to get canvas context")
  players = {}
  me = -1
  configWS()
  configKeys()

  nextFrame()
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const [w, h] = [50, 20]
  for (const id in players) {
    const player = players[id]
    ctx.fillStyle = "red"
    ctx.strokeStyle = "blue"
    ctx.lineWidth = 2
    ctx.translate(player.x, player.y)
    ctx.rotate(player.angle)
    ctx.fillRect(- w / 2, - h / 2, w, h)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(w, 0)
    ctx.closePath()
    ctx.stroke()
    ctx.resetTransform()
  }
}

function loop(dt: number) {
  if (player) {
    players[me].velScaling = player.velScaling
    players[me].rotVel = player.rotVel
    players[me].state.rotDir = player.state.rotDir
    players[me].state.moving = player.state.moving
  }
  for (let id in players) {
    const p = players[id]
    updatePlayer(p, dt)
  }
  if (initialized) {
    processVideo()
  }
  draw()
  nextFrame()
}

init()
start()
