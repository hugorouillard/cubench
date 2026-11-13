import { AuthProvider } from "../auth/AuthProvider"
import { AppRouter } from "./router"

export const App = () => {
    return (
        <AuthProvider>
            <AppRouter />
        </AuthProvider>
    )
}
