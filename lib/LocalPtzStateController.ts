/// <reference path="../rpos.d.ts"/>

import { PtzCommand, PtzStatus } from './ptzTypes';

// Applies virtual PTZ commands immediately.  Continuous ONVIF moves do not
// include elapsed time here, so each request advances the position by a small,
// fixed amount rather than starting a background motion loop.
class LocalPtzStateController {
  private static readonly CONTINUOUS_STEP = 0.05;
  private home = { pan: 0, tilt: 0, zoom: 0 };

  ptzStatus: PtzStatus = {
    Position: {
      PanTilt: { x: 0, y: 0 },
      Zoom: { x: 0 }
    },
    MoveStatus: {
      PanTilt: 'IDLE',
      Zoom: 'IDLE'
    }
  };

  handleCommand(command: PtzCommand) {
    switch (command.type) {
      case 'gotohome':
        this.setPosition(this.home.pan, this.home.tilt, this.home.zoom);
        break;
      case 'sethome':
        this.home = this.position();
        break;
      case 'absolute-ptz':
        this.setPosition(command.pan, command.tilt, command.zoom);
        break;
      case 'relative-ptz':
        this.moveBy(command.pan, command.tilt, command.zoom);
        break;
      case 'ptz':
        this.moveBy(
          command.pan * LocalPtzStateController.CONTINUOUS_STEP,
          command.tilt * LocalPtzStateController.CONTINUOUS_STEP,
          command.zoom * LocalPtzStateController.CONTINUOUS_STEP
        );
        break;
    }
  }

  private position() {
    return {
      pan: this.ptzStatus.Position.PanTilt.x,
      tilt: this.ptzStatus.Position.PanTilt.y,
      zoom: this.ptzStatus.Position.Zoom.x
    };
  }

  private moveBy(pan: number, tilt: number, zoom: number) {
    const current = this.position();
    this.setPosition(current.pan + pan, current.tilt + tilt, current.zoom + zoom);
  }

  private setPosition(pan: number, tilt: number, zoom: number) {
    this.ptzStatus.Position.PanTilt.x = this.clamp(pan, -1, 1);
    this.ptzStatus.Position.PanTilt.y = this.clamp(tilt, -1, 1);
    this.ptzStatus.Position.Zoom.x = this.clamp(zoom, 0, 1);
    this.ptzStatus.MoveStatus.PanTilt = 'IDLE';
    this.ptzStatus.MoveStatus.Zoom = 'IDLE';
  }

  private clamp(value: number, min: number, max: number) {
    const numeric = Number.isFinite(value) ? value : 0;
    return Math.max(min, Math.min(max, numeric));
  }
}

export = LocalPtzStateController;
