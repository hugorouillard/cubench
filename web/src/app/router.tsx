import { createBrowserRouter, Link } from "react-router"
import { RouterProvider } from "react-router/dom"
import AppRoot from "./routes/root"

const router = createBrowserRouter([
    {
        path: "/",
        element: <AppRoot initialTheme="catppuccin-mocha" />,
    },
    {
        path: "/login",
        element: (
            <>
                <h1>temporary login page</h1>
                <Link to="/">Back</Link>
            </>
        ),
    },
])

export const AppRouter = () => <RouterProvider router={router} />
