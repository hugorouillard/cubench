import { useEffect } from "react"
import { useNavigate } from "react-router"
import { AuthPage } from "../../../auth/AuthPage"
import { useAuth } from "../../../auth/useAuth"

const LoginRoute = () => {
    const navigate = useNavigate()
    const { account, checking } = useAuth()

    useEffect(() => {
        if (!checking && account) {
            navigate("/profile", { replace: true })
        }
    }, [account, checking, navigate])

    return <AuthPage />
}

export default LoginRoute
