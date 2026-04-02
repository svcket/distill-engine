import { Skeleton } from "@/components/ui/Skeleton"

export default function Loading() {
  return (
    <div className="p-4 lg:p-8 lg:px-12 max-w-[1500px] mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <Skeleton className="h-10 w-48 bg-muted/20" />
        <Skeleton className="h-4 w-64 bg-muted/10" />
      </div>

      <div className="flex gap-4">
        <Skeleton className="h-12 flex-1 rounded-xl bg-muted/20" />
        <Skeleton className="h-12 w-32 rounded-xl bg-muted/20" />
      </div>

      <div className="space-y-4">
        <div className="flex gap-8 border-b border-border pb-3">
          <Skeleton className="h-6 w-24 bg-muted/20" />
          <Skeleton className="h-6 w-24 bg-muted/20" />
          <Skeleton className="h-6 w-24 bg-muted/20" />
        </div>
        
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4 p-4 rounded-xl border border-border/50">
              <Skeleton className="h-16 w-24 rounded-lg bg-muted/20" />
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-5 w-3/4 bg-muted/20" />
                <Skeleton className="h-4 w-1/4 bg-muted/10" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
