"use client"

import { useState, useEffect } from "react"
import { useSession, signOut } from "next-auth/react"
import { 
    User, 
    Settings as SettingsIcon, 
    CreditCard, 
    Shield, 
    Bell, 
    Sliders,
    LogOut,
    Trash2,
    Check,
    Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/Button"

type SettingsCategory = "account" | "engine" | "processing" | "notifications" | "billing" | "privacy"

interface Preferences {
    writingStyle: string
    preferredTone: string
    defaultLength: string
    autoStartPipeline: boolean
    generateSummaries: boolean
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
                const usageData = await usageRes.json()
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

    const categories: { id: SettingsCategory; label: string; icon: React.ComponentType<any> }[] = [
        { id: "account", label: "Account", icon: User },
        { id: "engine", label: "Engine Preferences", icon: SettingsIcon },
        { id: "processing", label: "Processing Defaults", icon: Sliders },
        { id: "notifications", label: "Notifications", icon: Bell },
        { id: "billing", label: "Usage & Billing", icon: CreditCard },
        { id: "privacy", label: "Data & Privacy", icon: Shield }
    ]

    return (
        <div className="mx-auto max-w-5xl px-4 py-12 animate-in fade-in duration-500">
            <div className="mb-10">
                <h1 className="text-3xl font-serif font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground mt-2">Manage your Distill Engine environment and identity.</p>
            </div>

            <div className="flex gap-12">
                {/* Left Column: Navigation */}
                <aside className="w-64 shrink-0 flex flex-col gap-1">
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left",
                                activeCategory === cat.id 
                                    ? "bg-muted text-foreground shadow-micro border border-border/50" 
                                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            )}
                        >
                            <cat.icon className="w-4 h-4" />
                            {cat.label}
                        </button>
                    ))}
                    
                    <div className="mt-8 pt-6 border-t border-border">
                        <button 
                            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all w-full text-left"
                        >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </button>
                    </div>
                </aside>

                {/* Right Column: Controls */}
                <div className="flex-1 max-w-2xl">
                    {activeCategory === "account" && (
                        <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-300">
                            <section>
                                <h2 className="text-lg font-bold mb-4">Profile</h2>
                                <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-micro">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden border border-border">
                                            {session?.user?.image ? (
                                                <img src={session.user.image} alt={session.user.name || ""} />
                                            ) : (
                                                <User className="w-6 h-6 text-muted-foreground/40" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-medium">{session?.user?.name || "Distill User"}</p>
                                            <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h2 className="text-lg font-bold mb-4">Security</h2>
                                <div className="space-y-4 rounded-2xl border border-border p-6 bg-muted/30 shadow-micro">
                                    <p className="text-sm text-muted-foreground">You are currently signed in via Google OAuth.</p>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeCategory === "engine" && (
                        <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-300">
                             <section>
                                <h2 className="text-lg font-bold mb-4">Editorial Voice</h2>
                                <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-micro">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Writing Style</label>
                                        <div className="flex gap-2">
                                            {["concise", "balanced", "narrative"].map((style) => (
                                                <button
                                                    key={style}
                                                    onClick={() => updatePreference({ writingStyle: style })}
                                                    className={cn(
                                                        "px-4 py-2 rounded-xl text-sm font-medium border transition-all capitalize",
                                                        preferences?.writingStyle === style
                                                            ? "bg-brand text-background border-brand"
                                                            : "bg-background text-muted-foreground border-border hover:border-brand/50"
                                                    )}
                                                >
                                                    {style}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Preferred Tone</label>
                                        <select
                                            value={preferences?.preferredTone || "professional"}
                                            onChange={(e) => updatePreference({ preferredTone: e.target.value })}
                                            className="w-full bg-muted border border-border rounded-xl px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-brand"
                                        >
                                            <option value="professional">Professional & Objective</option>
                                            <option value="technical">Highly Technical</option>
                                            <option value="casual">Conversational & Casual</option>
                                            <option value="witty">Witty & Sharp</option>
                                        </select>
                                    </div>
                                </div>
                             </section>

                             <section>
                                <h2 className="text-lg font-bold mb-4">Synthesis Depth</h2>
                                <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-micro">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium">Default Length</p>
                                            <p className="text-xs text-muted-foreground">Adjust target word count for initial drafts.</p>
                                        </div>
                                        <div className="flex bg-muted rounded-xl p-1 gap-1">
                                            {["short", "medium", "long"].map((len) => (
                                                <button
                                                    key={len}
                                                    onClick={() => updatePreference({ defaultLength: len })}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                                                        preferences?.defaultLength === len
                                                            ? "bg-background text-foreground shadow-micro"
                                                            : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                >
                                                    {len}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                             </section>
                        </div>
                    )}

                    {activeCategory === "processing" && (
                        <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-300">
                             <section>
                                <h2 className="text-lg font-bold mb-4">Pipeline Behavior</h2>
                                <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-micro">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium">Auto-start Harvesting</p>
                                            <p className="text-xs text-muted-foreground">Automatically trigger transcription after ingest.</p>
                                        </div>
                                        <button 
                                            onClick={() => updatePreference({ autoStartPipeline: !preferences?.autoStartPipeline })}
                                            className={cn(
                                                "w-12 h-6 rounded-full transition-colors relative",
                                                preferences?.autoStartPipeline ? "bg-brand" : "bg-muted"
                                            )}
                                        >
                                            <div className={cn(
                                                "absolute top-1 left-1 w-4 h-4 rounded-full bg-background transition-transform",
                                                preferences?.autoStartPipeline ? "translate-x-6" : ""
                                            )} />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between pt-4 border-t border-border/50">
                                        <div>
                                            <p className="text-sm font-medium">Generate Summaries</p>
                                            <p className="text-xs text-muted-foreground">Default to summary generation for all sources.</p>
                                        </div>
                                        <button 
                                            onClick={() => updatePreference({ generateSummaries: !preferences?.generateSummaries })}
                                            className={cn(
                                                "w-12 h-6 rounded-full transition-colors relative",
                                                preferences?.generateSummaries ? "bg-brand" : "bg-muted"
                                            )}
                                        >
                                            <div className={cn(
                                                "absolute top-1 left-1 w-4 h-4 rounded-full bg-background transition-transform",
                                                preferences?.generateSummaries ? "translate-x-6" : ""
                                            )} />
                                        </button>
                                    </div>
                                </div>
                             </section>
                        </div>
                    )}

                    {activeCategory === "notifications" && (
                        <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-300 text-center py-20 bg-muted/20 rounded-3xl border border-dashed border-border/60">
                             <Bell className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                             <h3 className="text-lg font-bold">Stay Updated</h3>
                             <p className="text-sm text-muted-foreground max-w-xs mx-auto">Browser and email notifications for completed drafts. <br/><span className="text-xs font-bold uppercase tracking-widest text-brand mt-4 block">Coming Soon</span></p>
                        </div>
                    )}

                    {activeCategory === "billing" && (
                        <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-300">
                            <section>
                                <h2 className="text-lg font-bold mb-4">Subscription Plan</h2>
                                <div className="rounded-2xl border border-border p-6 bg-muted/30 shadow-micro">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground/40">Current Plan</p>
                                            <h3 className="text-2xl font-bold mt-1 capitalize">{usage?.currentPlan || "Free Trial"}</h3>
                                        </div>
                                        <Button className="rounded-xl px-6">Upgrade to Pro</Button>
                                    </div>
                                </div>
                            </section>
 
                            <section>
                                <h2 className="text-lg font-bold mb-4">Usage Statistics</h2>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="rounded-2xl border border-border p-6 bg-card shadow-micro">
                                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Sources Processed</p>
                                        <p className="text-3xl font-mono font-bold mt-2">{usage?.sourcesProcessed || 0}</p>
                                    </div>
                                    <div className="rounded-2xl border border-border p-6 bg-card shadow-micro">
                                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Drafts Generated</p>
                                        <p className="text-3xl font-mono font-bold mt-2">{usage?.draftsGenerated || 0}</p>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeCategory === "privacy" && (
                        <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-300">
                             <section>
                                <h2 className="text-lg font-bold mb-4 text-red-500">Danger Zone</h2>
                                <div className="rounded-2xl border border-red-100 dark:border-red-900/30 p-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-bold">Clear All Data</p>
                                            <p className="text-xs text-muted-foreground">Permanently delete all your sources and drafts.</p>
                                        </div>
                                        <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 rounded-xl gap-2 font-bold">
                                            <Trash2 className="w-3" />
                                            Clear
                                        </Button>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}
                </div>
            </div>

            {/* Float HUD for saving state */}
            {saving && (
                <div className="fixed bottom-8 right-8 bg-brand text-background px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-bold animate-in slide-in-from-bottom-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                </div>
            )}
            {!saving && !loading && (
                <div className="fixed bottom-8 right-8 bg-zinc-900 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-bold opacity-0 hover:opacity-100 transition-opacity">
                    <Check className="w-4 h-4 text-green-400" />
                    Changes Saved
                </div>
            )}
        </div>
    )
}
