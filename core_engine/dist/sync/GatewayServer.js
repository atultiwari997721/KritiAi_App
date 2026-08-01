"use strict";
/**
 * Kriti AI - Real-Time Cross-Platform Gateway Server
 * Phase 2 & 3: High-Speed WebSocket & REST Gateway for Desktop & Android Sync
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayServer = void 0;
const ws_1 = require("ws");
const http = __importStar(require("http"));
const events_1 = require("events");
class GatewayServer extends events_1.EventEmitter {
    server;
    wss;
    clients = new Set();
    pendingApprovals = new Map();
    authToken;
    constructor(port = 9876, authToken = 'kritiai-local-secret') {
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
        this.wss = new ws_1.WebSocketServer({ server: this.server });
        this.setupWebSocket();
        this.server.listen(port, () => {
            console.log(`[GatewayServer] 🚀 Kriti AI Gateway running on ws://0.0.0.0:${port}`);
        });
    }
    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
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
                    const msg = JSON.parse(raw.toString());
                    this.handleIncomingMessage(msg, ws);
                }
                catch (e) {
                    console.error('[GatewayServer] Failed to parse message:', e);
                }
            });
            ws.on('close', () => {
                this.clients.delete(ws);
                console.log('[GatewayServer] Client disconnected');
            });
        });
    }
    handleIncomingMessage(msg, senderWs) {
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
    requestApproval(actionType, description, details) {
        return new Promise((resolve) => {
            const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const approval = {
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
    broadcast(msg) {
        const payloadStr = JSON.stringify(msg);
        for (const client of this.clients) {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(payloadStr);
            }
        }
    }
    broadcastExcept(msg, excludeWs) {
        const payloadStr = JSON.stringify(msg);
        for (const client of this.clients) {
            if (client !== excludeWs && client.readyState === ws_1.WebSocket.OPEN) {
                client.send(payloadStr);
            }
        }
    }
    sendToClient(ws, msg) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }
    stop() {
        this.wss.close();
        this.server.close();
    }
}
exports.GatewayServer = GatewayServer;
