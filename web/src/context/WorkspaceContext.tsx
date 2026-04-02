"use client"

import React, { createContext, useContext, ReactNode } from 'react'
import { useRouter } from 'next/navigation'

interface WorkspaceContextType {
  workspaceId: string
  refreshSources: () => void
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter()

  const refreshSources = () => {
    router.refresh()
  }

  return (
    <WorkspaceContext.Provider value={{ workspaceId: "default", refreshSources }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider')
  }
  return context
}
