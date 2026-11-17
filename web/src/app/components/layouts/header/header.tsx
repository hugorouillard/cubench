import type { IconDefinition } from "@fortawesome/fontawesome-svg-core"
import { faStopwatch } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faCog, faInfo } from "free-solid-svg-icons-v5"
import { Link, NavLink } from "react-router"
import "./header.css"
import { useAuth } from "../../../../auth/useAuth"
import { AccountMenu } from "./account-menu"

export const Header = () => {
    const { account } = useAuth()
    return (
        <header className="site-header site-header--timer page-width focus-chrome">
            <div className="site-header-main">
                <Link className="brand" to="/" aria-label="Cubench home">
                    <span className="brand-mark" aria-hidden="true">
                        <svg
                            viewBox="0 0 48 48"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <use href="/favicon.svg#cubench-mark" />
                        </svg>
                    </span>
                    <span className="brand-copy">
                        <strong>cubench</strong>
                    </span>
                </Link>
                <nav className="main-nav" aria-label="Main views">
                    <NavLink
                        to="/"
                        aria-label="Timer"
                        className={({ isActive }) => (isActive ? "active" : "")}
                    >
                        <FontAwesomeIcon
                            className="app-icon"
                            icon={faStopwatch}
                            fixedWidth
                            aria-hidden="true"
                        />
                    </NavLink>
                    <button
                        type="button"
                        aria-label="About"
                        aria-disabled="true"
                        title="About (coming soon)"
                        data-nav-item="about"
                    >
                        <FontAwesomeIcon
                            className="app-icon"
                            icon={faInfo as IconDefinition}
                            fixedWidth
                            aria-hidden="true"
                        />
                    </button>
                    <button
                        type="button"
                        aria-label="Options"
                        aria-disabled="true"
                        title="Options (coming soon)"
                        data-nav-item="options"
                    >
                        <FontAwesomeIcon
                            className="app-icon"
                            icon={faCog as IconDefinition}
                            fixedWidth
                            aria-hidden="true"
                        />
                    </button>
                    {account ? (
                        <AccountMenu account={account}></AccountMenu>
                    ) : (
                        <NavLink to="/login">Sign In</NavLink>
                    )}
                </nav>
            </div>
        </header>
    )
}
