import { useNavigate } from "react-router"
import { AuthPage } from "../../../features/auth/AuthPage"

export const LoginRoute = () => {
    const navigate = useNavigate()

    // Navigate after a successful sign-in, not merely because auth context has
    // an account: it may be stale when the account loader redirects on a 401.
    return (
        <AuthPage onSuccess={() => navigate("/account", { replace: true })} />
    )
}
