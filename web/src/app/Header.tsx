import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faCube, faStopwatch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCog, faInfo } from "free-solid-svg-icons-v5";
import type { ReactNode } from "react";
import "./Header.css";

type HeaderProps = {
    timerActive: boolean;
    disabled: boolean;
    onTimer: () => void;
    children: ReactNode;
};

export function Header({
    timerActive,
    disabled,
    onTimer,
    children,
}: HeaderProps) {
    return (
        <header className="site-header site-header--timer page-width focus-chrome">
            <div className="site-header-main">
                <a
                    className="brand"
                    href="/"
                    onClick={(event) => {
                        event.preventDefault();
                        if (!disabled) onTimer();
                    }}
                    aria-label="Cubench home"
                    tabIndex={disabled ? -1 : 0}
                >
                    <span className="brand-mark" aria-hidden="true">
                        <FontAwesomeIcon className="app-icon" icon={faCube} />
                    </span>
                    <span className="brand-copy">
                        <strong>cubench</strong>
                    </span>
                </a>
                <nav className="main-nav" aria-label="Main views">
                    <button
                        className={timerActive ? "is-active" : ""}
                        type="button"
                        onClick={onTimer}
                        disabled={disabled}
                        aria-label="Timer"
                        aria-current={timerActive ? "page" : undefined}
                        title="Timer"
                    >
                        <FontAwesomeIcon
                            className="app-icon"
                            icon={faStopwatch}
                            fixedWidth
                            aria-hidden="true"
                        />
                    </button>
                    <button
                        type="button"
                        disabled={disabled}
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
                        disabled={disabled}
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
                </nav>
                {children}
            </div>
        </header>
    );
}
