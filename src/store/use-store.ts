import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

interface AppState {
  // Add state here
  count: number
  increment: () => void
  decrement: () => void
}

export const useStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        count: 0,
        increment: () => set((state) => ({ count: state.count + 1 })),
        decrement: () => set((state) => ({ count: state.count - 1 })),
      }),
      {
        name: 'app-storage',
      }
    )
  )
)
