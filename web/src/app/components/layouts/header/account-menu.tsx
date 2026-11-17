import type { IconDefinition } from "@fortawesome/fontawesome-svg-core"
import { faArrowRightFromBracket } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faUser } from "free-solid-svg-icons-v5"
import { useCallback, useEffect, useRef, useState } from "react"
import "./account-menu.css"
import { useNavigate } from "react-router"
import { useAuth } from "../../../../auth/useAuth"
import type { Account } from "../../../../types"

type AccountMenuProps = {
    account: Account
}

export const AccountMenu = ({ account }: AccountMenuProps) => {
    const navigate = useNavigate()
    const { logout } = useAuth()
    const [open, setOpen] = useState(false)
    const menuRef = useRef<HTMLElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const dismissedRef = useRef(false)
    const dismissMenu = useCallback(() => {
        dismissedRef.current = true
        setOpen(false)
    }, [])

    useEffect(() => {
        if (!open) return

        function handlePointerDown(event: PointerEvent) {
            if (
                event.target instanceof Node &&
                !menuRef.current?.contains(event.target)
            ) {
                dismissMenu()
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                dismissMenu()
                buttonRef.current?.focus()
            }
        }

        document.addEventListener("pointerdown", handlePointerDown)
        document.addEventListener("keydown", handleKeyDown)
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown)
            document.removeEventListener("keydown", handleKeyDown)
        }
    }, [open, dismissMenu])

    function openProfile() {
        dismissMenu()
        navigate("/profile")
    }

    async function signOut() {
        dismissMenu()
        await logout()
    }

    return (
        <nav
            className="account-nav"
            aria-label="Account"
            ref={menuRef}
            onPointerEnter={(event) => {
                if (event.pointerType === "mouse" && !dismissedRef.current) {
                    setOpen(true)
                }
            }}
            onPointerLeave={(event) => {
                if (event.pointerType !== "mouse") return
                dismissedRef.current = false
                if (
                    !(
                        document.activeElement instanceof HTMLElement &&
                        event.currentTarget.contains(document.activeElement) &&
                        document.activeElement.matches(":focus-visible")
                    )
                ) {
                    setOpen(false)
                }
            }}
            onFocusCapture={() => {
                if (!dismissedRef.current) setOpen(true)
            }}
            onBlur={(event) => {
                if (
                    !(
                        event.relatedTarget instanceof Node &&
                        event.currentTarget.contains(event.relatedTarget)
                    )
                ) {
                    dismissedRef.current = false
                    setOpen(false)
                }
            }}
        >
            <button
                className="account-identity"
                ref={buttonRef}
                type="button"
                onPointerDown={(event) => {
                    if (event.pointerType === "touch")
                        dismissedRef.current = true
                }}
                onClick={() => {
                    if (window.matchMedia?.("(pointer: coarse)").matches) {
                        dismissedRef.current = open
                        setOpen(!open)
                    } else {
                        openProfile()
                    }
                }}
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
                <span className="account-name">{account.display_name}</span>
            </button>
            {open && (
                <div
                    className="account-menu"
                    id="account-menu"
                    role="group"
                    aria-label="Account actions"
                >
                    <div className="account-menu-content">
                        <button type="button" onClick={() => void signOut()}>
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
        </nav>
    )
}
