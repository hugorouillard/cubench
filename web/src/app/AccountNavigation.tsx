import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
    faArrowRightFromBracket,
    faChartLine,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser as faUserRegular } from "free-regular-svg-icons-v5";
import { faUser } from "free-solid-svg-icons-v5";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/useAuth";
import type { AppView } from "./useAppNavigation";
import "./AccountNavigation.css";

type AccountNavigationProps = {
    currentPage: AppView;
    onNavigate: (page: "profile" | "login") => void;
    beforeLogout: () => boolean;
    onError: (message: string) => void;
};

export function AccountNavigation({
    currentPage,
    onNavigate,
    beforeLogout,
    onError,
}: AccountNavigationProps) {
    const { account, checking, pending, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dismissedRef = useRef(false);
    const disabled = checking || pending !== null;
    const dismissMenu = useCallback(() => {
        dismissedRef.current = true;
        setOpen(false);
    }, []);

    useEffect(() => {
        if (!open) return;

        function handlePointerDown(event: PointerEvent) {
            if (
                event.target instanceof Node &&
                !menuRef.current?.contains(event.target)
            ) {
                dismissMenu();
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                dismissMenu();
                buttonRef.current?.focus();
            }
        }

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, dismissMenu]);

    function openProfile() {
        dismissMenu();
        onNavigate("profile");
    }

    async function signOut() {
        dismissMenu();
        if (!beforeLogout()) return;
        try {
            await logout();
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Something went wrong";
            onError(`Could not sign out: ${message}`);
        }
    }

    return (
        <nav
            className="account-nav"
            aria-label="Account"
            ref={menuRef}
            onPointerEnter={(event) => {
                if (
                    account &&
                    event.pointerType === "mouse" &&
                    !dismissedRef.current &&
                    !disabled
                ) {
                    setOpen(true);
                }
            }}
            onPointerLeave={(event) => {
                if (event.pointerType !== "mouse") return;
                dismissedRef.current = false;
                if (
                    !(
                        document.activeElement instanceof HTMLElement &&
                        event.currentTarget.contains(document.activeElement) &&
                        document.activeElement.matches(":focus-visible")
                    )
                ) {
                    setOpen(false);
                }
            }}
            onFocusCapture={() => {
                if (account && !dismissedRef.current && !disabled)
                    setOpen(true);
            }}
            onBlur={(event) => {
                if (
                    !(
                        event.relatedTarget instanceof Node &&
                        event.currentTarget.contains(event.relatedTarget)
                    )
                ) {
                    dismissedRef.current = false;
                    setOpen(false);
                }
            }}
        >
            {account ? (
                <>
                    <button
                        ref={buttonRef}
                        className={`account-identity${currentPage === "profile" || open ? " is-active" : ""}`}
                        type="button"
                        onPointerDown={(event) => {
                            if (event.pointerType === "touch")
                                dismissedRef.current = true;
                        }}
                        onClick={() => {
                            if (
                                window.matchMedia?.("(pointer: coarse)").matches
                            ) {
                                dismissedRef.current = open;
                                setOpen(!open);
                            } else {
                                openProfile();
                            }
                        }}
                        disabled={disabled}
                        aria-label={`Account menu for ${account.display_name}`}
                        aria-expanded={open}
                        aria-controls={open ? "account-menu" : undefined}
                        title="Account"
                    >
                        <FontAwesomeIcon
                            className="app-icon account-icon--signed-in"
                            icon={faUser as IconDefinition}
                            fixedWidth
                            aria-hidden="true"
                        />
                        <span className="account-name">
                            {account.display_name}
                        </span>
                    </button>
                    {open && (
                        <div
                            className="account-menu"
                            id="account-menu"
                            role="group"
                            aria-label="Account actions"
                        >
                            <div className="account-menu-content">
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={openProfile}
                                    aria-current={
                                        currentPage === "profile"
                                            ? "page"
                                            : undefined
                                    }
                                >
                                    <FontAwesomeIcon
                                        className="app-icon"
                                        icon={faChartLine}
                                        fixedWidth
                                        aria-hidden="true"
                                    />
                                    profile
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void signOut()}
                                    disabled={disabled}
                                >
                                    <FontAwesomeIcon
                                        className="app-icon"
                                        icon={faArrowRightFromBracket}
                                        fixedWidth
                                        aria-hidden="true"
                                    />
                                    sign out
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <button
                    type="button"
                    onClick={() => onNavigate("login")}
                    disabled={disabled}
                    aria-label="Sign in"
                    aria-current={currentPage === "login" ? "page" : undefined}
                    title="Sign in"
                >
                    <FontAwesomeIcon
                        className="app-icon"
                        icon={faUserRegular as IconDefinition}
                        fixedWidth
                        aria-hidden="true"
                    />
                </button>
            )}
        </nav>
    );
}
