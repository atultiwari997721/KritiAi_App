import React, { useState } from 'react';

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

interface ChatAssistantViewProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onTriggerAction: (action: string) => void;
}

export const ChatAssistantView: React.FC<ChatAssistantViewProps> = ({
  messages,
  onSendMessage,
  onTriggerAction
}) => {
  const [inputText, setInputText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  const quickActions = [
    { title: '📧 Dispatch Email', action: 'Send weekly status report to engineering team' },
    { title: '📅 Sync Calendar', action: 'Show all upcoming meetings for today' },
    { title: '🌐 Automate Browser', action: 'Scrape latest AI research papers from Hugging Face' },
    { title: '🧹 Clean Workspace', action: 'Organize temporary files and clean build cache' }
  ];

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#0b0f19] to-[#080b12] text-slate-100">
      {/* Quick Action Cards (OpenClaw style) */}
      <div className="p-6 border-b border-slate-800/60">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Omnipotent Life & System Automation
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((qa, i) => (
            <button
              key={i}
              onClick={() => onTriggerAction(qa.action)}
              className="p-3 text-left rounded-xl bg-[#131b2e]/70 hover:bg-[#1b2640] border border-slate-800 hover:border-sky-500/40 transition group"
            >
              <div className="text-xs font-semibold text-slate-200 group-hover:text-sky-300">{qa.title}</div>
              <div className="text-[11px] text-slate-500 line-clamp-1 mt-1">{qa.action}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.sender === 'DESKTOP_UI' || msg.sender === 'ANDROID_NODE';
          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-2xl rounded-2xl p-4 shadow-sm ${
                  isUser
                    ? 'bg-sky-600 text-white'
                    : 'bg-[#131a2b] border border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] font-bold uppercase ${isUser ? 'text-sky-200' : 'text-purple-400'}`}>
                    {msg.sender.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chat Input Bar */}
      <div className="p-4 border-t border-slate-800/80 bg-[#090d16]/80 backdrop-blur-md">
        <form onSubmit={handleSubmit} className="flex gap-3 items-center max-w-4xl mx-auto">
          <input
            type="text"
            className="flex-1 bg-[#131a2b] border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
            placeholder="Instruct Kriti AI (e.g. 'Read unread emails', 'Refactor auth module')..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button
            type="submit"
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-medium text-sm transition shadow-lg shadow-sky-500/20"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};
