/** 通用骨架屏脉冲块 */
function Bone({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-dark-bg-tertiary/60 ${className}`} />
  );
}

/** 雷达图区域骨架 */
export function RadarSkeleton() {
  return (
    <div className="lg:col-span-2 rounded-xl bg-dark-bg-secondary border border-dark-border p-4 min-h-[400px]">
      <Bone className="h-4 w-28 mb-4" />
      <div className="flex items-center justify-center h-[340px]">
        <div className="w-56 h-56 rounded-full border-2 border-dark-bg-tertiary/40 animate-pulse flex items-center justify-center">
          <div className="w-36 h-36 rounded-full border-2 border-dark-bg-tertiary/30 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-dark-bg-tertiary/20 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** 评分卡片骨架 */
export function ScoreCardsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-dark-bg-secondary border border-dark-border">
          <Bone className="w-5 h-5 rounded" />
          <div className="flex-1">
            <div className="flex justify-between mb-2">
              <Bone className="h-3 w-16" />
              <Bone className="h-4 w-8" />
            </div>
            <Bone className="h-2 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** AI 总结区域骨架 */
export function SummarySkeleton() {
  return (
    <div className="rounded-xl bg-dark-bg-secondary border border-dark-border p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bone className="w-5 h-5 rounded" />
        <Bone className="h-4 w-24" />
      </div>
      <div className="space-y-2">
        <Bone className="h-4 w-3/4" />
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-5/6" />
        <Bone className="h-3 w-2/3" />
        <Bone className="h-3 w-full" />
      </div>
    </div>
  );
}

/** 问题列表骨架 */
export function IssueListSkeleton() {
  return (
    <div className="rounded-xl bg-dark-bg-secondary border border-dark-border p-6">
      <Bone className="h-4 w-20 mb-3" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dark-border">
            <Bone className="w-4 h-4 rounded" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Bone className="h-3 w-32" />
                <Bone className="h-4 w-12 rounded" />
              </div>
              <Bone className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
