import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SyncClient } from '../services/SyncClient';

export interface ChatMsg {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

interface ChatScreenProps {
  messages: ChatMsg[];
  syncClient: SyncClient;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({ messages, syncClient }) => {
  const [inputText, setInputText] = useState('');
  const [isCoderMode, setIsCoderMode] = useState(false);

  const sendMessage = () => {
    if (!inputText.trim()) return;

    syncClient.send('CHAT_MESSAGE', {
      text: inputText,
      mode: isCoderMode ? 'coder' : 'assistant'
    });

    setInputText('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={styles.topBar}>
        <Text style={styles.title}>Kriti AI</Text>
        <TouchableOpacity
          style={[styles.modeToggle, isCoderMode ? styles.modeCoder : styles.modeAssistant]}
          onPress={() => setIsCoderMode(!isCoderMode)}
        >
          <Text style={styles.modeText}>{isCoderMode ? '⚡ Autonomous Coder' : '✨ Assistant Mode'}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.messageList}
        renderItem={({ item }) => {
          const isUser = item.sender === 'ANDROID_NODE';
          return (
            <View style={[styles.bubbleWrapper, isUser ? styles.bubbleRight : styles.bubbleLeft]}>
              <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
                <Text style={styles.senderLabel}>{item.sender.replace('_', ' ')}</Text>
                <Text style={styles.bubbleText}>{item.text}</Text>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={isCoderMode ? "Describe code goal or bug..." : "Ask Kriti anything..."}
          placeholderTextColor="#64748b"
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  title: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  modeToggle: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  modeAssistant: { backgroundColor: 'rgba(56, 189, 248, 0.2)' },
  modeCoder: { backgroundColor: 'rgba(168, 85, 247, 0.2)' },
  modeText: { fontSize: 12, fontWeight: '600', color: '#38bdf8' },
  messageList: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  bubbleWrapper: { marginBottom: 12, flexDirection: 'row' },
  bubbleLeft: { justifyContent: 'flex-start' },
  bubbleRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: 16, padding: 12 },
  userBubble: { backgroundColor: '#2563eb' },
  botBubble: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  senderLabel: { fontSize: 10, color: '#94a3b8', marginBottom: 4, fontWeight: '600' },
  bubbleText: { color: '#f8fafc', fontSize: 14, lineHeight: 20 },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#0f172a',
    alignItems: 'center'
  },
  input: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 14,
    maxHeight: 100
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: '#38bdf8',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  sendButtonText: { color: '#0f172a', fontWeight: '700', fontSize: 14 }
});
