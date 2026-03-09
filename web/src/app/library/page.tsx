import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"
import { Search, Library as LibraryIcon, Hash, Tag } from "lucide-react"

export default function LibraryPage() {

    return (
        <div className="p-8 max-w-[1200px] mx-auto space-y-8 animate-in fade-in duration-500">

            <div className="flex flex-col gap-6 items-center text-center max-w-2xl mx-auto py-12">
                <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-2">
                    <LibraryIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <h1 className="text-4xl font-serif font-semibold tracking-tight">Knowledge Library</h1>
                <p className="text-muted-foreground text-lg">
                    A searchable archive of deeply understood concepts, frameworks, and insights extracted from all processed sources.
                </p>

                <div className="relative w-full max-w-xl mt-4">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                        placeholder="Search concepts, frameworks, or quotes..."
                        className="pl-12 h-14 text-base rounded-full shadow-sm bg-background/50 backdrop-blur"
                    />
                </div>
            </div>

            <div className="grid md:grid-cols-4 gap-8">

                <div className="space-y-6">
                    <div className="space-y-3">
                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <Hash className="w-4 h-4" /> Core Themes
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="bg-white">AI Agents</Badge>
                            <Badge variant="outline" className="bg-white">System Design</Badge>
                            <Badge variant="outline" className="bg-white">Content Strategy</Badge>
                            <Badge variant="outline" className="bg-white">Mental Models</Badge>
                            <Badge variant="outline" className="bg-white">Bootstrapping</Badge>
                        </div>
                    </div>

                    <div className="space-y-3 pt-6 border-t border-border">
                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <Tag className="w-4 h-4" /> Popular Entities
                        </h3>
                        <div className="space-y-2">
                            {["Linus Lee", "Shawn Wang", "Cursor", "Next.js", "GPT-4"].map(tag => (
                                <div key={tag} className="text-sm text-foreground hover:text-brand cursor-pointer">
                                    {tag}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="md:col-span-3 space-y-4">
                    <h2 className="text-xl font-serif font-medium mb-6">Recently Archived Insights</h2>

                    <Card className="hover:border-brand/50 transition-colors">
                        <CardHeader className="pb-3">
                            <Badge className="w-fit mb-3" variant="secondary">Framework</Badge>
                            <CardTitle className="text-lg">The "Fuzzy Core, Rigid Shell" Architecture</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                                When building AI applications, relying on LLMs for control flow is a mistake because they are inherently non-deterministic. The correct approach is to use the LLM solely as a reasoning engine (the fuzzy core) and wrap it in extremely rigid, type-safe, classic software engineering layers (the rigid shell).
                            </p>
                            <div className="text-xs text-muted-foreground flex gap-4">
                                <span>Source: Building Real Agents</span>
                                <span>•</span>
                                <span>Archived: Oct 24, 2024</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="hover:border-brand/50 transition-colors">
                        <CardHeader className="pb-3">
                            <Badge className="w-fit mb-3" variant="secondary">Concept</Badge>
                            <CardTitle className="text-lg">State-Machine Persistence</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                                Agents should run on state machines that can be paused, inspected, and serialized at any node transition. This prevents cascading failure loops and allows humans-in-the-loop to correct bad inferences mid-flight rather than starting over.
                            </p>
                            <div className="text-xs text-muted-foreground flex gap-4">
                                <span>Source: Building Real Agents</span>
                                <span>•</span>
                                <span>Archived: Oct 24, 2024</span>
                            </div>
                        </CardContent>
                    </Card>

                </div>

            </div>

        </div>
    )
}
