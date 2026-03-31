"use client"
import * as React from "react"
import { cn } from "@/lib/utils"

interface DropdownMenuContextType {
  open: boolean
  setOpen: (open: boolean) => void
}

const DropdownMenuContext = React.createContext<DropdownMenuContextType | undefined>(undefined)

function useDropdownMenu() {
  const context = React.useContext(DropdownMenuContext)
  if (!context) throw new Error("Dropdown components must be used within a DropdownMenu")
  return context
}

interface DropdownMenuProps {
  children: React.ReactNode
}

export function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div ref={containerRef} className="relative inline-block text-left w-full">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  )
}

interface DropdownMenuTriggerProps {
  children: React.ReactNode
}

export function DropdownMenuTrigger({ children }: DropdownMenuTriggerProps) {
  const { open, setOpen } = useDropdownMenu()
  return (
    <div 
      className="w-full cursor-pointer" 
      onClick={() => setOpen(!open)}
    >
      {children}
    </div>
  )
}

interface DropdownMenuContentProps {
  children: React.ReactNode
  className?: string
}

export function DropdownMenuContent({ children, className }: DropdownMenuContentProps) {
  const { open } = useDropdownMenu()
  if (!open) return null

  return (
    <div className={cn(
      "absolute right-0 z-[100] mt-2 w-56 origin-top-right rounded-xl !bg-zinc-900 !border !border-white/10 shadow-2xl ring-1 ring-black/5 focus:outline-none animate-in fade-in zoom-in-95 duration-100 p-1",
      className
    )}>
      {children}
    </div>
  )
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{children}</div>
}

export function DropdownMenuSeparator() {
  return <div className="h-px bg-border/60 my-1 mx-1" />
}

interface DropdownMenuRadioGroupProps {
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
}

const RadioContext = React.createContext<{ value?: string; onValueChange?: (value: string) => void }>({})

export function DropdownMenuRadioGroup({ value, onValueChange, children }: DropdownMenuRadioGroupProps) {
  const { setOpen } = useDropdownMenu()

  const handleValueChange = (val: string) => {
    onValueChange?.(val)
    setOpen(false) // Auto-close on selection
  }

  return (
    <RadioContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className="space-y-0.5">{children}</div>
    </RadioContext.Provider>
  )
}

interface DropdownMenuRadioItemProps {
  value: string
  children: React.ReactNode
}

export function DropdownMenuRadioItem({ value, children }: DropdownMenuRadioItemProps) {
  const { value: selectedValue, onValueChange } = React.useContext(RadioContext)
  const isSelected = value === selectedValue

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onValueChange?.(value)
      }}
      className={cn(
        "group flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-all text-left",
        isSelected ? "bg-emerald-500/15 text-emerald-500 font-bold" : "text-foreground/80 hover:bg-muted"
      )}
    >
      <span>{children}</span>
      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
    </button>
  )
}
