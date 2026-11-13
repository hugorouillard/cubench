import { Outlet } from "react-router"
import { AppLayout } from "../components/layouts/app-layout"

const AppRoot = () => {
    return (
        <AppLayout>
            <Outlet />
        </AppLayout>
    )
}

export default AppRoot
