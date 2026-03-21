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
    type LucideIcon
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/Button"
import { PricingCard } from "@/components/ui/pricing"
import { 
    Card, 
    CardContent, 
    CardDescription, 
    CardHeader, 
    CardTitle 
} from "@/components/ui/Card"

type SettingsCategory = "account" | "engine" | "processing" | "notifications" | "billing" | "privacy"

interface Preferences {
    writingStyle: string
    preferredTone: string
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
    const [activeCategory, setActiveCategory] = useState<SettingsCategory>("account")
    
    // State
    const [preferences, setPreferences] = useState<Preferences | null>(null)
    const [usage, setUsage] = useState<UsageStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

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

    const categories: { id: SettingsCategory; label: string; icon: LucideIcon; color: string }[] = [
        { id: "account", label: "Profile", icon: User, color: "bg-zinc-700" },
        { id: "engine", label: "Editorial Voice", icon: SettingsIcon, color: "bg-zinc-700" },
        { id: "processing", label: "Automation", icon: Zap, color: "bg-zinc-700" },
        { id: "notifications", label: "Alert Channels", icon: Bell, color: "bg-zinc-700" },
        { id: "billing", label: "Billing & Plans", icon: CreditCard, color: "bg-zinc-700" },
        { id: "privacy", label: "System Privacy", icon: Shield, color: "bg-zinc-700" }
    ]

    return (
        <div className="mx-auto max-w-5xl px-6 py-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="mb-12">
                <h1 className="text-4xl font-serif font-bold tracking-tight text-foreground/90">Settings</h1>
                <p className="text-muted-foreground mt-2 text-lg">Manage your Distill Engine environment and editorial preferences.</p>
            </header>

            <div className="flex gap-16 items-start">
                {/* Apple-style Sidebar Navigation */}
                <aside className="w-56 shrink-0 space-y-1 sticky top-8">
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={cn(
                                "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all group relative",
                                activeCategory === cat.id 
                                    ? "bg-foreground/5 text-foreground shadow-sm ring-1 ring-foreground/5" 
                                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground/80"
                            )}
                        >
                            <div className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-sm transition-transform",
                                cat.color,
                                activeCategory === cat.id ? "scale-105" : "group-hover:scale-105"
                            )}>
                                <cat.icon className="w-[15px] h-[15px] stroke-[2.5]" />
                            </div>
                            {cat.label}
                        </button>
                    ))}
                </aside>

                {/* Main Content Area: Grouped Lists */}
                <main className="flex-1 max-w-2xl min-h-[600px]">
                    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                        {activeCategory === "account" && (
                            <Card className="border-border/40 bg-card/60 shadow-sm">
                                <CardHeader className="pb-8">
                                    <CardTitle className="text-lg font-serif">My Profile</CardTitle>
                                    <CardDescription>Your engine-identifying credentials and subscription tier.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-4 py-2">
                                        <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center overflow-hidden relative shadow-inner border border-brand/20">
                                            {session?.user?.image ? (
                                                <Image 
                                                    src={session.user.image} 
                                                    alt={session.user.name || "Profile"} 
                                                    fill
                                                    className="object-cover"
                                                />
                                            ) : (
                                                <span className="text-lg font-medium text-brand uppercase tracking-tight">
                                                    {(session?.user?.name || "NE").split(" ").map(n => n[0]).join("")}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xl font-medium text-foreground tracking-tight">
                                                {session?.user?.name || "Member"}
                                            </span>
                                            <span className="text-sm text-muted-foreground mt-1">
                                                {usage?.currentPlan || "Starter"} Plan
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {activeCategory === "engine" && (
                            <div className="space-y-6">
                                <Card className="border-border/40 bg-card/60 shadow-sm">
                                    <CardHeader className="pb-8">
                                        <CardTitle className="text-lg font-serif">Editorial Voice</CardTitle>
                                        <CardDescription>Define the narrative flow and resonance of your synthesized content.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="flex items-center justify-between pb-4 border-b border-border/40">
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold">Writing Style</p>
                                                <p className="text-xs text-muted-foreground">Adjust the depth and detail of draft generation.</p>
                                            </div>
                                            <select
                                                aria-label="Writing Style"
                                                value={preferences?.writingStyle || "balanced"}
                                                onChange={(e) => updatePreference({ writingStyle: e.target.value })}
                                                className="bg-accent/40 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border/40 outline-none h-9 w-32"
                                            >
                                                <option value="concise">Concise</option>
                                                <option value="balanced">Balanced</option>
                                                <option value="narrative">Narrative</option>
                                            </select>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold">Preferred Tone</p>
                                                <p className="text-xs text-muted-foreground">Choose how your engine should address its audience.</p>
                                            </div>
                                            <select
                                                aria-label="Preferred Tone"
                                                value={preferences?.preferredTone || "professional"}
                                                onChange={(e) => updatePreference({ preferredTone: e.target.value })}
                                                className="bg-accent/40 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border/40 outline-none h-9 w-32"
                                            >
                                                <option value="professional">Professional</option>
                                                <option value="technical">Technical</option>
                                                <option value="casual">Conversational</option>
                                                <option value="witty">Sharp & Witty</option>
                                            </select>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {activeCategory === "processing" && (
                            <Card className="border-border/40 bg-card/60 shadow-sm">
                                <CardHeader className="pb-8">
                                    <CardTitle className="text-lg font-serif">Automation Flow</CardTitle>
                                    <CardDescription>Configure engine behavior during content extraction.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="flex items-center justify-between pb-4 border-b border-border/40">
                                        <div className="space-y-1">
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
                                                "w-11 h-6 rounded-full transition-all duration-300 relative border ring-1 ring-border shadow-inner p-1",
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
                                        <div className="space-y-1">
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
                                                "w-11 h-6 rounded-full transition-all duration-300 relative border ring-1 ring-border shadow-inner p-1",
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
                                    <CardHeader className="pb-8">
                                        <CardTitle className="text-lg font-serif">Alert Channels</CardTitle>
                                        <CardDescription>Manage how the engine notifies you of new outputs.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="flex items-center justify-between pb-4 border-b border-border/40">
                                            <div className="space-y-1">
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
                                                    "w-11 h-6 rounded-full transition-all duration-300 relative border ring-1 ring-border shadow-inner p-1",
                                                    preferences?.notifyInApp ? "bg-emerald-500 border-emerald-400" : "bg-zinc-300 dark:bg-zinc-700 border-border"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-300",
                                                    preferences?.notifyInApp ? "translate-x-5 shadow-emerald-900/40" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <div className="space-y-1">
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
                                                    "w-11 h-6 rounded-full transition-all duration-300 relative border ring-1 ring-border shadow-inner p-1",
                                                    preferences?.notifyPush ? "bg-emerald-500 border-emerald-400" : "bg-zinc-300 dark:bg-zinc-700 border-border"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-300",
                                                    preferences?.notifyPush ? "translate-x-5 shadow-emerald-900/40" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-border/40 bg-card/60 shadow-sm">
                                    <CardHeader className="pb-8">
                                        <CardTitle className="text-lg font-serif">Email Preferences</CardTitle>
                                        <CardDescription>Configure the frequency of your editorial digests.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center justify-between group">
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold group-hover:text-brand transition-colors">Distill Digest</p>
                                                <p className="text-xs text-muted-foreground">A summary of your major insights delivered to your inbox.</p>
                                            </div>
                                            <select
                                                aria-label="Email Digest Frequency"
                                                value={preferences?.notifyEmailDigest || "daily"}
                                                onChange={(e) => {
                                                    if (!preferences) return
                                                    updatePreference({ notifyEmailDigest: e.target.value })
                                                }}
                                                className="bg-accent/40 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border/40 outline-none h-9 w-32"
                                            >
                                                <option value="off">Off</option>
                                                <option value="daily">Daily</option>
                                                <option value="weekly">Weekly</option>
                                            </select>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {activeCategory === "billing" && (
                            <div className="space-y-6">
                                <Card className="border-border/40 bg-card/60 shadow-sm">
                                    <CardHeader className="pb-8">
                                        <CardTitle className="text-lg font-serif">Current Usage</CardTitle>
                                        <CardDescription>Summary of your engine utilization for this billing cycle.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 rounded-xl border border-border/40 bg-background/50 flex flex-col items-center">
                                                <p className="text-[11px] text-muted-foreground uppercase font-semibold">Sources Processed</p>
                                                <p className="text-3xl font-serif font-bold mt-1">{usage?.sourcesProcessed || 0}</p>
                                            </div>
                                            <div className="p-4 rounded-xl border border-border/40 bg-background/50 flex flex-col items-center">
                                                <p className="text-[11px] text-muted-foreground uppercase font-semibold">Drafts Generated</p>
                                                <p className="text-3xl font-serif font-bold mt-1">{usage?.draftsGenerated || 0}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-border/40 bg-card/60 shadow-sm overflow-hidden">
                                    <CardHeader className="pb-8">
                                        <CardTitle className="text-lg font-serif">Subscription Plans</CardTitle>
                                        <CardDescription>Upgrade to increase processing depth and export capacity.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-4 sm:p-6 lg:p-8">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                                            <PricingCard
                                                title="Free"
                                                price="$0 / mo"
                                                description="Experience basic unified intelligence."
                                                buttonVariant="outline"
                                                features={["2 Connected Accounts", "Unified Search", "Basic Filtering"]}
                                            />
                                            <PricingCard
                                                title="Pro"
                                                price="$19 / mo"
                                                description="Advanced research and export depth."
                                                buttonVariant="default"
                                                highlight
                                                features={["Unlimited Accounts", "Smart Labels", "Priority Support"]}
                                            />
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {activeCategory === "privacy" && (
                            <Card className="border-red-500/10 bg-red-500/[0.02] shadow-sm">
                                <CardHeader className="pb-4 border-b border-red-500/10">
                                    <CardTitle className="text-lg font-serif text-red-600 dark:text-red-400">Total System Reset</CardTitle>
                                    <CardDescription className="text-red-600/60 dark:text-red-400/60">
                                        Permanently remove all harvested audio, transcripts, and drafts from the system.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-6">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-red-600">Danger Zone</p>
                                            <p className="text-xs text-red-600/60 font-normal">This action cannot be undone.</p>
                                        </div>
                                        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-500/10 rounded-xl px-6 font-bold h-11 gap-2">
                                            <Trash2 className="w-4 h-4" />
                                            Clear All Data
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
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
