"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { 
    Search, 
    Library as LibraryIcon, 
    Hash, 
    Tag, 
    Sparkles, 
    ChevronRight,
    ArrowRight
} from "lucide-react"
import { useLanguage } from "@/context/LanguageContext"
import { cn } from "@/lib/utils"
import { archivedInsights } from "@/lib/mockData"

export default function LibraryPage() {
    const { t } = useLanguage()
    const [searchQuery, setSearchQuery] = useState("")
    const [isSearching, setIsSearching] = useState(false)
    const [showSuggestions, setShowSuggestions] = useState(false)
    const suggestionRef = useRef<HTMLDivElement>(null)

    // Handle clicks outside suggestions
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const filteredInsights = useMemo(() => {
        if (!searchQuery.trim()) return archivedInsights
        const query = searchQuery.toLowerCase()
        return archivedInsights.filter(insight => 
            insight.title.toLowerCase().includes(query) || 
            insight.description.toLowerCase().includes(query) ||
            insight.tags.some(tag => tag.toLowerCase().includes(query))
        )
    }, [searchQuery])

    const suggestions = useMemo(() => {
        if (!searchQuery.trim()) return []
        const query = searchQuery.toLowerCase()
        
        const matches = archivedInsights.filter(insight => 
            insight.title.toLowerCase().includes(query) ||
            insight.tags.some(tag => tag.toLowerCase().includes(query))
        )

        return matches.slice(0, 5)
    }, [searchQuery])

    const handleSearch = (val: string) => {
        setSearchQuery(val)
        if (val.length > 1) {
            setIsSearching(true)
            setShowSuggestions(true)
            setTimeout(() => setIsSearching(false), 300)
        } else {
            setShowSuggestions(false)
        }
    }

    return (
        <div className="p-8 max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">

            <div className="flex flex-col gap-6 items-center text-center max-w-2xl mx-auto py-12">
                <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mb-2 shadow-soft">
                    <LibraryIcon className="w-8 h-8 text-white" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-4xl font-serif font-semibold tracking-tight">{t("library")}</h1>
                    <p className="text-muted-foreground text-lg">
                        A searchable archive of deeply understood concepts, frameworks, and insights extracted from your research.
                    </p>
                </div>

                <div className="relative w-full max-w-xl mt-4" ref={suggestionRef}>
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={t("searchPlaceholder")}
                        className="w-full pl-12 pr-4 h-14 text-base rounded-full shadow-soft border-border bg-background/80 backdrop-blur-md focus:ring-2 focus:ring-brand/20 outline-none transition-all placeholder:text-muted-foreground/50"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        onFocus={() => searchQuery.length > 1 && setShowSuggestions(true)}
                    />
                    
                    {/* Library Smart Suggestions */}
                    {showSuggestions && (searchQuery.length > 1) && (
                        <div className="absolute top-full left-0 right-0 mt-3 bg-white border border-border shadow-soft rounded-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
                            {isSearching ? (
                                <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-3">
                                    <div className="w-5 h-5 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
                                    <span>Scanning library archives...</span>
                                </div>
                            ) : suggestions.length > 0 ? (
                                <div className="space-y-1">
                                    <div className="px-3 py-2 flex items-center justify-between">
                                        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest flex items-center gap-1.5">
                                            <Sparkles className="w-3 h-3 text-brand" /> Library Matches
                                        </p>
                                    </div>
                                    {suggestions.map((item) => (
                                        <button
                                            key={item.id}
                                            className="w-full text-left p-3 rounded-xl hover:bg-muted/50 transition-all group/item flex items-center justify-between"
                                            onClick={() => {
                                                setSearchQuery(item.title)
                                                setShowSuggestions(false)
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover/item:bg-white transition-colors">
                                                    <Hash className="w-4 h-4 text-muted-foreground" />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <p className="text-sm font-medium leading-none group-hover/item:text-brand">{item.title}</p>
                                                    <p className="text-[11px] text-muted-foreground">{item.type} · from {item.sourceTitle}</p>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-muted-foreground/30 opacity-0 -translate-x-2 transition-all group-hover/item:opacity-100 group-hover/item:translate-x-0" />
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-8 text-center text-sm text-muted-foreground">
                                    No direct matches found in your archived insights.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid md:grid-cols-4 gap-8">

                {/* Sidebar Filter/Navigation */}
                <div className="space-y-6">
                    <div className="space-y-3">
                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <Hash className="w-4 h-4" /> Core Themes
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {["AI Agents", "System Design", "Content Strategy", "Mental Models", "Bootstrapping"].map(pillar => (
                                <Badge 
                                    key={pillar} 
                                    variant="outline" 
                                    className={cn(
                                        "bg-white hover:bg-muted cursor-pointer transition-colors",
                                        searchQuery === pillar && "border-brand text-brand bg-brand/5"
                                    )}
                                    onClick={() => setSearchQuery(pillar)}
                                >
                                    {pillar}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3 pt-6 border-t border-border">
                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <Tag className="w-4 h-4" /> Popular Entities
                        </h3>
                        <div className="space-y-2">
                            {["Linus Lee", "Shawn Wang", "Cursor", "Next.js", "GPT-4"].map(tag => (
                                <div 
                                    key={tag} 
                                    className={cn(
                                        "text-sm text-foreground hover:text-brand cursor-pointer transition-colors flex items-center justify-between group",
                                        searchQuery === tag && "text-brand font-medium"
                                    )}
                                    onClick={() => setSearchQuery(tag)}
                                >
                                    {tag}
                                    <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Insight Feed */}
                <div className="md:col-span-3 space-y-4">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-serif font-medium">
                            {searchQuery ? `Insights matching "${searchQuery}"` : "Recently Archived Insights"}
                        </h2>
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery("")}
                                className="text-xs text-muted-foreground hover:text-brand underline underline-offset-4"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>

                    {filteredInsights.length > 0 ? (
                        <div className="space-y-4">
                            {filteredInsights.map(insight => (
                                <Card key={insight.id} className="group hover:border-brand/40 hover:shadow-soft transition-all duration-300">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center justify-between mb-3">
                                            <Badge variant="secondary" className="bg-muted text-foreground/70 font-medium">
                                                {insight.type}
                                            </Badge>
                                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">{insight.archivedAt}</span>
                                        </div>
                                        <CardTitle className="text-lg group-hover:text-brand transition-colors">{insight.title}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                                            {insight.description}
                                        </p>
                                        <div className="flex items-center justify-between pt-4 border-t border-border/50">
                                            <div className="flex items-center gap-3">
                                                <span className="text-[11px] text-muted-foreground font-medium italic">Source: {insight.sourceTitle}</span>
                                            </div>
                                            <div className="flex gap-1.5">
                                                {insight.tags.slice(0, 2).map(tag => (
                                                    <span key={tag} className="text-[10px] text-brand/70 bg-brand/5 px-2 py-0.5 rounded-full font-medium">#{tag.replace(/\s/g, '').toLowerCase()}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="py-20 text-center space-y-3">
                            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
                                <Search className="w-6 h-6 text-muted-foreground" />
                            </div>
                            <h3 className="font-medium">No archived insights found</h3>
                            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                                We couldn't find any insights matching your search query. Try different keywords or themes.
                            </p>
                            <button 
                                onClick={() => setSearchQuery("")}
                                className="text-brand text-sm font-medium hover:underline mt-4"
                            >
                                View all insights
                            </button>
                        </div>
                    )}

                </div>

            </div>

        </div>
    )
}
