import type { Server } from "http";
import { WebSocketServer } from "ws";

type RealtimePayload = {
  event: string;
  data?: unknown;
  at: string;
};

let wss: WebSocketServer | null = null;

export function setupRealtime(httpServer: Server) {
  if (wss) return;
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });
}

export function broadcastRealtime(event: string, data?: unknown) {
  if (!wss) return;
  const payload: RealtimePayload = {
    event,
    data,
    at: new Date().toISOString(),
  };
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}
