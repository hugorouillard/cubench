import type { QueryClient } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { createBrowserRouter } from "react-router"
import { RouterProvider } from "react-router/dom"
import AppRoot from "./routes/root"

const createAppRouter = (queryClient: QueryClient) =>
    createBrowserRouter([
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
                            loader: () => module.loader(queryClient),
                        })),
                },
            ],
        },
    ])

export const AppRouter = () => {
    const queryClient = useQueryClient()
    const router = useMemo(() => createAppRouter(queryClient), [queryClient])
    return <RouterProvider router={router} />
}
