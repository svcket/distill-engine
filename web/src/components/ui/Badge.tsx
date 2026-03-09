import * as React from "react"
import { cn } from "@/lib/utils"

const Badge = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "secondary" | "outline" | "destructive" | "success" }
>(({ className, variant = "default", ...props }, ref) => {
    const variants = {
        default: "bg-brand text-background hover:bg-brand/90",
        secondary: "bg-muted text-muted-foreground hover:bg-muted/80",
        outline: "border border-border text-foreground",
        destructive: "bg-red-50 text-red-600 border border-red-200",
        success: "bg-green-50 text-green-700 border border-green-200",
    }

    return (
        <div
            ref={ref}
            className={cn(
                "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2",
                variants[variant],
                className
            )}
            {...props}
        />
    )
})
Badge.displayName = "Badge"

export { Badge }
