import { useAccount } from "./api/get-account"

export function AccountDetails() {
    const accountQuery = useAccount()

    if (accountQuery.isPending) return <p role="status">loading account...</p>
    if (accountQuery.isError) {
        return <p role="alert">{accountQuery.error.message}</p>
    }

    const account = accountQuery.data
    return (
        <main className="page-width">
            <h1>{account.display_name}</h1>
            <p>{account.bio || "No bio yet."}</p>
        </main>
    )
}
