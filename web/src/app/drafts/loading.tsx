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
      </div>

      <div className="space-y-4">
        <div className="flex gap-8 border-b border-border pb-3">
          <Skeleton className="h-6 w-24 bg-muted/20" />
          <Skeleton className="h-6 w-24 bg-muted/20" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-6 rounded-2xl border border-border/50 space-y-4">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20 bg-muted/20" />
                <Skeleton className="h-4 w-12 bg-muted/10" />
              </div>
              <Skeleton className="h-6 w-3/4 bg-muted/20" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full bg-muted/10" />
                <Skeleton className="h-4 w-5/6 bg-muted/10" />
              </div>
              <div className="pt-4 border-t border-border/30 flex justify-between">
                <Skeleton className="h-4 w-16 bg-muted/10" />
                <Skeleton className="h-4 w-16 bg-muted/10" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
