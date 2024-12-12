import { lerp, properMod, rLerp } from "./util";

export const ROT_VEL = 1.6;
export const MOV_VEL = 200;

interface PlayerState {
  rotDir: -1 | 0 | 1;
  moving: -1 | 0 | 1;
}

export interface IPlayer {
  id: number;
  color: string;
  x: number;
  y: number;
  angle: number;
  velocity: number;
  velScaling: number;
  rotVel: number;
  state: PlayerState;
}

export class Player implements IPlayer {
  CANVAS_WIDTH = 800;
  CANVAS_HEIGHT = 600;
  w = 50;
  h = 20;
  color = "red";
  frontColor = "blue";

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
    p.setState(player.state);
    p.color = player.color;
    return p;
  }

  static lerpPlayer(playerFrom: IPlayer, playerTo: IPlayer, x: number) {
    x = Math.max(0, Math.min(x, 1));
    const l = Player.fromPlayer(playerFrom);
    l.x = lerp(l.x, playerTo.x, x);
    l.y = lerp(l.y, playerTo.y, x);
    l.angle = rLerp(l.angle, playerTo.angle, x);
    return l;
  }

  lerpTo(playerTo: IPlayer, x: number) {
    this.x = lerp(this.x, playerTo.x, x);
    this.y = lerp(this.y, playerTo.y, x);
    this.angle = rLerp(this.angle, playerTo.angle, x);
  }

  setTo(player: IPlayer, onlyPhysics?: boolean) {
    // ignoring id

    this.x = player.x;
    this.y = player.y;
    this.angle = player.angle;
    this.velocity = player.velocity;
    this.velScaling = player.velScaling;
    this.rotVel = player.rotVel;
    if (onlyPhysics) return;

    this.setState(player.state);
  }

  setState(state: PlayerState) {
    this.state = { ...state };
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

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.frontColor;
    ctx.lineWidth = 2;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(this.w, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.resetTransform();
  }

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
