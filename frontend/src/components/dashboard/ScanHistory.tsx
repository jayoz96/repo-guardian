import { useState } from 'react';
import { History, ChevronDown, Trash2 } from 'lucide-react';

export interface ScanRecord {
  path: string;
  time: string;
  avgScore: number;
}

const STORAGE_KEY = 'repo-guardian-history';
const MAX_RECORDS = 5;

export function loadHistory(): ScanRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(record: ScanRecord) {
  const list = loadHistory().filter((r) => r.path !== record.path);
  list.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECORDS)));
}

interface ScanHistoryProps {
  onSelect: (path: string) => void;
}

export function ScanHistory({ onSelect }: ScanHistoryProps) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState(loadHistory);

  if (records.length === 0) return null;

  const clearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setRecords([]);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-dark-text-secondary hover:text-dark-text hover:bg-dark-bg-tertiary transition-colors"
      >
        <History className="w-3.5 h-3.5" />
        最近扫描
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 rounded-xl bg-dark-bg-secondary border border-dark-border shadow-xl z-40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-dark-border">
            <span className="text-xs text-dark-text-secondary">扫描历史 (最近 {records.length} 条)</span>
            <button onClick={clearAll} className="text-dark-text-muted hover:text-score-red transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {records.map((r, i) => (
            <button
              key={i}
              onClick={() => { onSelect(r.path); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 hover:bg-dark-bg-tertiary transition-colors border-b border-dark-border last:border-b-0"
            >
              <p className="text-sm text-dark-text truncate">{r.path}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-dark-text-muted">{r.time}</span>
                <span className="text-xs text-accent-cyan">均分 {r.avgScore}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
