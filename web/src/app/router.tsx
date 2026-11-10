import { createBrowserRouter } from "react-router"
import { RouterProvider } from "react-router/dom"
import AppRoot from "./routes/root"

const router = createBrowserRouter([
    {
        path: "/",
        element: <AppRoot initialTheme="catppuccin-mocha" />,
    },
    {
        path: "/login",
        element: <h1>temporary login page</h1>,
    },
])

export const AppRouter = () => <RouterProvider router={router} />
