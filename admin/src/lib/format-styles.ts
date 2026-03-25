import { FileText, Podcast, Mail, Share2, Video, Cpu, Layout, Target } from "lucide-react"

export const getFormatStyles = (format: string) => {
  const f = format.toLowerCase().replace(/_/g, " ")
  if (f.includes("podcast")) {
    return {
      bg: "bg-blue-50/80",
      text: "text-blue-600",
      border: "border-blue-200/50",
      icon: Podcast
    }
  }
  if (f.includes("blog") || f.includes("article")) {
    return {
      bg: "bg-indigo-50/80",
      text: "text-indigo-600",
      border: "border-indigo-200/50",
      icon: FileText
    }
  }
  if (f.includes("email") || f.includes("newsletter")) {
    return {
      bg: "bg-amber-50/80",
      text: "text-amber-600",
      border: "border-amber-200/50",
      icon: Mail
    }
  }
  if (f.includes("social") || f.includes("twitter") || f.includes("linkedin")) {
    return {
      bg: "bg-emerald-50/80",
      text: "text-emerald-600",
      border: "border-emerald-200/50",
      icon: Share2
    }
  }
  if (f.includes("script") || f.includes("video")) {
    return {
      bg: "bg-purple-50/80",
      text: "text-purple-600",
      border: "border-purple-200/50",
      icon: Video
    }
  }
  if (f.includes("technical") || f.includes("breakdown")) {
    return {
      bg: "bg-cyan-50/80",
      text: "text-cyan-600",
      border: "border-cyan-200/50",
      icon: Cpu
    }
  }
  if (f.includes("essay") || f.includes("long-form")) {
    return {
      bg: "bg-rose-50/80",
      text: "text-rose-600",
      border: "border-rose-200/50",
      icon: Layout
    }
  }
  if (f.includes("explainer") || f.includes("guide")) {
    return {
      bg: "bg-teal-50/80",
      text: "text-teal-600",
      border: "border-teal-200/50",
      icon: Target
    }
  }
  if (f.includes("rss") || f.includes("archive") || f.includes("feed")) {
    return {
      bg: "bg-orange-50/80",
      text: "text-orange-600",
      border: "border-orange-200/50",
      icon: Layout
    }
  }
  if (f.includes("thought") || f.includes("leadership")) {
    return {
      bg: "bg-fuchsia-50/80",
      text: "text-fuchsia-600",
      border: "border-fuchsia-200/50",
      icon: FileText
    }
  }
  return {
    bg: "bg-slate-50/80",
    text: "text-slate-600",
    border: "border-slate-200/50",
    icon: FileText
  }
}
