import * as React from "react"
import { cn } from "@/lib/utils"
import { Status } from "@/lib/mockData"
import { CheckCircle2, Clock, XCircle, Loader2, AlertCircle } from "lucide-react"

export function StatusIndicator({ status, className }: { status: Status; className?: string }) {
    const statusConfig = {
        done: {
            icon: CheckCircle2,
            color: "text-green-600",
            bg: "bg-green-50",
            border: "border-green-200",
            label: "Done"
        },
        processing: {
            icon: Loader2,
            color: "text-blue-600",
            bg: "bg-blue-50",
            border: "border-blue-200",
            label: "Processing"
        },
        failed: {
            icon: XCircle,
            color: "text-red-600",
            bg: "bg-red-50",
            border: "border-red-200",
            label: "Failed"
        },
        rejected: {
            icon: AlertCircle,
            color: "text-orange-600",
            bg: "bg-orange-50",
            border: "border-orange-200",
            label: "Rejected"
        },
        idle: {
            icon: Clock,
            color: "text-muted-foreground",
            bg: "bg-muted",
            border: "border-border",
            label: "Idle"
        },
        pending: {
            icon: Clock,
            color: "text-purple-600",
            bg: "bg-purple-50",
            border: "border-purple-200",
            label: "Pending"
        }
    }

    const config = statusConfig[status]
    const Icon = config.icon

    return (
        <div className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border", config.bg, config.color, config.border, className)}>
            <Icon className={cn("h-3.5 w-3.5", status === 'processing' && "animate-spin")} />
            {config.label}
        </div>
    )
}
