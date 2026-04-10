"use client"

import React, { Component, ErrorInfo, ReactNode } from "react"
import { AlertCircle, RefreshCcw, Home } from "lucide-react"
import { Button } from "@/components/ui/Button"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-zinc-950 border border-white/10 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-red-500/50" />
            
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-white font-serif">Application Error</h1>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  A client-side exception occurred. The Distill Engine was unable to render the requested view.
                </p>
              </div>

              {this.state.error && (
                <div className="w-full bg-black/50 border border-white/5 rounded-lg p-3 text-left">
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 font-bold">Error Message</p>
                  <p className="text-xs font-mono text-red-400/80 break-words leading-tight">
                    {this.state.error.message}
                  </p>
                </div>
              )}

              <div className="flex flex-col w-full gap-3 pt-4">
                <Button 
                  onClick={this.handleReset}
                  className="w-full bg-white text-black hover:bg-zinc-200 transition-all font-medium py-6 rounded-xl flex items-center justify-center gap-2"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Attempt Recovery
                </Button>
                
                <Button 
                  variant="ghost" 
                  onClick={() => window.location.href = "/"}
                  className="w-full text-zinc-400 hover:text-white hover:bg-white/5 py-4 rounded-xl flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Return Home
                </Button>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center">
              <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-[0.2em]">Distill Intelligence System</span>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
