/**
 * Kriti AI - Real-Time Cross-Platform Gateway Server
 * Phase 2 & 3: High-Speed WebSocket & REST Gateway for Desktop & Android Sync
 */

import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { EventEmitter } from 'events';

export interface SyncMessage {
  type: 
    | 'CHAT_MESSAGE'
    | 'STREAM_CHUNK'
    | 'APPROVAL_REQUEST'
    | 'APPROVAL_RESPONSE'
    | 'DIFF_ARTIFACT'
    | 'STATUS_UPDATE'
    | 'COMMAND_EXECUTE'
    | 'COMMAND_OUTPUT'
    | 'GET_FILE_TREE'
    | 'FILE_TREE_DATA'
    | 'READ_FILE'
    | 'FILE_CONTENT'
    | 'SAVE_FILE'
    | 'GET_STATUS';
  payload: any;
  sender: 'WINDOWS_HOST' | 'ANDROID_NODE' | 'DESKTOP_UI' | 'AGENT';
  timestamp: number;
  id: string;
}

export interface PendingApproval {
  id: string;
  actionType: 'TERMINAL_COMMAND' | 'FILE_WRITE' | 'EMAIL_SEND' | 'BROWSER_AUTOMATION';
  description: string;
  details: any;
  timestamp: number;
  resolve: (approved: boolean) => void;
}

export class GatewayServer extends EventEmitter {
  private server: http.Server;
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private authToken: string;

  constructor(port: number = 9876, authToken: string = 'kritiai-local-secret') {
    super();
    this.authToken = authToken;
    this.server = http.createServer(async (req, res) => {
      // Enable CORS for web clients
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = req.url || '';

      if (url === '/pair' || url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready', port, node: 'Windows_Host', timestamp: Date.now() }));
        return;
      }

      // REST: /api/status
      if (url === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'online',
          activeClients: this.clients.size,
          pendingApprovals: this.pendingApprovals.size,
          timestamp: Date.now()
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    });

    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocket();
    this.server.listen(port, () => {
      console.log(`[GatewayServer] 🚀 Kriti AI Gateway running on ws://0.0.0.0:${port}`);
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      console.log(`[GatewayServer] 📱 Client connected from ${req.socket.remoteAddress}`);
      this.clients.add(ws);

      // Initial Connection ACK
      this.sendToClient(ws, {
        type: 'STATUS_UPDATE',
        sender: 'WINDOWS_HOST',
        payload: { state: 'CONNECTED', activeApprovals: this.pendingApprovals.size },
        timestamp: Date.now(),
        id: `ack_${Date.now()}`
      });

      ws.on('message', (raw) => {
        try {
          const msg: SyncMessage = JSON.parse(raw.toString());
          this.handleIncomingMessage(msg, ws);
        } catch (e) {
          console.error('[GatewayServer] Failed to parse message:', e);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('[GatewayServer] Client disconnected');
      });
    });
  }

  private handleIncomingMessage(msg: SyncMessage, senderWs: WebSocket): void {
    console.log(`[GatewayServer] 📩 Received ${msg.type} from ${msg.sender}`);

    switch (msg.type) {
      case 'APPROVAL_RESPONSE': {
        const { approvalId, approved } = msg.payload;
        const pending = this.pendingApprovals.get(approvalId);
        if (pending) {
          pending.resolve(approved);
          this.pendingApprovals.delete(approvalId);
          this.broadcast({
            type: 'STATUS_UPDATE',
            sender: 'WINDOWS_HOST',
            payload: { message: `Approval ${approvalId} ${approved ? 'APPROVED' : 'REJECTED'}` },
            timestamp: Date.now(),
            id: `appr_res_${Date.now()}`
          });
        }
        break;
      }

      case 'CHAT_MESSAGE': {
        this.emit('chat_received', msg.payload);
        this.broadcastExcept(msg, senderWs);
        break;
      }

      case 'COMMAND_EXECUTE': {
        this.emit('command_execute', msg.payload, senderWs);
        break;
      }

      case 'GET_FILE_TREE': {
        this.emit('get_file_tree', msg.payload, senderWs);
        break;
      }

      case 'READ_FILE': {
        this.emit('read_file', msg.payload, senderWs);
        break;
      }

      case 'SAVE_FILE': {
        this.emit('save_file', msg.payload, senderWs);
        break;
      }

      case 'GET_STATUS': {
        this.emit('get_status', msg.payload, senderWs);
        break;
      }

      default:
        this.broadcastExcept(msg, senderWs);
    }
  }

  public requestApproval(
    actionType: PendingApproval['actionType'],
    description: string,
    details: any
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const approval: PendingApproval = {
        id,
        actionType,
        description,
        details,
        timestamp: Date.now(),
        resolve
      };

      this.pendingApprovals.set(id, approval);

      console.log(`[GatewayServer] ⚠️ Action Approval Required: ${description} (ID: ${id})`);
      
      this.broadcast({
        type: 'APPROVAL_REQUEST',
        sender: 'WINDOWS_HOST',
        payload: {
          approvalId: id,
          actionType,
          description,
          details
        },
        timestamp: Date.now(),
        id
      });
    });
  }

  public broadcast(msg: SyncMessage): void {
    const payloadStr = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payloadStr);
      }
    }
  }

  public broadcastExcept(msg: SyncMessage, excludeWs: WebSocket): void {
    const payloadStr = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(payloadStr);
      }
    }
  }

  public sendToClient(ws: WebSocket, msg: SyncMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  public stop(): void {
    this.wss.close();
    this.server.close();
  }
}
