/**
 * Kriti AI - Android Mobile Sync Client
 * Phase 3: Resilient Real-Time WebSocket P2P Link to Windows Host
 */

export interface SyncMessage {
  type: 'CHAT_MESSAGE' | 'STREAM_CHUNK' | 'APPROVAL_REQUEST' | 'APPROVAL_RESPONSE' | 'DIFF_ARTIFACT' | 'STATUS_UPDATE';
  payload: any;
  sender: 'WINDOWS_HOST' | 'ANDROID_NODE' | 'DESKTOP_UI' | 'AGENT';
  timestamp: number;
  id: string;
}

export type MessageListener = (msg: SyncMessage) => void;

export class SyncClient {
  private ws: WebSocket | null = null;
  private hostUrl: string;
  private listeners: Set<MessageListener> = new Set();
  private reconnectInterval: number = 3000;
  private isExplicitlyClosed: boolean = false;
  private messageQueue: SyncMessage[] = [];

  constructor(hostUrl: string = 'ws://192.168.1.100:9876') {
    this.hostUrl = hostUrl;
  }

  public setHostUrl(url: string): void {
    this.hostUrl = url;
    if (this.ws) {
      this.disconnect();
      this.connect();
    }
  }

  public connect(): void {
    this.isExplicitlyClosed = false;
    try {
      console.log(`[SyncClient] Connecting to Kriti AI Windows Engine at ${this.hostUrl}...`);
      this.ws = new WebSocket(this.hostUrl);

      this.ws.onopen = () => {
        console.log('[SyncClient] 🟢 Connected to Windows Host!');
        this.flushQueue();
        this.emitStatus('CONNECTED');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: SyncMessage = JSON.parse(event.data);
          this.notifyListeners(msg);
        } catch (e) {
          console.error('[SyncClient] Parse error:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[SyncClient] 🔴 Disconnected from Windows Host.');
        this.emitStatus('DISCONNECTED');
        if (!this.isExplicitlyClosed) {
          setTimeout(() => this.connect(), this.reconnectInterval);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[SyncClient] WebSocket error:', err);
      };
    } catch (err) {
      console.error('[SyncClient] Connection failure:', err);
      setTimeout(() => this.connect(), this.reconnectInterval);
    }
  }

  public send(type: SyncMessage['type'], payload: any): void {
    const msg: SyncMessage = {
      type,
      payload,
      sender: 'ANDROID_NODE',
      timestamp: Date.now(),
      id: `m_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.log('[SyncClient] Host offline. Queuing message for reconnection sync.');
      this.messageQueue.push(msg);
    }
  }

  /**
   * Respond to a security approval ping directly from mobile
   */
  public respondToApproval(approvalId: string, approved: boolean): void {
    this.send('APPROVAL_RESPONSE', { approvalId, approved });
  }

  public subscribe(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(msg: SyncMessage): void {
    for (const listener of this.listeners) {
      listener(msg);
    }
  }

  private emitStatus(status: 'CONNECTED' | 'DISCONNECTED'): void {
    this.notifyListeners({
      type: 'STATUS_UPDATE',
      sender: 'ANDROID_NODE',
      payload: { status },
      timestamp: Date.now(),
      id: `status_${Date.now()}`
    });
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.messageQueue.shift();
      if (msg) this.ws.send(JSON.stringify(msg));
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
