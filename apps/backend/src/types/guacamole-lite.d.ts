declare module 'guacamole-lite' {
  import { Server as HttpServer } from 'http';
  import { EventEmitter } from 'events';

  interface WebSocketServerOptions {
    server: HttpServer;
    path?: string;
  }

  class GuacamoleLite extends EventEmitter {
    constructor(wsOptions: WebSocketServerOptions, guacdOptions?: any, clientOptions?: any);
    activeConnections: Map<string, any>;
    webSocketServer: EventEmitter;
  }

  export default GuacamoleLite;
}
