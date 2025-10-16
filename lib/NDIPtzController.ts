/// <reference path="../rpos.d.ts"/>

import { PtzCommand } from './ptzTypes';
import { Server, Socket } from 'socket.io';
import { createServer } from 'http';

class NDIPtzController {
  httpServer = createServer();
  io = new Server(this.httpServer, { cors: { origin: '*' } });

  constructor() {
    this.io.on('connection', (socket: Socket) => {
      console.log('Unreal client connected:', socket.id);
    });

    this.httpServer.listen(5666, () => console.log('Socket.io server on port 5666'));
  }

  async handleCommand(cmd: PtzCommand) {
    this.io.emit('command', cmd);
  }
}

export = NDIPtzController;