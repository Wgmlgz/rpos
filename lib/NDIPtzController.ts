/// <reference path="../rpos.d.ts"/>

import { PtzCommand, PtzStatus } from './ptzTypes';
import { Server, Socket } from 'socket.io';
import { createServer } from 'http';


class UnrealController {
  httpServer = createServer();
  io = new Server(this.httpServer, { cors: { origin: '*' } });

  ptzStatus: PtzStatus = {
    Position: {
      PanTilt: {
        x: 1,
        y: 1
      },
      Zoom: {
        x: 1
      }
    },
    MoveStatus: {
      PanTilt: 'IDLE',
      Zoom: 'IDLE'
    }
  };

  constructor() {
    this.io.on('connection', (socket: Socket) => {
      console.log('Unreal client connected:', socket.id);

      socket.on('ptz_status', (newPtzStatus: PtzStatus) => {
        // console.log('got ptz status:', newPtzStatus);
        this.ptzStatus = newPtzStatus
      });
    });

  

    this.httpServer.listen(5666, () => console.log('Socket.io server on port 5666'));
  }

  async handleCommand(cmd: PtzCommand) {
    this.io.emit('command', cmd);
  }
}

export = UnrealController;