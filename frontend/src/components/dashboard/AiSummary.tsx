import { Bot } from 'lucide-react';

interface AiSummaryProps {
  summary: string;
}

export function AiSummary({ summary }: AiSummaryProps) {
  const lines = summary.split('\n');

  return (
    <div className="rounded-xl bg-dark-bg-secondary border border-accent-cyan/30 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-5 h-5 text-accent-cyan" />
        <h2 className="text-base font-medium text-accent-cyan">
          AI 体检总结
        </h2>
      </div>
      <div className="space-y-1">
        {lines.map((line, i) => (
          <p
            key={i}
            className={`text-sm ${
              line.startsWith('📊') ? 'text-dark-text font-bold text-base' :
              line.startsWith('🔍') || line.startsWith('💡') ? 'text-accent-cyan mt-2' :
              line.includes('❌') ? 'text-score-red' :
              line.includes('⚠️') ? 'text-score-yellow' :
              line.includes('✅') ? 'text-score-green' :
              'text-dark-text-secondary'
            }`}
          >
            {line || '\u00A0'}
          </p>
        ))}
      </div>
    </div>
  );
}
