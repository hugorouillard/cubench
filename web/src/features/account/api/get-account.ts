import { queryOptions, useQuery } from "@tanstack/react-query"
import { ApiError } from "../../../lib/api-client"
import type { AccountDetails } from "../../../types"

export async function getAccount(
    signal?: AbortSignal,
): Promise<AccountDetails> {
    const response = await fetch("/api/account", { signal })

    if (!response.ok) {
        throw new ApiError("Could not load account details.", response.status)
    }

    return await response.json()
}

export const getAccountQueryOptions = () =>
    queryOptions({
        queryKey: ["account"],
        queryFn: ({ signal }) => getAccount(signal),
        staleTime: 30_000,
    })

export const useAccount = () => useQuery(getAccountQueryOptions())
