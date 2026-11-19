import { createBrowserRouter } from "react-router"
import { RouterProvider } from "react-router/dom"
import AppRoot from "./routes/root"

const router = createBrowserRouter([
    {
        path: "/",
        element: <AppRoot />,
        children: [
            {
                index: true,
                lazy: () =>
                    import("./routes/app/practice").then((module) => ({
                        Component: module.PracticeRoute,
                    })),
            },
            {
                path: "login",
                lazy: () =>
                    import("./routes/auth/login").then((module) => ({
                        Component: module.LoginRoute,
                    })),
            },
            {
                path: "account",
                lazy: () =>
                    import("./routes/app/account").then((module) => ({
                        Component: module.AccountRoute,
                    })),
            },
        ],
    },
])

export const AppRouter = () => <RouterProvider router={router} />
