import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "free-brands-svg-icons-v5";
import {
    faCode,
    faCodeBranch,
    faEnvelope,
    faFileContract,
    faLock,
    faPalette,
    faShieldAlt,
} from "free-solid-svg-icons-v5";
import { isTheme, THEME_OPTIONS, type Theme } from "./theme";

declare const __CUBENCH_VERSION__: string;

type FooterProps = {
    theme: Theme;
    onThemeChange: (theme: Theme) => void;
};

export function Footer({ theme, onThemeChange }: FooterProps) {
    return (
        <footer className="site-footer site-footer--timer page-width focus-chrome">
            <nav className="footer-links" aria-label="Footer">
                <a
                    className="footer-link"
                    href="mailto:rouillard.hugo1@gmail.com"
                >
                    <FontAwesomeIcon
                        className="app-icon"
                        icon={faEnvelope as IconDefinition}
                        fixedWidth
                        aria-hidden="true"
                    />
                    <span>contact</span>
                </a>
                <a
                    className="footer-link"
                    href="https://github.com/hugorouillard/cubench"
                    target="_blank"
                    rel="noreferrer"
                >
                    <FontAwesomeIcon
                        className="app-icon"
                        icon={faCode as IconDefinition}
                        fixedWidth
                        aria-hidden="true"
                    />
                    <span>github</span>
                </a>
                <span
                    className="footer-link"
                    aria-disabled="true"
                    title="Coming soon"
                >
                    <FontAwesomeIcon
                        className="app-icon"
                        icon={faDiscord as IconDefinition}
                        fixedWidth
                        aria-hidden="true"
                    />
                    <span>discord</span>
                </span>
                <span
                    className="footer-link"
                    aria-disabled="true"
                    title="Coming soon"
                >
                    <FontAwesomeIcon
                        className="app-icon"
                        icon={faFileContract as IconDefinition}
                        fixedWidth
                        aria-hidden="true"
                    />
                    <span>terms</span>
                </span>
                <a
                    className="footer-link"
                    href="mailto:rouillard.hugo1@gmail.com?subject=Cubench%20security"
                >
                    <FontAwesomeIcon
                        className="app-icon"
                        icon={faShieldAlt as IconDefinition}
                        fixedWidth
                        aria-hidden="true"
                    />
                    <span>security</span>
                </a>
                <span
                    className="footer-link"
                    aria-disabled="true"
                    title="Coming soon"
                >
                    <FontAwesomeIcon
                        className="app-icon"
                        icon={faLock as IconDefinition}
                        fixedWidth
                        aria-hidden="true"
                    />
                    <span>privacy</span>
                </span>
            </nav>
            <div className="footer-controls">
                <label className="footer-theme" title="Theme">
                    <FontAwesomeIcon
                        className="app-icon"
                        icon={faPalette as IconDefinition}
                        fixedWidth
                        aria-hidden="true"
                    />
                    <span className="sr-only">Theme</span>
                    <select
                        value={theme}
                        onChange={(event) => {
                            const value = event.currentTarget.value;
                            if (isTheme(value)) {
                                onThemeChange(value);
                            }
                        }}
                    >
                        {THEME_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                <a
                    className="footer-version"
                    href="https://github.com/hugorouillard/cubench/commits/master"
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Cubench version ${__CUBENCH_VERSION__}`}
                >
                    <FontAwesomeIcon
                        className="app-icon"
                        icon={faCodeBranch as IconDefinition}
                        fixedWidth
                        aria-hidden="true"
                    />
                    <span>{__CUBENCH_VERSION__}</span>
                </a>
            </div>
        </footer>
    );
}
