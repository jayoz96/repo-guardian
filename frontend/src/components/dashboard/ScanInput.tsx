import { useState } from 'react';
import { Search, FolderOpen } from 'lucide-react';

interface ScanInputProps {
  onScan: (path: string) => void;
  scanning: boolean;
  statusText: string;
}

export function ScanInput({ onScan, scanning, statusText }: ScanInputProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !scanning) {
      onScan(input.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-text-muted" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入 GitHub 链接或本地文件夹绝对路径..."
            disabled={scanning}
            className="w-full pl-10 pr-4 py-3 rounded-lg bg-dark-bg-tertiary border border-dark-border text-dark-text placeholder:text-dark-text-muted text-base focus:outline-none focus:border-accent-cyan disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={scanning || !input.trim()}
          className="flex items-center gap-2 px-6 py-3 rounded-lg bg-accent-blue hover:bg-blue-500 text-white font-bold text-base transition-colors shadow-lg shadow-accent-blue/30 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <Search className={`w-4 h-4 ${scanning ? 'animate-pulse' : ''}`} />
          {scanning ? '扫描中...' : '开始扫描'}
        </button>
      </div>

      {scanning && (
        <div className="flex items-center gap-2 text-accent-cyan text-sm animate-pulse">
          <div className="w-2 h-2 rounded-full bg-accent-cyan animate-ping" />
          {statusText}
        </div>
      )}
    </form>
  );
}
