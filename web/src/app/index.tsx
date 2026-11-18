import { AuthProvider } from "../features/auth/AuthProvider"
import { AppRouter } from "./router"

export const App = () => {
    return (
        <AuthProvider>
            <AppRouter />
        </AuthProvider>
    )
}
