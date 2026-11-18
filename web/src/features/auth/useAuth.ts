import { createContext, useContext } from "react"
import type {
    Account,
    AccountDetails,
    LoginInput,
    RegistrationInput,
} from "../../types"

export type AuthOperation = "login" | "register" | "logout"

export type AuthContextValue = {
    account: Account | null
    checking: boolean
    pending: AuthOperation | null
    sessionError: string
    dismissSessionError: () => void
    login: (input: LoginInput) => Promise<void>
    register: (input: RegistrationInput) => Promise<void>
    logout: () => Promise<void>
    applyAccount: (account: AccountDetails) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
    const auth = useContext(AuthContext)
    if (!auth) throw new Error("useAuth must be used within AuthProvider")
    return auth
}
