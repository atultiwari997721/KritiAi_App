import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { SyncClient } from '../services/SyncClient';

export interface PendingApprovalItem {
  approvalId: string;
  actionType: 'TERMINAL_COMMAND' | 'FILE_WRITE' | 'EMAIL_SEND' | 'BROWSER_AUTOMATION';
  description: string;
  details: any;
}

interface ApprovalsScreenProps {
  approvals: PendingApprovalItem[];
  syncClient: SyncClient;
}

export const ApprovalsScreen: React.FC<ApprovalsScreenProps> = ({ approvals, syncClient }) => {
  const handleDecision = (id: string, approved: boolean) => {
    syncClient.respondToApproval(id, approved);
  };

  const renderItem = ({ item }: { item: PendingApprovalItem }) => (
    <View style={styles.card}>
      <View style={styles.badgeRow}>
        <View style={[styles.badge, item.actionType === 'TERMINAL_COMMAND' ? styles.badgeDanger : styles.badgeWarn]}>
          <Text style={styles.badgeText}>{item.actionType.replace('_', ' ')}</Text>
        </View>
      </View>

      <Text style={styles.description}>{item.description}</Text>

      {item.details && item.details.command && (
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>$ {item.details.command}</Text>
        </View>
      )}

      {item.details && item.details.to && (
        <View style={styles.codeBox}>
          <Text style={styles.metaText}>Recipient: {item.details.to}</Text>
          <Text style={styles.metaText}>Subject: {item.details.subject}</Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.rejectBtn]}
          onPress={() => handleDecision(item.approvalId, false)}
        >
          <Text style={styles.btnText}>Reject</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.approveBtn]}
          onPress={() => handleDecision(item.approvalId, true)}
        >
          <Text style={styles.btnText}>Approve & Run</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Security & Action Approvals</Text>
      {approvals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>🛡️ No pending action approvals.</Text>
          <Text style={styles.emptySubtext}>High-risk operations triggered on Desktop will appear here in real-time.</Text>
        </View>
      ) : (
        <FlatList
          data={approvals}
          keyExtractor={(item) => item.approvalId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#f8fafc', marginBottom: 16 },
  list: { paddingBottom: 24 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155'
  },
  badgeRow: { flexDirection: 'row', marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeDanger: { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
  badgeWarn: { backgroundColor: 'rgba(245, 158, 11, 0.2)' },
  badgeText: { color: '#f87171', fontSize: 12, fontWeight: '600' },
  description: { color: '#e2e8f0', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  codeBox: {
    backgroundColor: '#090d16',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16
  },
  codeText: { color: '#38bdf8', fontFamily: 'monospace', fontSize: 13 },
  metaText: { color: '#94a3b8', fontSize: 13, marginBottom: 4 },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  actionBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  rejectBtn: { backgroundColor: '#475569' },
  approveBtn: { backgroundColor: '#0284c7' },
  btnText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { color: '#94a3b8', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptySubtext: { color: '#64748b', fontSize: 13, textAlign: 'center' }
});
