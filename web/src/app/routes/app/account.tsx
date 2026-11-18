import { useEffect } from "react"
import { useNavigate } from "react-router"
import { useAuth } from "../../../features/auth/useAuth"

const AccountRoute = () => {
    const { account, checking } = useAuth()
    const navigate = useNavigate()

    useEffect(() => {
        if (!checking && !account) {
            navigate("/login", { replace: true })
        }
    }, [account, checking, navigate])

    if (checking) return <p>loading...</p>
    if (!account) return null
    return <h1>{account.display_name}</h1>
}

export default AccountRoute
