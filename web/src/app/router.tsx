import { createBrowserRouter } from "react-router"
import { RouterProvider } from "react-router/dom"
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
        ],
    },
])

export const AppRouter = () => <RouterProvider router={router} />
