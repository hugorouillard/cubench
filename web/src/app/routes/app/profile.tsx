import { useEffect } from "react"
import { useNavigate } from "react-router"
import { useAuth } from "../../../auth/useAuth"

const ProfileRoute = () => {
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

export default ProfileRoute
