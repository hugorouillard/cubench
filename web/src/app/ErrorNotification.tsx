import {
    faCircleExclamation,
    faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "./ErrorNotification.css";

type ErrorNotificationProps = {
    message: string;
    onDismiss: () => void;
};

export function ErrorNotification({
    message,
    onDismiss,
}: ErrorNotificationProps) {
    return (
        <aside className="notification" role="alert">
            <div className="notification-copy">
                <strong>
                    <FontAwesomeIcon
                        className="app-icon"
                        icon={faCircleExclamation}
                        aria-hidden="true"
                    />
                    Error
                </strong>
                <span>{message}</span>
            </div>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss error"
            >
                <FontAwesomeIcon
                    className="app-icon"
                    icon={faXmark}
                    fixedWidth
                    aria-hidden="true"
                />
            </button>
        </aside>
    );
}
