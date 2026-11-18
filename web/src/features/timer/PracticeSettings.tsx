import {
    faCube,
    faEyeSlash,
    faSliders,
    faStopwatch,
    faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef } from "react";
import "./PracticeSettings.css";

type PracticeSettingsProps = {
    open: boolean;
    disabled: boolean;
    hideTimer: boolean;
    inspectionEnabled: boolean;
    onOpenChange: (open: boolean) => void;
    onHideTimerChange: (hidden: boolean) => void;
    onInspectionChange: (enabled: boolean) => void;
};

export function PracticeSettings({
    open,
    disabled,
    hideTimer,
    inspectionEnabled,
    onOpenChange,
    onHideTimerChange,
    onInspectionChange,
}: PracticeSettingsProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        else if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <>
            <div className="practice-config-row focus-chrome">
                <div
                    className="practice-config practice-config--desktop"
                    role="group"
                    aria-label="Practice settings"
                >
                    <div
                        className="config-panel config-panel--toggles"
                        role="group"
                        aria-label="Solve modifiers"
                    >
                        <button
                            className={hideTimer ? "is-active" : ""}
                            type="button"
                            onClick={(event) => {
                                onHideTimerChange(!hideTimer);
                                event.currentTarget.blur();
                            }}
                            disabled={disabled}
                            aria-pressed={hideTimer}
                        >
                            <FontAwesomeIcon
                                className="app-icon"
                                icon={faEyeSlash}
                                fixedWidth
                                aria-hidden="true"
                            />
                            hide timer
                        </button>
                        <button
                            className={inspectionEnabled ? "is-active" : ""}
                            type="button"
                            onClick={(event) => {
                                onInspectionChange(!inspectionEnabled);
                                event.currentTarget.blur();
                            }}
                            disabled={disabled}
                            aria-pressed={inspectionEnabled}
                        >
                            inspection
                        </button>
                    </div>
                    <div
                        className="config-panel config-panel--modes"
                        role="group"
                        aria-label="Practice mode"
                    >
                        <span className="config-value is-active">
                            <FontAwesomeIcon
                                className="app-icon"
                                icon={faStopwatch}
                                fixedWidth
                                aria-hidden="true"
                            />
                            timer
                        </span>
                        <button
                            type="button"
                            disabled
                            title="Trainer mode is not available yet"
                        >
                            <FontAwesomeIcon
                                className="app-icon"
                                icon={faCube}
                                fixedWidth
                                aria-hidden="true"
                            />
                            trainer
                        </button>
                    </div>
                    <div
                        className="config-panel config-panel--values"
                        role="group"
                        aria-label="Timer settings"
                    >
                        <span className="config-value is-active">3x3</span>
                    </div>
                </div>
                <button
                    className="practice-config-mobile"
                    type="button"
                    onClick={() => onOpenChange(true)}
                    disabled={disabled}
                >
                    <FontAwesomeIcon
                        className="app-icon"
                        icon={faSliders}
                        fixedWidth
                        aria-hidden="true"
                    />
                    practice settings
                </button>
            </div>
            <dialog
                className="app-dialog"
                ref={dialogRef}
                aria-labelledby="practice-dialog-title"
                onClose={() => {
                    // Native dialogs restore focus to the opener; release it so Space times a solve.
                    requestAnimationFrame(() => {
                        if (
                            !document.querySelector("dialog[open]") &&
                            document.activeElement instanceof HTMLElement
                        ) {
                            document.activeElement.blur();
                        }
                    });
                }}
                onCancel={(event) => {
                    event.preventDefault();
                    onOpenChange(false);
                }}
                onMouseDown={(event) => {
                    if (event.target === event.currentTarget)
                        onOpenChange(false);
                }}
            >
                <div className="dialog-panel">
                    <div className="dialog-heading">
                        <div>
                            <span>timer</span>
                            <h2 id="practice-dialog-title">
                                Practice settings
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            aria-label="Close"
                        >
                            <FontAwesomeIcon
                                className="app-icon"
                                icon={faXmark}
                                fixedWidth
                                aria-hidden="true"
                            />
                        </button>
                    </div>
                    <div className="mobile-config-stack">
                        <div
                            className="mobile-config-group"
                            role="group"
                            aria-label="Solve modifiers"
                        >
                            <button
                                className={hideTimer ? "is-active" : ""}
                                type="button"
                                onClick={() => onHideTimerChange(!hideTimer)}
                                aria-pressed={hideTimer}
                            >
                                hide timer
                            </button>
                            <button
                                className={inspectionEnabled ? "is-active" : ""}
                                type="button"
                                onClick={() =>
                                    onInspectionChange(!inspectionEnabled)
                                }
                                aria-pressed={inspectionEnabled}
                            >
                                inspection
                            </button>
                        </div>
                        <span className="mobile-config-separator" />
                        <div
                            className="mobile-config-group"
                            role="group"
                            aria-label="Practice mode"
                        >
                            <span className="mobile-config-value is-active">
                                timer
                            </span>
                            <button
                                type="button"
                                disabled
                                title="Trainer mode is not available yet"
                            >
                                trainer
                            </button>
                        </div>
                        <span className="mobile-config-separator" />
                        <div
                            className="mobile-config-group mobile-config-group--values"
                            role="group"
                            aria-label="Timer settings"
                        >
                            <span className="mobile-config-value is-active">
                                3x3
                            </span>
                        </div>
                    </div>
                    <div className="dialog-actions">
                        <button
                            className="button-primary"
                            type="button"
                            onClick={() => onOpenChange(false)}
                        >
                            close
                        </button>
                    </div>
                </div>
            </dialog>
        </>
    );
}
