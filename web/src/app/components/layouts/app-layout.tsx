import type { ReactNode } from "react"
import { Footer } from "./footer"
import { Header } from "./header"
import "./app.css"

export function AppLayout({ children }: { children: ReactNode }) {
    return (
        <div className="app">
            <Header />
            {children}
            <Footer />
        </div>
    )
}
