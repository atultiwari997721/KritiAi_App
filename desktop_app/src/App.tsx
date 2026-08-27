import React, { useState, useEffect, useRef } from 'react';
import { ChatAssistantView } from './components/ChatAssistantView';
import { AutonomousIdeView, FileNode } from './components/AutonomousIdeView';
import { ArtifactData } from './components/ArtifactViewer';

interface PendingApprovalData {
  approvalId: string;
  actionType: string;
  description: string;
  details: any;
}

export function App() {
  const [mode, setMode] = useState<'assistant' | 'ide'>('assistant');
  const [wsConnected, setWsConnected] = useState(false);
  const [engineStatus, setEngineStatus] = useState({
    ollama: true,
    colabGpu: false,
    workspaceRoot: 'K:\\KritiAi_App'
  });

  const [messages, setMessages] = useState<any[]>([
    {
      id: 'm_init',
      sender: 'WINDOWS_HOST',
      text: '✨ Welcome to Kriti AI! Engine connected. Local Ollama & Terminal Sandboxing are active.',
      timestamp: Date.now()
    }
  ]);

  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    'PS K:\\KritiAi_App> Kriti AI Terminal Sandbox Initialized.',
    'PS K:\\KritiAi_App> Jailed within workspace boundary.',
  ]);

  const [activeArtifact, setActiveArtifact] = useState<ArtifactData | null>(null);
  const [agentThoughts, setAgentThoughts] = useState<string[]>([]);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('README.md');
  const [selectedFileContent, setSelectedFileContent] = useState<string>('');
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalData | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Initialize WebSocket connection to Core Engine
  const connectWebSocket = () => {
    try {
      const ws = new WebSocket('ws://127.0.0.1:8000/ws');
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        console.log('[DesktopApp] Connected to Kriti AI Gateway!');
        // Request initial tree, status, and default file
        ws.send(JSON.stringify({ type: 'GET_FILE_TREE', sender: 'DESKTOP_UI', timestamp: Date.now(), id: 'init_tree' }));
        ws.send(JSON.stringify({ type: 'GET_STATUS', sender: 'DESKTOP_UI', timestamp: Date.now(), id: 'init_stat' }));
        ws.send(JSON.stringify({ type: 'READ_FILE', payload: { path: 'README.md' }, sender: 'DESKTOP_UI', timestamp: Date.now(), id: 'init_read' }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleIncomingMessage(msg);
        } catch (e) {
          console.error('[DesktopApp] Error parsing WS message:', e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.log('[DesktopApp] Gateway disconnected. Reconnecting in 2s...');
        setTimeout(connectWebSocket, 2000);
      };

      ws.onerror = (err) => {
        console.warn('[DesktopApp] WS error:', err);
      };
    } catch (e) {
      console.error('[DesktopApp] WebSocket init error:', e);
      setTimeout(connectWebSocket, 2000);
    }
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const handleIncomingMessage = (msg: any) => {
    switch (msg.type) {
      case 'CHAT_MESSAGE':
        setMessages((prev) => [
          ...prev,
          {
            id: msg.id || `msg_${Date.now()}`,
            sender: msg.sender,
            text: msg.payload?.text || JSON.stringify(msg.payload),
            timestamp: msg.timestamp || Date.now()
          }
        ]);
        break;

      case 'STREAM_CHUNK':
        setAgentThoughts((prev) => [
          ...prev,
          msg.payload?.text || `Step ${msg.payload?.iteration}: Processing...`
        ]);
        break;

      case 'COMMAND_OUTPUT':
        setTerminalLogs((prev) => [...prev, msg.payload.text]);
        break;

      case 'FILE_TREE_DATA':
        if (msg.payload && msg.payload.tree) {
          setFileTree(msg.payload.tree);
        } else if (Array.isArray(msg.payload)) {
          setFileTree(msg.payload);
        }
        break;

      case 'FILE_CONTENT':
        setSelectedFilePath(msg.payload.path);
        setSelectedFileContent(msg.payload.content);
        break;

      case 'DIFF_ARTIFACT':
        setActiveArtifact(msg.payload);
        setAgentThoughts((prev) => [
          ...prev,
          `⚡ Generated unified diff artifact for ${msg.payload.filePath}`
        ]);
        break;

      case 'APPROVAL_REQUEST':
        setPendingApproval(msg.payload);
        break;

      case 'STATUS_UPDATE':
        if (msg.payload.ollama !== undefined) {
          setEngineStatus((prev) => ({
            ...prev,
            ollama: msg.payload.ollama,
            colabGpu: msg.payload.colabGpu
          }));
        }
        break;

      default:
        break;
    }
  };

  const handleSendMessage = (text: string) => {
    const userMsg = {
      id: `msg_${Date.now()}`,
      sender: 'DESKTOP_UI',
      text,
      timestamp: Date.now()
    };
    setMessages((prev) => [...prev, userMsg]);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'CHAT_MESSAGE',
          sender: 'DESKTOP_UI',
          payload: { text, mode: mode === 'ide' ? 'coder' : 'assistant' },
          timestamp: Date.now(),
          id: userMsg.id
        })
      );
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'WINDOWS_HOST',
          text: '⚠️ Gateway disconnected. Reconnecting to ws://127.0.0.1:8000/ws...',
          timestamp: Date.now()
        }
      ]);
    }
  };

  const handleSendCommand = (command: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'COMMAND_EXECUTE',
          sender: 'DESKTOP_UI',
          payload: { command },
          timestamp: Date.now(),
          id: `cmd_${Date.now()}`
        })
      );
    }
  };

  const handleSelectFile = (filePath: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'READ_FILE',
          sender: 'DESKTOP_UI',
          payload: { path: filePath },
          timestamp: Date.now(),
          id: `read_${Date.now()}`
        })
      );
    }
  };

  const handleRefreshFileTree = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'GET_FILE_TREE',
          sender: 'DESKTOP_UI',
          timestamp: Date.now(),
          id: `refresh_tree_${Date.now()}`
        })
      );
    }
  };

  const handleSendToKriti = (actionType: string, customPrompt?: string) => {
    let promptText = '';
    switch (actionType) {
      case 'REFACTOR':
        promptText = `Please refactor and optimize the code in ${selectedFilePath} for better performance, readability, and type safety.`;
        break;
      case 'FIX_BUGS':
        promptText = `Please analyze ${selectedFilePath}, identify any bugs, security vulnerabilities, or error handling issues, and fix them.`;
        break;
      case 'EXPLAIN':
        promptText = `Please provide a clear architectural breakdown and explanation of what ${selectedFilePath} does.`;
        break;
      case 'ADD_TESTS':
        promptText = `Please generate comprehensive automated unit tests for ${selectedFilePath}.`;
        break;
      case 'CUSTOM':
      default:
        promptText = customPrompt || `Inspect and improve ${selectedFilePath}`;
        break;
    }

    setAgentThoughts((prev) => [
      ...prev,
      `Action Dispatched [${actionType}]: ${promptText}`
    ]);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'CHAT_MESSAGE',
          sender: 'DESKTOP_UI',
          payload: {
            text: `${promptText}\n\nContext File: ${selectedFilePath}\n\`\`\`\n${selectedFileContent}\n\`\`\``,
            mode: 'coder'
          },
          timestamp: Date.now(),
          id: `coder_${Date.now()}`
        })
      );
    }
  };

  const handleApplyDiff = () => {
    if (!activeArtifact) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'SAVE_FILE',
          sender: 'DESKTOP_UI',
          payload: { path: activeArtifact.filePath, content: activeArtifact.newContent },
          timestamp: Date.now(),
          id: `apply_${Date.now()}`
        })
      );
      setAgentThoughts((prev) => [
        ...prev,
        `✓ Applied diff changes to ${activeArtifact.filePath}`
      ]);
      setSelectedFileContent(activeArtifact.newContent);
      setActiveArtifact(null);
    }
  };

  const handleDiscardDiff = () => {
    setActiveArtifact(null);
    setAgentThoughts((prev) => [
      ...prev,
      `Discarded proposed diff artifact.`
    ]);
  };

  const handleApprovalResponse = (approved: boolean) => {
    if (!pendingApproval) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'APPROVAL_RESPONSE',
          sender: 'DESKTOP_UI',
          payload: { approvalId: pendingApproval.approvalId, approved },
          timestamp: Date.now(),
          id: `appr_${Date.now()}`
        })
      );
    }
    setPendingApproval(null);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#070a10] text-slate-100 font-sans overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-12 bg-[#0d1322] border-b border-slate-800 flex items-center justify-between px-4 select-none">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-sky-500/20">
            K
          </div>
          <span className="font-bold tracking-tight text-sm text-slate-100">KRITI AI</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-sky-400 font-mono border border-slate-700">
            v1.0.0-PRO
          </span>
        </div>

        {/* Mode Switcher */}
        <div className="flex bg-[#070a10] p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setMode('assistant')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              mode === 'assistant'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ✨ Personal Assistant
          </button>
          <button
            onClick={() => setMode('ide')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              mode === 'ide'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚡ Autonomous IDE
          </button>
        </div>

        {/* Engine Nodes Status Badges */}
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'}`} />
            {wsConnected ? 'Gateway Linked' : 'Connecting...'}
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <span className={`w-2 h-2 rounded-full ${engineStatus.ollama ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            {engineStatus.ollama ? 'Ollama Active' : 'Ollama Idle'}
          </span>
        </div>
      </header>

      {/* Primary Workspace View */}
      <main className="flex-1 overflow-hidden relative">
        {mode === 'assistant' ? (
          <ChatAssistantView
            messages={messages}
            onSendMessage={handleSendMessage}
            onTriggerAction={handleSendMessage}
          />
        ) : (
          <AutonomousIdeView
            onSendCommand={handleSendCommand}
            onSendToKriti={handleSendToKriti}
            terminalLogs={terminalLogs}
            activeArtifact={activeArtifact}
            agentThoughts={agentThoughts}
            fileTree={fileTree}
            selectedFilePath={selectedFilePath}
            selectedFileContent={selectedFileContent}
            onSelectFile={handleSelectFile}
            onRefreshFileTree={handleRefreshFileTree}
            onApplyDiff={handleApplyDiff}
            onDiscardDiff={handleDiscardDiff}
          />
        )}

        {/* Approval Modal */}
        {pendingApproval && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
            <div className="bg-[#111827] border border-amber-500/50 rounded-2xl max-w-md w-full p-5 shadow-2xl shadow-amber-500/10">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-2">
                <span>⚠️ Security Permission Required</span>
              </div>
              <p className="text-xs text-slate-300 mb-3 font-medium">
                {pendingApproval.description}
              </p>
              <div className="bg-[#0b0f19] p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-400 mb-4 max-h-36 overflow-auto">
                <pre>{JSON.stringify(pendingApproval.details, null, 2)}</pre>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => handleApprovalResponse(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Deny
                </button>
                <button
                  onClick={() => handleApprovalResponse(true)}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition shadow-md shadow-amber-600/30"
                >
                  Approve Execution
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
