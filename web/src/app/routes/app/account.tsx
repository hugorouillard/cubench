import type { QueryClient } from "@tanstack/react-query"
import { Navigate, redirect } from "react-router"
import { AccountDetails } from "../../../features/account/account-details"
import { getAccountQueryOptions } from "../../../features/account/api/get-account"
import { useAuth } from "../../../features/auth/useAuth"
import { ApiError } from "../../../lib/api-client"

export async function loader(queryClient: QueryClient) {
    try {
        // check the server on each route entry, even if account data is cached.
        await queryClient.query({
            ...getAccountQueryOptions(),
            staleTime: 0,
        })
        return null
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
            queryClient.removeQueries({ queryKey: ["account"] })
            return redirect("/login")
        }
        throw error
    }
}

export function AccountRoute() {
    const { account, checking } = useAuth()

    if (checking) return <p role="status">checking account...</p>
    // Also handle signing out while this route is already open.
    if (!account) return <Navigate to="/login" replace />
    return <AccountDetails />
}
