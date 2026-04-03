import { Skeleton } from "@/components/ui/Skeleton"

export default function Loading() {
  return (
    <div className="p-4 lg:p-8 lg:px-12 max-w-[1500px] mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-full bg-muted/20" />
        <Skeleton className="h-8 w-64 bg-muted/20" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Skeleton className="h-[400px] w-full rounded-2xl bg-muted/10 border border-white/5" />
        </div>
        
        <div className="lg:col-span-3 space-y-6">
          <div className="flex gap-4">
            <Skeleton className="h-20 flex-1 rounded-2xl bg-muted/20" />
            <Skeleton className="h-20 w-32 rounded-2xl bg-muted/20" />
          </div>
          
          <Skeleton className="h-[600px] w-full rounded-2xl bg-muted/5 border border-white/5" />
        </div>
      </div>
    </div>
  )
}
