import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { AuthProvider } from "../features/auth/AuthProvider"

type AppProviderProps = {
    children: React.ReactNode
}

export const AppProvider = ({ children }: AppProviderProps) => {
    const [queryClient] = useState(() => new QueryClient())
    return (
        <QueryClientProvider client={queryClient}>
            <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
    )
}
