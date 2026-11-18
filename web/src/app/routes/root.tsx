import { useState } from "react"
import { Outlet } from "react-router"
import { AppLayout } from "../../components/layouts/app-layout"
import { createSolveRepository } from "../../solves/solveRepository"
import { guestSolveStore } from "../../solves/solveStore"

const AppRoot = () => {
    const [repository] = useState(() =>
        createSolveRepository(guestSolveStore, async () => []),
    )
    return (
        <AppLayout>
            <Outlet context={repository} />
        </AppLayout>
    )
}

export default AppRoot
