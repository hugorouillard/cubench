import { useEffect } from "react"
import { useNavigate } from "react-router"
import { AuthPage } from "../../../features/auth/AuthPage"
import { useAuth } from "../../../features/auth/useAuth"

export const LoginRoute = () => {
    const navigate = useNavigate()
    const { account, checking } = useAuth()

    useEffect(() => {
        if (!checking && account) {
            navigate("/account", { replace: true })
        }
    }, [account, checking, navigate])

    return <AuthPage />
}
