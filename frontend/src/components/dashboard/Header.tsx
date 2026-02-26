import { Shield } from 'lucide-react';

interface HeaderProps {
  scanning?: boolean;
}

export function Header({ scanning = false }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-dark-bg-secondary to-dark-bg-tertiary/50 border-b border-accent-cyan/20">
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-lg bg-accent-cyan/15">
          <Shield className="w-7 h-7 text-accent-cyan" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Repo-Guardian
        </h1>
        <span className="text-sm text-accent-cyan/80 border border-accent-cyan/25 px-2.5 py-0.5 rounded-full">AI 代码健康体检</span>
      </div>
      {scanning && (
        <span className="text-xs text-accent-cyan animate-pulse">
          分析进行中...
        </span>
      )}
    </header>
  );
}
