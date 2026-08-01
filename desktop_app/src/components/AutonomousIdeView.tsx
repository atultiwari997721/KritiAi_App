import React, { useState, useEffect, useRef } from 'react';
import { ArtifactViewer, ArtifactData } from './ArtifactViewer';

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNode[];
  size?: number;
}

interface AutonomousIdeViewProps {
  onSendCommand: (cmd: string) => void;
  onSendToKriti: (actionType: string, prompt?: string) => void;
  terminalLogs: string[];
  activeArtifact: ArtifactData | null;
  agentThoughts: string[];
  fileTree: FileNode[];
  selectedFilePath: string;
  selectedFileContent: string;
  onSelectFile: (path: string) => void;
  onRefreshFileTree: () => void;
  onApplyDiff?: () => void;
  onDiscardDiff?: () => void;
}

export const AutonomousIdeView: React.FC<AutonomousIdeViewProps> = ({
  onSendCommand,
  onSendToKriti,
  terminalLogs,
  activeArtifact,
  agentThoughts,
  fileTree,
  selectedFilePath,
  selectedFileContent,
  onSelectFile,
  onRefreshFileTree,
  onApplyDiff,
  onDiscardDiff
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'diff'>('editor');
  const [commandInput, setCommandInput] = useState<string>('');
  const [customKritiPrompt, setCustomKritiPrompt] = useState<string>('');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<boolean>(false);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-switch to diff tab when artifact arrives
  useEffect(() => {
    if (activeArtifact) {
      setActiveTab('diff');
    }
  }, [activeArtifact]);

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  const toggleFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath]
    }));
  };

  const handleCopyCode = () => {
    if (!selectedFileContent) return;
    navigator.clipboard.writeText(selectedFileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    onSendCommand(commandInput);
    setCommandInput('');
  };

  const handleCustomSendToKriti = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customKritiPrompt.trim()) return;
    onSendToKriti('CUSTOM', customKritiPrompt);
    setCustomKritiPrompt('');
  };

  const lines = selectedFileContent ? selectedFileContent.split('\n') : [];

  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => {
      if (node.type === 'directory') {
        const isCollapsed = !!collapsedFolders[node.path];
        return (
          <div key={node.path} style={{ paddingLeft: depth * 12 }}>
            <div
              onClick={(e) => toggleFolder(node.path, e)}
              className="text-slate-400 font-semibold py-1 px-1.5 rounded flex items-center justify-between cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition text-xs select-none"
            >
              <span className="flex items-center gap-1.5 truncate">
                <span className="text-[10px] text-slate-500">{isCollapsed ? '▶' : '▼'}</span>
                <span>📁 {node.name}</span>
              </span>
              {node.children && (
                <span className="text-[10px] text-slate-600 font-mono">({node.children.length})</span>
              )}
            </div>
            {!isCollapsed && node.children && renderTree(node.children, depth + 1)}
          </div>
        );
      }

      const isSelected = selectedFilePath === node.path;
      return (
        <div
          key={node.path}
          style={{ paddingLeft: depth * 12 + 8 }}
          onClick={() => {
            onSelectFile(node.path);
            setActiveTab('editor');
          }}
          className={`py-1 px-2 my-0.5 rounded cursor-pointer transition flex items-center justify-between text-xs select-none ${
            isSelected
              ? 'bg-sky-600/30 text-sky-300 font-medium border border-sky-500/30'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
          }`}
        >
          <span className="truncate flex items-center gap-1.5">
            <span>📄</span>
            <span className="truncate">{node.name}</span>
          </span>
          {node.size !== undefined && (
            <span className="text-[10px] text-slate-500 font-mono">
              {node.size > 1024 ? `${(node.size / 1024).toFixed(1)}k` : `${node.size}B`}
            </span>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#090d16] text-slate-100 select-none">
      {/* 3-Column Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Column 1: Live Workspace Explorer */}
        <div className="w-64 bg-[#0f172a] border-r border-slate-800 flex flex-col">
          <div className="p-3 text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 flex justify-between items-center bg-[#0d1424]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              Workspace Explorer
            </span>
            <button
              onClick={onRefreshFileTree}
              className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded text-sky-400 border border-slate-700 transition"
              title="Refresh workspace tree"
            >
              🔄 Refresh
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 text-xs font-mono space-y-0.5">
            {fileTree.length > 0 ? (
              renderTree(fileTree)
            ) : (
              <div className="text-slate-500 p-4 text-center text-xs">
                Scanning workspace files...
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Code Preview / Editor & Send-to-Kriti Bar */}
        <div className="flex-1 flex flex-col bg-[#0b0f19] border-r border-slate-800 min-w-0">
          {/* Editor Header Bar */}
          <div className="flex items-center justify-between bg-[#0e1422] border-b border-slate-800 px-3">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setActiveTab('editor')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
                  activeTab === 'editor'
                    ? 'border-sky-500 text-sky-400 bg-sky-950/20'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>📝 Preview:</span>
                <span className="font-mono text-slate-200 font-semibold truncate max-w-xs">
                  {selectedFilePath || 'Select a file'}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('diff')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
                  activeTab === 'diff'
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-950/20'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>⚡ Unified Diffs</span>
                {activeArtifact && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>
            </div>

            {/* File Actions */}
            {selectedFilePath && activeTab === 'editor' && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-mono">
                  {lines.length} lines
                </span>
                <button
                  onClick={handleCopyCode}
                  className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                  title="Copy file contents"
                >
                  {copied ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
            )}
          </div>

          {/* Send-to-Kriti Action Toolbar */}
          {activeTab === 'editor' && selectedFilePath && (
            <div className="bg-[#111827] px-3 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase text-purple-400 flex items-center gap-1">
                  <span>⚡ Kriti AI Actions:</span>
                </span>
                <button
                  onClick={() => onSendToKriti('REFACTOR')}
                  className="px-2.5 py-1 rounded bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 hover:text-white border border-purple-500/40 text-[11px] font-medium transition flex items-center gap-1"
                >
                  ⚡ Refactor & Optimize
                </button>
                <button
                  onClick={() => onSendToKriti('FIX_BUGS')}
                  className="px-2.5 py-1 rounded bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 hover:text-white border border-rose-500/40 text-[11px] font-medium transition flex items-center gap-1"
                >
                  🐛 Fix Bugs & Errors
                </button>
                <button
                  onClick={() => onSendToKriti('EXPLAIN')}
                  className="px-2.5 py-1 rounded bg-sky-600/30 hover:bg-sky-600/50 text-sky-300 hover:text-white border border-sky-500/40 text-[11px] font-medium transition flex items-center gap-1"
                >
                  📝 Explain File
                </button>
                <button
                  onClick={() => onSendToKriti('ADD_TESTS')}
                  className="px-2.5 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 hover:text-white border border-emerald-500/40 text-[11px] font-medium transition flex items-center gap-1"
                >
                  🧪 Generate Tests
                </button>
              </div>

              {/* Custom Prompt to Kriti */}
              <form onSubmit={handleCustomSendToKriti} className="flex items-center gap-1.5 flex-1 max-w-sm ml-auto">
                <input
                  type="text"
                  placeholder={`Ask Kriti about ${selectedFilePath.split(/[\\/]/).pop()}...`}
                  value={customKritiPrompt}
                  onChange={(e) => setCustomKritiPrompt(e.target.value)}
                  className="w-full bg-[#1e293b] text-slate-200 placeholder-slate-500 text-[11px] px-2.5 py-1 rounded border border-slate-700 focus:outline-none focus:border-purple-500 font-sans"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-semibold transition whitespace-nowrap"
                >
                  Send
                </button>
              </form>
            </div>
          )}

          {/* Main Viewer Area */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'editor' ? (
              <div className="h-full font-mono text-xs overflow-auto bg-[#090d16] flex flex-col">
                {selectedFileContent ? (
                  <div className="flex-1 flex overflow-auto">
                    {/* Line Numbers */}
                    <div className="bg-[#0b0f19] text-slate-600 px-3 py-3 select-none text-right font-mono text-[11px] border-r border-slate-800/80 min-w-[3rem]">
                      {lines.map((_, i) => (
                        <div key={i} className="leading-5">{i + 1}</div>
                      ))}
                    </div>
                    {/* Code Content */}
                    <div className="flex-1 p-3 text-slate-200 overflow-x-auto">
                      {lines.map((line, i) => (
                        <div key={i} className="leading-5 whitespace-pre font-mono text-xs">
                          {line || ' '}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8">
                    <div className="text-3xl mb-2">📂</div>
                    <p className="text-sm font-medium">Select a file from the workspace explorer to preview.</p>
                    <p className="text-xs text-slate-600 mt-1">Use Kriti AI toolbar above to analyze, refactor, or test code in one click.</p>
                  </div>
                )}
              </div>
            ) : (
              <ArtifactViewer
                artifact={activeArtifact}
                onApply={onApplyDiff}
                onDiscard={onDiscardDiff}
              />
            )}
          </div>
        </div>

        {/* Column 3: Autonomous Agent Autonomy Feed */}
        <div className="w-80 bg-[#0d1322] flex flex-col">
          <div className="p-3 text-xs font-bold uppercase tracking-wider text-purple-400 border-b border-slate-800 flex items-center justify-between bg-[#0e1422]">
            <span className="flex items-center gap-1.5">
              <span>🤖</span> Agent Telemetry & Reasoning
            </span>
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {agentThoughts.length > 0 ? (
              agentThoughts.map((thought, idx) => (
                <div key={idx} className="bg-[#131b2e] p-3 rounded-lg border border-purple-500/20 text-xs shadow-sm">
                  <div className="text-[10px] text-purple-400 font-semibold mb-1 flex items-center justify-between">
                    <span>STEP #{idx + 1}</span>
                    <span className="text-slate-500">Autonomous</span>
                  </div>
                  <div className="text-slate-300 leading-relaxed font-mono text-[11px] whitespace-pre-wrap">{thought}</div>
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-xs p-4 text-center leading-relaxed">
                Autonomous planner will stream multi-step plans, tool invocations, and diff generations here.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Panel: Live Sandboxed Terminal */}
      <div className="h-44 bg-[#070a10] border-t border-slate-800 flex flex-col">
        <div className="px-4 py-1.5 bg-[#0b0e17] border-b border-slate-800/60 flex justify-between items-center text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Sandboxed Terminal (PowerShell / PTY Sandbox)
          </span>
          <span className="text-[10px] text-slate-500">Jailed: Workspace Boundary Active</span>
        </div>
        <div className="flex-1 p-2 font-mono text-xs text-emerald-400 overflow-y-auto space-y-0.5">
          {terminalLogs.map((log, i) => (
            <div key={i} className="whitespace-pre-wrap">{log}</div>
          ))}
          <div ref={terminalEndRef} />
        </div>
        <form onSubmit={handleRunCommand} className="flex border-t border-slate-800 bg-[#090d16]">
          <span className="px-3 py-1.5 text-xs font-mono text-sky-400 select-none">$</span>
          <input
            type="text"
            className="flex-1 bg-transparent text-xs font-mono text-slate-200 outline-none pr-3"
            placeholder="Run sandboxed command (e.g. dir, git status, npm test, python --version)..."
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
          />
          <button
            type="submit"
            className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs font-semibold transition"
          >
            Execute
          </button>
        </form>
      </div>
    </div>
  );
};
