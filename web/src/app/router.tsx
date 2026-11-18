import { createBrowserRouter } from "react-router"
import { RouterProvider } from "react-router/dom"
import AccountRoute from "./routes/app/account"
import PracticeRoute from "./routes/app/practice"
import LoginRoute from "./routes/auth/login"
import AppRoot from "./routes/root"

const router = createBrowserRouter([
    {
        path: "/",
        element: <AppRoot />,
        children: [
            {
                index: true,
                element: <PracticeRoute />,
            },
            {
                path: "login",
                element: <LoginRoute />,
            },
            {
                path: "account",
                element: <AccountRoute />,
            },
        ],
    },
])

export const AppRouter = () => <RouterProvider router={router} />
