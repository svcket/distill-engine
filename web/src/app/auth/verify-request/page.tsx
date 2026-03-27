"use client"

import { motion } from "framer-motion"
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react"
import Link from "next/link"

export default function VerifyRequestPage() {
    return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md bg-[#0A0A0A] border border-white/5 rounded-2xl p-8 md:p-12 shadow-2xl relative z-10"
            >
                <div className="flex flex-col items-center text-center space-y-6">
                    {/* Icon Cluster */}
                    <div className="relative">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                            className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20"
                        >
                            <Mail className="w-10 h-10 text-emerald-400" />
                        </motion.div>
                        <motion.div 
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.5 }}
                            className="absolute -bottom-1 -right-1 bg-[#0A0A0A] p-1 rounded-full"
                        >
                            <CheckCircle2 className="w-6 h-6 text-emerald-500 fill-emerald-500/20" />
                        </motion.div>
                    </div>

                    <div className="space-y-2">
                        <h1 className="text-2xl font-semibold tracking-tight text-white">Check your inbox</h1>
                        <p className="text-muted-foreground text-sm max-w-[280px] mx-auto leading-relaxed">
                            We&apos;ve sent a magic link to your email address. It should arrive in a few seconds.
                        </p>
                    </div>

                    <div className="w-full pt-4 space-y-4">
                        <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl text-left space-y-2">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">Pro Tips for Beta</p>
                            <ul className="text-[13px] text-muted-foreground space-y-1.5 list-disc list-inside">
                                <li>Check your <span className="text-white">Spam</span> or <span className="text-white">Promotions</span> folder</li>
                                <li>The link expires in 24 hours</li>
                                <li>Open the link on this device to sign in instantly</li>
                            </ul>
                        </div>
                    </div>

                    <div className="pt-6">
                        <Link 
                            href="/login" 
                            className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-white transition-colors group"
                        >
                            <ArrowLeft className="w-3 h-3 mr-2 group-hover:-translate-x-1 transition-transform" />
                            Back to login
                        </Link>
                    </div>
                </div>
            </motion.div>

            {/* Footer Branding */}
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                transition={{ delay: 1 }}
                className="mt-12 flex flex-col items-center gap-2"
            >
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white">Distill Engine</span>
                <span className="text-[9px] text-muted-foreground">Precision Content Infrastructure</span>
            </motion.div>
        </div>
    )
}
