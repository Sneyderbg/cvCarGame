
export const ROT_VEL = 1.6
export const MOV_VEL = 200

export interface Player {
  id: number,
  x: number,
  y: number,
  angle: number,
  velocity: number
  velScaling: number,
  rotVel: number,
  state: {
    rotDir: -1 | 0 | 1,
    moving: boolean
  }
}

export interface Message {
  msgType: "server" | "anotherClient"
  message: ServerMessage | ClientMessage
}

export interface ServerMessage {
  msgType: "welcome" | "playerJoined" | "playerLeft",
  player: Player
}

export interface ClientMessage {
  msType: "updateMovement" | "updateRotation",
  id: number,
  x?: number,
  y?: number,
  angle?: number
  moving?: boolean,
  rotDir?: -1 | 0 | 1,
}

export function newPlayer(id: number): Player {
  return {
    id,
    x: 200,
    y: 100,
    angle: -90 * Math.PI / 180,
    velocity: 0,
    velScaling: 1,
    rotVel: 1,
    state: {
      rotDir: 0,
      moving: false
    }
  }
}

export function updatePlayer(p: Player, dt: number) {
  p.angle += ROT_VEL * p.state.rotDir * p.rotVel * dt
  p.angle = (p.angle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
  p.velocity = p.state.moving ? MOV_VEL : 0
  p.x += Math.cos(p.angle) * p.velocity * p.velScaling * dt
  p.y += Math.sin(p.angle) * p.velocity * p.velScaling * dt
}

