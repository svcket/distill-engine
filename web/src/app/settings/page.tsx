"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { useSession } from "next-auth/react"
import { 
    User, 
    Settings as SettingsIcon, 
    CreditCard, 
    Shield, 
    Bell, 
    Trash2,
    Zap,
    Check,
    Loader2,
    ChevronDown,
    type LucideIcon
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/Button"
import { PricingCard } from "@/components/ui/pricing"
import { payWithPaystack } from "@/lib/paystack"
import { 
    Card, 
    CardContent, 
    CardDescription, 
    CardHeader, 
    CardTitle 
} from "@/components/ui/Card"
import { motion, AnimatePresence } from "framer-motion"
import { useBeta } from "@/context/BetaContext"

type SettingsCategory = "account" | "engine" | "processing" | "notifications" | "billing" | "privacy"

interface Preferences {
    writingStyle: string
    preferredTone: string
    defaultLength: string
    autoStartPipeline: boolean
    generateSummaries: boolean
    notifyInApp: boolean
    notifyEmailDigest: string
    notifyPush: boolean
    notifyCritical: boolean
}

interface UsageStats {
    sourcesProcessed: number
    draftsGenerated: number
    currentPlan: string
}

export default function SettingsPage() {
    const { data: session } = useSession()
    const { isBetaActive, enrollInBeta, isBetaEnrolled } = useBeta()
    const [activeCategory, setActiveCategory] = useState<SettingsCategory>("account")
    
    // State
    const [preferences, setPreferences] = useState<Preferences | null>(null)
    const [usage, setUsage] = useState<UsageStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [billingInterval, setBillingInterval] = useState<"monthly" | "annually">("monthly")

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [prefRes, usageRes] = await Promise.all([
                    fetch("/api/user/preferences"),
                    fetch("/api/user/usage")
                ])
                const prefData = await prefRes.json()
                const usageData = usageRes.ok ? await usageRes.json() : null
                
                setPreferences(prefData)
                setUsage(usageData)
            } catch (err) {
                console.error("Failed to load settings:", err)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [])


    const updatePreference = async (updates: Partial<Preferences>) => {
        if (!preferences) return
        setSaving(true)
        
        // Optimistic UI
        const previous = { ...preferences }
        setPreferences({ ...preferences, ...updates })

        try {
            const res = await fetch("/api/user/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates)
            })
            if (!res.ok) throw new Error("Update failed")
        } catch (err) {
            setPreferences(previous)
            console.error(err)
        } finally {
            setSaving(false)
        }
    }

    const handleReset = async () => {
        if (!window.confirm("Are you absolutely sure? This will delete all your sources and drafts permanently.")) {
            return
        }

        setSaving(true)
        try {
            const res = await fetch("/api/user/reset", { method: "POST" })
            if (!res.ok) throw new Error("Reset failed")
            
            // Refresh usage stats
            const usageRes = await fetch("/api/user/usage")
            if (usageRes.ok) {
                const usageData = await usageRes.json()
                setUsage(usageData)
            }

            alert("System reset successful. Your data has been cleared.")
        } catch (err) {
            console.error(err)
            alert("Failed to perform system reset.")
        } finally {
            setSaving(false)
        }
    }

    const categories: { id: SettingsCategory; label: string; icon: LucideIcon; color: string }[] = [
        { id: "account", label: "Profile", icon: User, color: "bg-zinc-700" },
        { id: "engine", label: "Editorial Voice", icon: SettingsIcon, color: "bg-zinc-700" },
        { id: "processing", label: "Automation", icon: Zap, color: "bg-zinc-700" },
        { id: "notifications", label: "Alert Channels", icon: Bell, color: "bg-zinc-700" },
        { id: "billing", label: "Billing & Plans", icon: CreditCard, color: "bg-zinc-700" },
        { id: "privacy", label: "System Privacy", icon: Shield, color: "bg-zinc-700" }
    ]

    return (
        <div className="mx-auto max-w-5xl px-4 lg:px-6 py-8 lg:py-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="mb-8 lg:mb-12 text-center lg:text-left">
                <h1 className="text-3xl lg:text-4xl font-serif font-bold tracking-tight text-foreground/90">Settings</h1>
                <p className="text-muted-foreground mt-2 text-base lg:text-lg max-w-xl mx-auto lg:mx-0">Manage your Distill Engine environment and editorial preferences.</p>
            </header>

            <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 items-start">
                {/* Responsive Navigation */}
                <nav className="w-full lg:w-56 shrink-0 sticky top-0 lg:top-8 z-30 bg-background/95 backdrop-blur-md lg:bg-transparent -mx-4 px-4 py-2 lg:p-0 lg:m-0 border-b border-border lg:border-none overflow-x-auto no-scrollbar">
                    <div className="flex lg:flex-col gap-1 min-w-max lg:min-w-0">
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={cn(
                                    "flex items-center gap-3 px-4 lg:px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all group relative whitespace-nowrap lg:w-full",
                                    activeCategory === cat.id 
                                        ? "bg-foreground/5 text-foreground shadow-sm ring-1 ring-foreground/5" 
                                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground/80"
                                )}
                            >
                                <div className={cn(
                                    "w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-sm transition-transform shrink-0",
                                    cat.color,
                                    activeCategory === cat.id ? "scale-105" : "group-hover:scale-105"
                                )}>
                                    <cat.icon className="w-[15px] h-[15px] stroke-[2.5]" />
                                </div>
                                {cat.label}
                                {activeCategory === cat.id && (
                                    <motion.div 
                                        layoutId="activeTab"
                                        className="absolute bottom-0 lg:left-0 lg:top-0 lg:bottom-0 left-0 right-0 h-0.5 lg:h-auto lg:w-0.5 bg-brand lg:rounded-full"
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                </nav>

                {/* Main Content Area */}
                <main className="flex-1 w-full max-w-full lg:max-w-2xl overflow-x-hidden py-4 lg:py-0">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeCategory}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="space-y-6"
                        >
                            {activeCategory === "account" && (
                                <Card className="border-border/40 bg-card/60 shadow-sm">
                                    <CardHeader className="pb-6 lg:pb-8 px-4 lg:px-6">
                                        <CardTitle className="text-lg font-serif">My Profile</CardTitle>
                                        <CardDescription>Your engine-identifying credentials managed by your auth provider.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="px-4 lg:px-6 pb-6">
                                        <div className="space-y-8">
                                            {/* Avatar Row */}
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-6 pb-2">
                                                <div className="w-20 h-20 rounded-full bg-brand/10 flex items-center justify-center overflow-hidden relative shadow-inner border border-brand/20 mx-auto sm:mx-0">
                                                    {session?.user?.image ? (
                                                        <Image 
                                                            src={session.user.image} 
                                                            alt="Profile" 
                                                            fill
                                                            className="object-cover"
                                                        />
                                                    ) : (
                                                        <span className="text-2xl font-medium text-brand uppercase tracking-tight">
                                                            {(session?.user?.name || "NE").split(" ").map(n => n[0]).join("")}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex-1 space-y-1 text-center sm:text-left">
                                                    <p className="text-sm font-semibold">Avatar Image</p>
                                                    <p className="text-xs text-muted-foreground">Managed by your Google or Magic Link account.</p>
                                                </div>
                                            </div>

                                            {/* Fields */}
                                            <div className="grid grid-cols-1 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-bold ml-1">Full Name</label>
                                                    <div className="bg-accent/10 border border-border/20 rounded-xl h-11 flex items-center px-4 text-sm font-medium text-foreground/80 truncate">
                                                        {session?.user?.name || "No name set"}
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-bold ml-1">Email Connection</label>
                                                    <div className="bg-accent/10 border border-border/20 rounded-xl h-11 flex items-center px-4 text-sm font-medium text-foreground/80 truncate">
                                                        {session?.user?.email || "No email set"}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between border-t border-border/40 gap-4">
                                                <div className="text-xs font-medium text-muted-foreground">
                                                    {usage?.currentPlan || "Starter"} Plan Membership
                                                </div>
                                                <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/40">
                                                    Verified Authentication
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                        {activeCategory === "engine" && (
                            <div className="space-y-6">
                                <Card className="border-border/40 bg-card/60 shadow-sm">
                                    <CardHeader className="pb-6 lg:pb-8 px-4 lg:px-6">
                                        <CardTitle className="text-lg font-serif">Editorial Voice</CardTitle>
                                        <CardDescription>Define the narrative flow and resonance of your synthesized content.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6 px-4 lg:px-6 pb-6">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border/40 gap-4">
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold">Writing Style</p>
                                                <p className="text-xs text-muted-foreground">Adjust the depth and detail of draft generation.</p>
                                            </div>
                                            <div className="relative w-full sm:w-32">
                                                <select
                                                    aria-label="Writing Style"
                                                    value={preferences?.writingStyle || "balanced"}
                                                    onChange={(e) => updatePreference({ writingStyle: e.target.value })}
                                                    className="bg-accent/40 text-xs font-semibold px-3 pr-8 py-1.5 rounded-lg border border-border/40 outline-none h-9 w-full appearance-none transition-all focus:ring-1 focus:ring-brand/50"
                                                >
                                                    <option value="concise">Concise</option>
                                                    <option value="balanced">Balanced</option>
                                                    <option value="narrative">Narrative</option>
                                                </select>
                                                <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none">
                                                    <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border/40 gap-4">
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold">Preferred Tone</p>
                                                <p className="text-xs text-muted-foreground">Choose how your engine should address its audience.</p>
                                            </div>
                                            <div className="relative w-full sm:w-32">
                                                <select
                                                    aria-label="Preferred Tone"
                                                    value={preferences?.preferredTone || "professional"}
                                                    onChange={(e) => updatePreference({ preferredTone: e.target.value })}
                                                    className="bg-accent/40 text-xs font-semibold px-3 pr-8 py-1.5 rounded-lg border border-border/40 outline-none h-9 w-full appearance-none transition-all focus:ring-1 focus:ring-brand/50"
                                                >
                                                    <option value="professional">Professional</option>
                                                    <option value="technical">Technical</option>
                                                    <option value="casual">Conversational</option>
                                                    <option value="witty">Sharp & Witty</option>
                                                </select>
                                                <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none">
                                                    <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold">Standard Output Length</p>
                                                <p className="text-xs text-muted-foreground">Default size for generated drafts and briefs.</p>
                                            </div>
                                            <div className="relative w-full sm:w-32">
                                                <select
                                                    aria-label="Default Length"
                                                    value={preferences?.defaultLength || "medium"}
                                                    onChange={(e) => updatePreference({ defaultLength: e.target.value })}
                                                    className="bg-accent/40 text-xs font-semibold px-3 pr-8 py-1.5 rounded-lg border border-border/40 outline-none h-9 w-full appearance-none transition-all focus:ring-1 focus:ring-brand/50"
                                                >
                                                    <option value="short">Short</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="long">Long</option>
                                                </select>
                                                <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none">
                                                    <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {activeCategory === "processing" && (
                            <Card className="border-border/40 bg-card/60 shadow-sm">
                                <CardHeader className="pb-6 lg:pb-8 px-4 lg:px-6">
                                    <CardTitle className="text-lg font-serif">Automation Flow</CardTitle>
                                    <CardDescription>Configure engine behavior during content extraction.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 px-4 lg:px-6 pb-6">
                                    <div className="flex items-center justify-between pb-4 border-b border-border/40">
                                        <div className="space-y-1 pr-4">
                                            <p className="text-sm font-semibold">Auto-start Harvesting</p>
                                            <p className="text-xs text-muted-foreground">Trigger processing immediately after ingestion.</p>
                                        </div>
                                        <button 
                                            aria-label="Toggle Auto-start Harvesting"
                                            onClick={() => {
                                                if (!preferences) return
                                                updatePreference({ autoStartPipeline: !preferences.autoStartPipeline })
                                            }}
                                            className={cn(
                                                "w-11 h-6 rounded-full transition-all duration-300 relative border ring-1 ring-border shadow-inner p-1 shrink-0",
                                                preferences?.autoStartPipeline ? "bg-emerald-500 border-emerald-400" : "bg-zinc-300 dark:bg-zinc-700 border-border"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-300",
                                                preferences?.autoStartPipeline ? "translate-x-5 shadow-emerald-900/40" : "translate-x-0"
                                            )} />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1 pr-4">
                                            <p className="text-sm font-semibold">Summary Generation</p>
                                            <p className="text-xs text-muted-foreground">Always include a condensed brief with drafts.</p>
                                        </div>
                                        <button 
                                            aria-label="Toggle Summary Generation"
                                            onClick={() => {
                                                if (!preferences) return
                                                updatePreference({ generateSummaries: !preferences.generateSummaries })
                                            }}
                                            className={cn(
                                                "w-11 h-6 rounded-full transition-all duration-300 relative border ring-1 ring-border shadow-inner p-1 shrink-0",
                                                preferences?.generateSummaries ? "bg-emerald-500 border-emerald-400" : "bg-zinc-200 dark:bg-zinc-800 border-border"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300",
                                                preferences?.generateSummaries ? "translate-x-5" : "translate-x-0"
                                            )} />
                                        </button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {activeCategory === "notifications" && (
                            <div className="space-y-6">
                                <Card className="border-border/40 bg-card/60 shadow-sm">
                                    <CardHeader className="pb-6 lg:pb-8 px-4 lg:px-6">
                                        <CardTitle className="text-lg font-serif">Alert Channels</CardTitle>
                                        <CardDescription>Manage how the engine notifies you of new outputs.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6 px-4 lg:px-6 pb-6">
                                        <div className="flex items-center justify-between pb-4 border-b border-border/40">
                                            <div className="space-y-1 pr-4">
                                                <p className="text-sm font-semibold">In-App Indicators</p>
                                                <p className="text-xs text-muted-foreground">Show activity badges in the sidebar.</p>
                                            </div>
                                            <button 
                                                aria-label="Toggle In-App Indicators"
                                                onClick={() => {
                                                    if (!preferences) return
                                                    updatePreference({ notifyInApp: !preferences.notifyInApp })
                                                }}
                                                className={cn(
                                                    "w-11 h-6 rounded-full transition-all duration-300 relative border ring-1 ring-border shadow-inner p-1 shrink-0",
                                                    preferences?.notifyInApp ? "bg-emerald-500 border-emerald-400" : "bg-zinc-300 dark:bg-zinc-700 border-border"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-300",
                                                    preferences?.notifyInApp ? "translate-x-5 shadow-emerald-900/40" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-between pb-4 border-b border-border/40">
                                            <div className="space-y-1 pr-4">
                                                <p className="text-sm font-semibold">Push Notifications</p>
                                                <p className="text-xs text-muted-foreground">Receive real-time mobile alerts for critical events.</p>
                                            </div>
                                            <button 
                                                aria-label="Toggle Push Notifications"
                                                onClick={() => {
                                                    if (!preferences) return
                                                    updatePreference({ notifyPush: !preferences.notifyPush })
                                                }}
                                                className={cn(
                                                    "w-11 h-6 rounded-full transition-all duration-300 relative border ring-1 ring-border shadow-inner p-1 shrink-0",
                                                    preferences?.notifyPush ? "bg-emerald-500 border-emerald-400" : "bg-zinc-300 dark:bg-zinc-700 border-border"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-300",
                                                    preferences?.notifyPush ? "translate-x-5 shadow-emerald-900/40" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <div className="space-y-1 pr-4">
                                                <p className="text-sm font-semibold">Critical System Alerts</p>
                                                <p className="text-xs text-muted-foreground">Immediate alerts for pipeline failures or storage limits.</p>
                                            </div>
                                            <button 
                                                aria-label="Toggle Critical Alerts"
                                                onClick={() => {
                                                    if (!preferences) return
                                                    updatePreference({ notifyCritical: !preferences.notifyCritical })
                                                }}
                                                className={cn(
                                                    "w-11 h-6 rounded-full transition-all duration-300 relative border ring-1 ring-border shadow-inner p-1 shrink-0",
                                                    preferences?.notifyCritical ? "bg-emerald-500 border-emerald-400" : "bg-zinc-300 dark:bg-zinc-700 border-border"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-300",
                                                    preferences?.notifyCritical ? "translate-x-5 shadow-emerald-900/40" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-border/40 bg-card/60 shadow-sm">
                                    <CardHeader className="pb-6 lg:pb-8 px-4 lg:px-6">
                                        <CardTitle className="text-lg font-serif">Email Preferences</CardTitle>
                                        <CardDescription>Configure the frequency of your editorial digests.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="px-4 lg:px-6 pb-6">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold group-hover:text-brand transition-colors">Distill Digest</p>
                                                <p className="text-xs text-muted-foreground">A summary of your major insights delivered to your inbox.</p>
                                            </div>
                                            <div className="relative w-full sm:w-32">
                                                <select
                                                    aria-label="Email Digest Frequency"
                                                    value={preferences?.notifyEmailDigest || "daily"}
                                                    onChange={(e) => {
                                                        if (!preferences) return
                                                        updatePreference({ notifyEmailDigest: e.target.value })
                                                    }}
                                                    className="bg-accent/40 text-xs font-semibold px-3 pr-8 py-1.5 rounded-lg border border-border/40 outline-none h-9 w-full appearance-none transition-all focus:ring-1 focus:ring-brand/50"
                                                >
                                                    <option value="off">Off</option>
                                                    <option value="daily">Daily</option>
                                                    <option value="weekly">Weekly</option>
                                                </select>
                                                <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none">
                                                    <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {activeCategory === "billing" && (
                            <div className="space-y-6">
                                <Card className="border-border/40 bg-card/60 shadow-sm">
                                    <CardHeader className="pb-6 lg:pb-8 px-4 lg:px-6">
                                        <CardTitle className="text-lg font-serif">Current Usage</CardTitle>
                                        <CardDescription>Summary of your engine utilization for this billing cycle.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="px-4 lg:px-6 pb-6">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="p-4 rounded-xl border border-border/40 bg-background/50 flex flex-col items-center">
                                                <p className="text-[11px] text-muted-foreground uppercase font-semibold">Sources Processed</p>
                                                <p className="text-2xl lg:text-3xl font-serif font-bold mt-1">{usage?.sourcesProcessed || 0}</p>
                                            </div>
                                            <div className="p-4 rounded-xl border border-border/40 bg-background/50 flex flex-col items-center">
                                                <p className="text-[11px] text-muted-foreground uppercase font-semibold">Drafts Generated</p>
                                                <p className="text-2xl lg:text-3xl font-serif font-bold mt-1">{usage?.draftsGenerated || 0}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-border/40 bg-card/60 shadow-sm overflow-hidden">
                                    <div className="p-4 lg:p-6 flex flex-col items-start w-full space-y-6">
                                        <div className="flex flex-col gap-1 w-full text-left">
                                            <CardTitle className="text-lg font-serif transition-colors">Subscription Plans</CardTitle>
                                            <CardDescription>Upgrade to increase processing depth and export capacity.</CardDescription>
                                        </div>
                                        
                                        <div className="inline-flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/10 self-center sm:self-start">
                                            <button
                                                onClick={() => setBillingInterval("monthly")}
                                                className={cn(
                                                    "px-5 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                                                    billingInterval === "monthly" 
                                                        ? "bg-foreground text-background shadow-sm" 
                                                        : "text-muted-foreground hover:text-foreground/80"
                                                )}
                                            >
                                                Monthly
                                            </button>
                                            <button
                                                onClick={() => setBillingInterval("annually")}
                                                className={cn(
                                                    "px-5 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2",
                                                    billingInterval === "annually" 
                                                        ? "bg-foreground text-background shadow-sm" 
                                                        : "text-muted-foreground hover:text-foreground/80"
                                                )}
                                            >
                                                Annually
                                                <span className={cn(
                                                    "text-[9px] px-1.5 py-0.5 rounded-md border font-black transition-colors",
                                                    billingInterval === "annually"
                                                        ? "bg-emerald-500 text-white border-emerald-400"
                                                        : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                                )}>
                                                    -20%
                                                </span>
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full m-0 p-0 items-stretch">
                                            <PricingCard
                                                title="Free"
                                                price="$0 / mo"
                                                description="Experience basic unified intelligence for personal projects."
                                                buttonVariant="outline"
                                                isCurrentPlan={!isBetaEnrolled}
                                                features={[
                                                    "7 Sources Processed / mo",
                                                    "Max 30 min per Source",
                                                    "Standard Transcript Extraction",
                                                    "Basic X-Thread Generation",
                                                    "1 Connected Platform"
                                                ]}
                                            />
                                            <PricingCard
                                                title="Pro"
                                                price={billingInterval === "monthly" ? "$19 / mo" : "$15 / mo"}
                                                savings={billingInterval === "annually" ? "Save $48/yr" : undefined}
                                                description="Complete industrial content engine for operators and teams."
                                                buttonVariant="default"
                                                highlight
                                                isCurrentPlan={!isBetaActive && false} // Placeholder for real Pro check if not in Beta
                                                onClick={() => {
                                                    if (isBetaActive) {
                                                        enrollInBeta();
                                                    } else {
                                                        payWithPaystack({
                                                            email: session?.user?.email || "",
                                                            amount: billingInterval === "monthly" ? 190000 : 1800000, 
                                                            metadata: { plan: 'pro', interval: billingInterval }
                                                        })
                                                    }
                                                }}
                                                features={[
                                                    "Unlimited Source Ingestion",
                                                    "Unlimited Source Duration",
                                                    "Deep Density Intelligence (DQM)",
                                                    "Advanced Multichannel Assets",
                                                    "Direct-to-Social Publishing",
                                                    "Priority Processing Queue",
                                                    "Unlimited Accounts"
                                                ]}
                                            />
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {activeCategory === "privacy" && (
                            <Card className="border-red-500/10 bg-red-500/[0.02] shadow-sm">
                                <CardHeader className="pb-4 border-b border-red-500/10 px-4 lg:px-6">
                                    <CardTitle className="text-lg font-serif text-red-600 dark:text-red-400">Total System Reset</CardTitle>
                                    <CardDescription className="text-red-600/60 dark:text-red-400/60">
                                        Permanently remove all harvested audio, transcripts, and drafts from the system.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-6 px-4 lg:px-6 pb-6">
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                                        <div className="space-y-1 text-center sm:text-left">
                                            <p className="text-sm font-semibold text-red-600">Danger Zone</p>
                                            <p className="text-xs text-red-600/60 font-normal">This action cannot be undone.</p>
                                        </div>
                                        <Button 
                                            variant="outline" 
                                            onClick={handleReset}
                                            disabled={saving}
                                            className="text-red-600 border-red-200 hover:bg-red-500/10 rounded-xl px-6 font-bold h-11 gap-2 w-full sm:w-auto"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Clear All Data
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>

            {/* Float Saved/State Indicator */}
            <div className={cn(
                "fixed bottom-10 right-10 flex items-center gap-3 px-5 py-2.5 rounded-full shadow-2xl backdrop-blur-xl border transition-all duration-500 transform",
                saving 
                    ? "bg-brand text-background border-brand/20 translate-y-0 opacity-100" 
                    : !loading 
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent translate-y-2 opacity-0 hover:translate-y-0 hover:opacity-100"
                        : "opacity-0 translate-y-8"
            )}>
                {saving ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin stroke-[3]" />
                        <span className="text-[13px] font-bold tracking-tight">Syncing Changes</span>
                    </>
                ) : (
                    <>
                        <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
                            <Check className="w-3 h-3 text-green-500 stroke-[3]" />
                        </div>
                        <span className="text-[13px] font-bold tracking-tight">Cloud Synchronized</span>
                    </>
                )}
            </div>
        </div>
    )
}
