import React, { useState, useEffect } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SyncClient, SyncMessage } from './src/services/SyncClient';
import { ChatScreen, ChatMsg } from './src/screens/ChatScreen';
import { ApprovalsScreen, PendingApprovalItem } from './src/screens/ApprovalsScreen';

const syncClient = new SyncClient('ws://192.168.1.100:9876'); // Can be updated to Tailscale/ngrok URL

export default function App() {
  const [tab, setTab] = useState<'chat' | 'approvals'>('chat');
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [approvals, setApprovals] = useState<PendingApprovalItem[]>([]);

  useEffect(() => {
    syncClient.connect();

    const unsubscribe = syncClient.subscribe((msg: SyncMessage) => {
      if (msg.type === 'STATUS_UPDATE' && msg.payload.status) {
        setConnectionStatus(msg.payload.status);
      }

      if (msg.type === 'CHAT_MESSAGE') {
        setMessages((prev) => [
          ...prev,
          {
            id: msg.id,
            sender: msg.sender,
            text: msg.payload.text,
            timestamp: msg.timestamp
          }
        ]);
      }

      if (msg.type === 'APPROVAL_REQUEST') {
        setApprovals((prev) => [
          ...prev,
          {
            approvalId: msg.payload.approvalId,
            actionType: msg.payload.actionType,
            description: msg.payload.description,
            details: msg.payload.details
          }
        ]);
      }

      if (msg.type === 'STATUS_UPDATE' && msg.payload.message?.includes('APPROVED') || msg.payload.message?.includes('REJECTED')) {
        // Clear approval from queue once decided
        setApprovals((prev) => prev.filter(a => !msg.payload.message.includes(a.approvalId)));
      }
    });

    return () => {
      unsubscribe();
      syncClient.disconnect();
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Connection Indicator Bar */}
      <View style={styles.statusBar}>
        <View style={styles.nodeIndicator}>
          <View style={[styles.dot, connectionStatus === 'CONNECTED' ? styles.dotGreen : styles.dotRed]} />
          <Text style={styles.statusText}>
            {connectionStatus === 'CONNECTED' ? 'Windows Host Synced' : 'Reconnecting to Host...'}
          </Text>
        </View>
        {approvals.length > 0 && (
          <View style={styles.badgeAlert}>
            <Text style={styles.badgeAlertText}>{approvals.length} Pending</Text>
          </View>
        )}
      </View>

      {/* Screen Content */}
      <View style={styles.content}>
        {tab === 'chat' ? (
          <ChatScreen messages={messages} syncClient={syncClient} />
        ) : (
          <ApprovalsScreen approvals={approvals} syncClient={syncClient} />
        )}
      </View>

      {/* Bottom Navigation */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={[styles.navBtn, tab === 'chat' && styles.navBtnActive]}
          onPress={() => setTab('chat')}
        >
          <Text style={[styles.navText, tab === 'chat' && styles.navTextActive]}>💬 Chat & Voice</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navBtn, tab === 'approvals' && styles.navBtnActive]}
          onPress={() => setTab('approvals')}
        >
          <Text style={[styles.navText, tab === 'approvals' && styles.navTextActive]}>
            🛡️ Approvals {approvals.length > 0 ? `(${approvals.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1e293b'
  },
  nodeIndicator: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  dotGreen: { backgroundColor: '#22c55e' },
  dotRed: { backgroundColor: '#ef4444' },
  statusText: { color: '#94a3b8', fontSize: 12, fontWeight: '500' },
  badgeAlert: { backgroundColor: '#ef4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  badgeAlertText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  content: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#090d16',
    paddingVertical: 10
  },
  navBtn: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  navBtnActive: { borderBottomWidth: 2, borderBottomColor: '#38bdf8' },
  navText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  navTextActive: { color: '#38bdf8', fontWeight: '700' }
});
