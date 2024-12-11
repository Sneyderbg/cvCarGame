import { properMod } from "./util";

export const ROT_VEL = 1.6;
export const MOV_VEL = 200;

export interface IPlayer {
  id: number;
  x: number;
  y: number;
  angle: number;
  velocity: number;
  velScaling: number;
  rotVel: number;
  state: {
    rotDir: -1 | 0 | 1;
    moving: -1 | 0 | 1;
  };
}

export class Player implements IPlayer {
  id: number;
  x: number;
  y: number;
  angle: number;
  velocity: number;
  velScaling: number;
  rotVel: number;
  state: {
    rotDir: -1 | 0 | 1;
    moving: -1 | 0 | 1;
  };

  constructor(id: number) {
    this.id = id;
    this.x = 200;
    this.y = 100;
    // this.angle = properMod((-90 * Math.PI) / 180, 2 * Math.PI);
    this.angle = 0;
    this.velocity = 0;
    this.velScaling = 1;
    this.rotVel = 1;
    this.state = {
      rotDir: 0,
      moving: 0,
    };
  }

  static fromPlayer(player: IPlayer) {
    const p = new Player(player.id);
    p.x = player.x;
    p.y = player.y;
    p.angle = player.angle;
    p.velocity = player.velocity;
    p.velScaling = player.velScaling;
    p.rotVel = player.rotVel;
    p.state = player.state;
    return p;
  }

  updateWith(playerState: IPlayer, onlyPhysics?: boolean) {
    // ignoring id

    this.x = playerState.x;
    this.y = playerState.y;
    this.angle = playerState.angle;
    this.velocity = playerState.velocity;
    this.velScaling = playerState.velScaling;
    this.rotVel = playerState.rotVel;
    if (onlyPhysics) return;

    this.state = playerState.state;
  }

  rotateLeft() {
    this.state.rotDir = -1;
  }
  rotateRight() {
    this.state.rotDir = 1;
  }
  stopRotation() {
    this.state.rotDir = 0;
  }
  forward() {
    this.state.moving = 1;
  }
  backward() {
    this.state.moving = -1;
  }
  stop() {
    this.state.moving = 0;
  }
  CANVAS_WIDTH = 800;
  CANVAS_HEIGHT = 600;
  // dt in s
  update(dt: number) {
    this.angle += ROT_VEL * this.state.rotDir * this.rotVel * dt;
    this.angle = properMod(this.angle, 2 * Math.PI);
    this.velocity = this.state.moving * MOV_VEL;
    this.x += Math.cos(this.angle) * this.velocity * this.velScaling * dt;
    this.y += Math.sin(this.angle) * this.velocity * this.velScaling * dt;
    this.x = properMod(this.x, this.CANVAS_WIDTH);
    this.y = properMod(this.y, this.CANVAS_HEIGHT);
  }
}

export interface ServerMessage {
  msgType: "welcome" | "playerJoined" | "playerLeft" | "playerUpdate";
  lastProcMsgSeq?: number;
  ts: number; // microseconds
  player?: IPlayer;
  players?: IPlayer[];
}

export interface ClientMessage {
  playerId: number;
  msgSeq: number;
  ts: number; // microseconds
  state: {
    moving: -1 | 0 | 1;
    rotDir: -1 | 0 | 1;
  };
}
