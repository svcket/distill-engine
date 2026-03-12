"use client"

import { Badge } from "@/components/ui/Badge"
import { Card } from "@/components/ui/Card"
import { useLanguage } from "@/context/LanguageContext"

export default function SettingsPage() {
    const { t } = useLanguage()
    const envStatus = {
        youtube: "Configured",
        openai: "Configured"
    }

    return (
        <div className="p-8 max-w-[800px] mx-auto space-y-8 animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-serif font-semibold tracking-tight">{t("settings")}</h1>
                <p className="text-muted-foreground mt-1">System configuration and API connections.</p>
            </div>

            <Card>
                <div className="p-6 space-y-6">
                    <h2 className="text-lg font-semibold">API Connections</h2>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between py-3 border-b border-border/60">
                            <div>
                                <p className="text-sm font-medium">YouTube Data API</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Used for source discovery via topic search</p>
                            </div>
                            <Badge variant={envStatus.youtube === "Configured" ? "success" : "secondary"}>
                                {envStatus.youtube}
                            </Badge>
                        </div>
                        <div className="flex items-center justify-between py-3 border-b border-border/60">
                            <div>
                                <p className="text-sm font-medium">OpenAI API</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Powers insight extraction, angle strategy, and draft generation</p>
                            </div>
                            <Badge variant={envStatus.openai === "Configured" ? "success" : "secondary"}>
                                {envStatus.openai}
                            </Badge>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        API keys are configured via <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">web/.env.local</code>. Restart the dev server after changes.
                    </p>
                </div>
            </Card>

            <Card>
                <div className="p-6 space-y-4">
                    <h2 className="text-lg font-semibold">System</h2>
                    <div className="flex items-center justify-between py-3 border-b border-border/60">
                        <div>
                            <p className="text-sm font-medium">Database</p>
                            <p className="text-xs text-muted-foreground mt-0.5">No database required — Distill runs entirely locally</p>
                        </div>
                        <Badge variant="secondary">Local Only</Badge>
                    </div>
                    <div className="flex items-center justify-between py-3 border-b border-border/60">
                        <div>
                            <p className="text-sm font-medium">Python Runtime</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Execution scripts run via Python 3</p>
                        </div>
                        <Badge variant="success">Active</Badge>
                    </div>
                </div>
            </Card>
        </div>
    )
}
