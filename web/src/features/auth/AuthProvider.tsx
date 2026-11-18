import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react"
import * as api from "../../api"
import type { Account, AccountDetails } from "../../types"
import {
    AuthContext,
    type AuthContextValue,
    type AuthOperation,
} from "./useAuth"

export function AuthProvider({ children }: { children: ReactNode }) {
    const [account, setAccount] = useState<Account | null>(null)
    const [checking, setChecking] = useState(true)
    const [pending, setPending] = useState<AuthOperation | null>(null)
    const [sessionError, setSessionError] = useState("")
    // Prevent overlapping commands even before React renders the pending state.
    const operationInFlight = useRef(false)

    useEffect(() => {
        let cancelled = false
        void api
            .getAuthSession()
            .then((restoredAccount) => {
                if (!cancelled) setAccount(restoredAccount)
            })
            .catch((error: unknown) => {
                if (
                    !cancelled &&
                    !(error instanceof api.ApiError && error.status === 401)
                ) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : "Something went wrong"
                    setSessionError(
                        `Could not restore account; continuing as guest: ${message}`,
                    )
                }
            })
            .finally(() => {
                if (!cancelled) setChecking(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const run = useCallback(
        async (
            operation: AuthOperation,
            request: () => Promise<Account | null>,
        ): Promise<void> => {
            if (checking || operationInFlight.current) {
                throw new Error(
                    "An authentication operation is already in progress",
                )
            }
            operationInFlight.current = true
            setPending(operation)
            try {
                const nextAccount = await request()
                setAccount(nextAccount)
                setSessionError("")
            } finally {
                operationInFlight.current = false
                setPending(null)
            }
        },
        [checking],
    )

    const applyAccount = useCallback((updated: AccountDetails) => {
        setAccount((current) =>
            current?.id === updated.id ? { ...current, ...updated } : current,
        )
    }, [])

    const value = useMemo<AuthContextValue>(
        () => ({
            account,
            checking,
            pending,
            sessionError,
            dismissSessionError: () => setSessionError(""),
            login: (input) => run("login", () => api.login(input)),
            register: (input) => run("register", () => api.register(input)),
            logout: () =>
                run("logout", async () => {
                    await api.logout()
                    return null
                }),
            applyAccount,
        }),
        [account, checking, pending, sessionError, run, applyAccount],
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
