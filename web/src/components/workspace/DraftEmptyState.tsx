import React from 'react'

export function DraftEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full space-y-4">
      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/10" />
      </div>
      <p className="text-white/40 text-[12px] font-medium">No available draft</p>
    </div>
  )
}
