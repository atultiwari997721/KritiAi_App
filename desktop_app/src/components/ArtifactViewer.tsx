import React from 'react';

export interface ArtifactData {
  filePath: string;
  originalContent: string;
  newContent: string;
  patch: string;
  isNewFile: boolean;
}

interface ArtifactViewerProps {
  artifact: ArtifactData | null;
  onApply?: () => void;
  onDiscard?: () => void;
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ artifact, onApply, onDiscard }) => {
  if (!artifact) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8">
        <div className="w-12 h-12 mb-3 rounded-full bg-slate-800 flex items-center justify-center text-xl">📄</div>
        <p className="text-sm font-medium">No active diff or artifact generated yet.</p>
        <p className="text-xs text-slate-600 mt-1">Autonomous modifications will render here for your review.</p>
      </div>
    );
  }

  const patchLines = artifact.patch.split('\n');

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-slate-200 border-l border-slate-800">
      {/* Artifact Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
            {artifact.isNewFile ? 'NEW FILE' : 'MODIFICATION'}
          </span>
          <span className="font-mono text-xs text-slate-300 truncate max-w-xs">{artifact.filePath}</span>
        </div>
        <div className="flex items-center space-x-2">
          {onDiscard && (
            <button
              onClick={onDiscard}
              className="px-3 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
            >
              Discard
            </button>
          )}
          {onApply && (
            <button
              onClick={onApply}
              className="px-3 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded transition shadow-sm"
            >
              Apply Diff
            </button>
          )}
        </div>
      </div>

      {/* Unified Diff Content */}
      <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed bg-[#0b0e14]">
        {patchLines.map((line, idx) => {
          let lineStyle = 'text-slate-400';
          let bgStyle = '';

          if (line.startsWith('+') && !line.startsWith('+++')) {
            lineStyle = 'text-emerald-400';
            bgStyle = 'bg-emerald-950/40';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            lineStyle = 'text-rose-400';
            bgStyle = 'bg-rose-950/40';
          } else if (line.startsWith('@@')) {
            lineStyle = 'text-sky-400 font-semibold';
            bgStyle = 'bg-sky-950/30';
          }

          return (
            <div key={idx} className={`flex px-2 py-0.5 rounded-sm ${bgStyle}`}>
              <span className="w-8 select-none text-slate-600 text-right pr-3">{idx + 1}</span>
              <span className={`flex-1 whitespace-pre ${lineStyle}`}>{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
