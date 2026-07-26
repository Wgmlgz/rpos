/// <reference path="../rpos.d.ts"/>

import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { PtzCommand, PtzStatus } from './ptzTypes';

type AxisName = 'pan' | 'tilt' | 'zoom';

type PtzPose = { pan: number; tilt: number; zoom: number };

/**
 * The simulated camera head.  This process is deliberately the only owner of
 * PTZ state: Unreal receives sampled poses and renders them without applying
 * another interpolation curve.
 */
class AuthoritativeUnrealPtzController {
  private readonly settings: UnrealAuthoritativePtzConfig;
  private readonly httpServer = createServer();
  private readonly io = new Server(this.httpServer, { cors: { origin: '*' } });
  private readonly tickIntervalMs: number;
  private readonly continuousVelocity: { [axis: string]: number } = { pan: 0, tilt: 0, zoom: 0 };
  private readonly home: { pan: number; tilt: number; zoom: number };
  // Pan is circular. Keep an unwrapped coordinate while moving so crossing
  // the ONVIF -1/+1 seam remains a small, continuous physical movement.
  private panUnwrapped: number;
  // Mirrors RposConnect: one absolute PTZ command owns a common move clock,
  // while every axis has its own calibrated delay and duration.
  private absoluteStarted: PtzPose;
  private absoluteTarget: PtzPose;
  private absoluteStartedAtMs = 0;
  private isAbsoluteMode = false;
  private lastTickMs: number;
  private sequence = 0;

  ptzStatus: PtzStatus;

  constructor(config: rposConfig) {
    this.settings = config.UnrealAuthoritativePtz || {};
    const socketIoPort = this.numberSetting(this.settings.SocketIoPort, 5666);
    this.tickIntervalMs = Math.max(4, Math.round(1000 / this.numberSetting(this.settings.TickRateHz, 120)));

    const initialPan = this.clamp(this.numberSetting(this.settings.InitialPan, 0.5), -1, 1);
    const initialTilt = this.clamp(this.numberSetting(this.settings.InitialTilt, 1), -1, 1);
    const initialZoom = this.clamp(this.numberSetting(this.settings.InitialZoom, 0), 0, 1);
    this.panUnwrapped = initialPan;
    this.home = { pan: initialPan, tilt: initialTilt, zoom: initialZoom };
    this.absoluteStarted = { ...this.home };
    this.absoluteTarget = { ...this.home };
    this.ptzStatus = {
      Position: { PanTilt: { x: initialPan, y: initialTilt }, Zoom: { x: initialZoom } },
      MoveStatus: { PanTilt: 'IDLE', Zoom: 'IDLE' }
    };
    this.lastTickMs = Date.now();

    this.io.on('connection', (socket: Socket) => {
      console.log('[AuthoritativeUnrealPtz] Unreal client connected:', socket.id);
      this.publishPose(socket);
    });
    this.httpServer.listen(socketIoPort, () => console.log('[AuthoritativeUnrealPtz] Socket.IO server on port ' + socketIoPort));
    setInterval(() => this.tick(), this.tickIntervalMs);
    this.publishPose();
  }

  handleCommand(command: PtzCommand) {
    const now = Date.now();
    this.advance(now);
    switch (command.type) {
      case 'gotohome':
        this.startAbsolute(this.home.pan, this.home.tilt, this.home.zoom, now);
        break;
      case 'sethome':
        this.home.pan = this.ptzStatus.Position.PanTilt.x;
        this.home.tilt = this.ptzStatus.Position.PanTilt.y;
        this.home.zoom = this.ptzStatus.Position.Zoom.x;
        break;
      case 'absolute-ptz':
        this.startAbsolute(command.pan, command.tilt, command.zoom, now);
        break;
      case 'relative-ptz':
        this.startAbsolute(
          this.ptzStatus.Position.PanTilt.x + command.pan,
          this.ptzStatus.Position.PanTilt.y + command.tilt,
          this.ptzStatus.Position.Zoom.x + command.zoom,
          now
        );
        break;
      case 'ptz':
        this.cancelAbsoluteMotion();
        this.setContinuous('pan', command.pan, now);
        this.setContinuous('tilt', command.tilt, now);
        this.setContinuous('zoom', command.zoom, now);
        break;
    }
    this.updateMoveStatus(now);
    this.publishPose();
  }

  private tick() {
    this.advance(Date.now());
    this.publishPose();
  }

  private startAbsolute(pan: number, tilt: number, zoom: number, now: number) {
    const targetPan = this.clamp(pan, -1, 1);
    this.absoluteStarted = this.currentPose();
    this.absoluteTarget = {
      // Two normalized pan units are one 360-degree revolution. Select the
      // equivalent target nearest to the present unwrapped heading.
      pan: this.panUnwrapped + this.shortestPanDelta(this.ptzStatus.Position.PanTilt.x, targetPan),
      tilt: this.clamp(tilt, -1, 1),
      zoom: this.clamp(zoom, 0, 1)
    };
    this.absoluteStartedAtMs = now;
    this.isAbsoluteMode = (['pan', 'tilt', 'zoom'] as AxisName[]).some(axis => this.isAbsoluteAxisActive(axis));
    this.continuousVelocity.pan = 0;
    this.continuousVelocity.tilt = 0;
    this.continuousVelocity.zoom = 0;
  }

  private setContinuous(axis: AxisName, requestedVelocity: number, now: number) {
    this.continuousVelocity[axis] = this.clamp(requestedVelocity, -1, 1);
    this.lastTickMs = now;
  }

  private cancelAbsoluteMotion() {
    this.isAbsoluteMode = false;
    this.absoluteStartedAtMs = 0;
  }

  private advance(now: number) {
    const elapsedSeconds = Math.max(0, (now - this.lastTickMs) / 1000);
    this.lastTickMs = now;
    if (this.isAbsoluteMode) {
      const elapsedMs = Math.max(0, now - this.absoluteStartedAtMs);
      this.advanceAbsoluteAxis('pan', elapsedMs);
      this.advanceAbsoluteAxis('tilt', elapsedMs);
      this.advanceAbsoluteAxis('zoom', elapsedMs);
      if (this.isAbsoluteComplete(elapsedMs)) this.isAbsoluteMode = false;
    } else {
      this.advanceContinuousAxis('pan', elapsedSeconds);
      this.advanceContinuousAxis('tilt', elapsedSeconds);
      this.advanceContinuousAxis('zoom', elapsedSeconds);
    }
    this.updateMoveStatus(now);
  }

  private advanceContinuousAxis(axis: AxisName, elapsedSeconds: number) {
    const velocity = this.continuousVelocity[axis];
    if (velocity === 0) return;
    const delta = velocity * this.axisSetting(axis, 'ContinuousUnitsPerSecond', axis === 'pan' ? 0.5 : axis === 'tilt' ? 2 : 0.25) * elapsedSeconds;
    if (axis === 'pan') {
      this.setAxisValue(axis, this.panUnwrapped + delta);
      return;
    }
    const next = this.axisValue(axis) + delta;
    const min = axis === 'zoom' ? 0 : -1;
    const max = 1;
    const clamped = this.clamp(next, min, max);
    this.setAxisValue(axis, clamped);
    if (clamped !== next) this.continuousVelocity[axis] = 0;
  }

  private advanceAbsoluteAxis(axis: AxisName, elapsedMs: number) {
    const start = this.absoluteStarted[axis];
    const target = this.absoluteTarget[axis];
    const distance = Math.abs(target - start);
    const delayMs = this.axisDelayMs(axis);
    const durationMs = this.axisDurationMs(axis, distance);
    if (elapsedMs <= delayMs) {
      this.setAxisValue(axis, start);
      return;
    }
    const t = Math.min(1, (elapsedMs - delayMs) / Math.max(1, durationMs));
    this.setAxisValue(axis, start + (target - start) * this.quadEaseInOut(t));
  }

  private isAbsoluteComplete(elapsedMs: number) {
    return (['pan', 'tilt', 'zoom'] as AxisName[]).every(axis => {
      if (!this.isAbsoluteAxisActive(axis)) return true;
      const distance = Math.abs(this.absoluteTarget[axis] - this.absoluteStarted[axis]);
      const delayMs = this.axisDelayMs(axis);
      const durationMs = this.axisDurationMs(axis, distance);
      return elapsedMs >= delayMs + durationMs;
    });
  }

  private isAbsoluteAxisActive(axis: AxisName) {
    return Math.abs(this.absoluteTarget[axis] - this.absoluteStarted[axis]) >= 0.000001;
  }

  private isAbsoluteGroupStatusMoving(now: number, axes: AxisName[], movingDelayMs: number, settleMs: number) {
    if (!this.absoluteStartedAtMs || !axes.some(axis => this.isAbsoluteAxisActive(axis))) return false;

    const elapsedMs = Math.max(0, now - this.absoluteStartedAtMs);
    if (elapsedMs < movingDelayMs) return false;

    const physicalCompleteAtMs = Math.max(...axes
      .filter(axis => this.isAbsoluteAxisActive(axis))
      .map(axis => this.axisDelayMs(axis) + this.axisDurationMs(axis,
        Math.abs(this.absoluteTarget[axis] - this.absoluteStarted[axis]))));
    return elapsedMs < physicalCompleteAtMs + settleMs;
  }

  // Exact equivalent of RposConnect.QuadEaseInOut: UE EaseInOut, exponent 2.
  private quadEaseInOut(t: number) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  private updateMoveStatus(now: number) {
    // Real logs show separate PanTilt and Zoom status clocks: they report
    // MOVING about 60 ms after a command. PanTilt remains MOVING briefly
    // after its physical pose reaches the reported target. Zoom intentionally
    // has no completion hold because its status can precede its quantized
    // final position in the recorded camera telemetry.
    const panTiltMoving = this.isAbsoluteGroupStatusMoving(
      now,
      ['pan', 'tilt'],
      this.numberSetting(this.settings.PanTiltStatusMovingDelayMs, 60),
      this.numberSetting(this.settings.PanTiltStatusSettleMs, 60))
      || this.continuousVelocity.pan !== 0 || this.continuousVelocity.tilt !== 0;
    const zoomMoving = this.isAbsoluteGroupStatusMoving(
      now,
      ['zoom'],
      this.numberSetting(this.settings.ZoomStatusMovingDelayMs, 60),
      0)
      || this.continuousVelocity.zoom !== 0;
    this.ptzStatus.MoveStatus.PanTilt = panTiltMoving ? 'MOVING' : 'IDLE';
    this.ptzStatus.MoveStatus.Zoom = zoomMoving ? 'MOVING' : 'IDLE';
  }

  private publishPose(socket?: Socket) {
    const zoom = this.ptzStatus.Position.Zoom.x;
    const wideFov = this.numberSetting(this.settings.WideHorizontalFovDegrees, 57.6);
    const teleFov = this.numberSetting(this.settings.TeleHorizontalFovDegrees, 2.5);
    // Dronolovka's CameraQ::setFromAnglesDegreesLinear interpolates the
    // image focal length between its calibrated wide and tele endpoints.
    // Convert that focal length back to a horizontal FOV before rendering.
    // This intentionally gives fov(0) == wideFov and fov(1) == teleFov.
    const fovDegrees = this.focalLengthInterpolatedFov(zoom, wideFov, teleFov);
    const packet = {
      type: 'rpos-authoritative-ptz/v1',
      sequence: ++this.sequence,
      timestampMs: Date.now(),
      // Unreal receives final physical values only. It must not reinterpret
      // ONVIF normalized coordinates or reproduce camera calibration.
      panDegrees: this.normalizedToDegrees(this.panUnwrapped, 'pan'),
      tiltDegrees: this.normalizedToDegrees(this.ptzStatus.Position.PanTilt.y, 'tilt'),
      fovDegrees: fovDegrees,
      panTiltMoving: this.ptzStatus.MoveStatus.PanTilt === 'MOVING',
      zoomMoving: this.ptzStatus.MoveStatus.Zoom === 'MOVING'
    };
    // A separate event keeps the legacy Blueprint's `command` event isolated.
    // Both paths still use the same Socket.IO server and connection semantics.
    if (socket) socket.emit('authoritative_ptz_pose', packet);
    else this.io.emit('authoritative_ptz_pose', packet);
  }

  private axisValue(axis: AxisName) {
    if (axis === 'pan') return this.panUnwrapped;
    if (axis === 'tilt') return this.ptzStatus.Position.PanTilt.y;
    return this.ptzStatus.Position.Zoom.x;
  }

  private currentPose(): PtzPose {
    return { pan: this.axisValue('pan'), tilt: this.axisValue('tilt'), zoom: this.axisValue('zoom') };
  }

  private setAxisValue(axis: AxisName, value: number) {
    if (axis === 'pan') {
      this.panUnwrapped = value;
      this.ptzStatus.Position.PanTilt.x = this.wrapPan(value);
    }
    else if (axis === 'tilt') this.ptzStatus.Position.PanTilt.y = value;
    else this.ptzStatus.Position.Zoom.x = value;
  }

  private axisSetting(axis: AxisName, suffix: string, fallback: number) {
    const key = axis.charAt(0).toUpperCase() + axis.slice(1) + suffix;
    return this.numberSetting((this.settings as any)[key], fallback);
  }

  private axisDelayMs(axis: AxisName) {
    return this.axisSetting(axis, 'DelayMs', axis === 'pan' ? 113.30742787780821 : axis === 'tilt' ? 0.00000003207598383890545 : 3.7706482012784455);
  }

  private axisDurationMs(axis: AxisName, distance: number) {
    const intercept = this.axisSetting(axis, 'DurationInterceptMs', axis === 'pan' ? 292.0285252686576 : axis === 'tilt' ? 229.11901801258966 : 84.59501229630219);
    const slope = this.axisSetting(axis, 'DurationSlopeMs', axis === 'pan' ? 3943.7454709323897 : axis === 'tilt' ? 4546.536330552906 : 4080.330872211935);
    return intercept + distance * slope;
  }

  private numberSetting(value: any, fallback: number) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  private focalLengthInterpolatedFov(zoom: number, wideFovDegrees: number, teleFovDegrees: number) {
    const clampedZoom = this.clamp(zoom, 0, 1);
    const radiansPerDegree = Math.PI / 180;
    const wideTanHalfFov = Math.tan(wideFovDegrees * radiansPerDegree / 2);
    const teleTanHalfFov = Math.tan(teleFovDegrees * radiansPerDegree / 2);
    const inverseTanHalfFov = (1 - clampedZoom) / wideTanHalfFov + clampedZoom / teleTanHalfFov;
    return 2 * Math.atan(1 / inverseTanHalfFov) / radiansPerDegree;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, isFinite(value) ? value : 0));
  }

  private shortestPanDelta(from: number, to: number) {
    let delta = to - from;
    if (delta > 1) delta -= 2;
    else if (delta < -1) delta += 2;
    return delta;
  }

  private wrapPan(value: number) {
    let wrapped = (value + 1) % 2;
    if (wrapped < 0) wrapped += 2;
    return wrapped - 1;
  }

  private normalizedToDegrees(value: number, axis: 'pan' | 'tilt') {
    const atMinusOne = axis === 'pan'
      ? this.numberSetting(this.settings.PanDegreesAtMinusOne, 180)
      : this.numberSetting(this.settings.TiltDegreesAtMinusOne, 90);
    const atPlusOne = axis === 'pan'
      ? this.numberSetting(this.settings.PanDegreesAtPlusOne, -180)
      : this.numberSetting(this.settings.TiltDegreesAtPlusOne, 0);
    return atMinusOne + (value + 1) * (atPlusOne - atMinusOne) / 2;
  }
}

export = AuthoritativeUnrealPtzController;
