import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faPen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserCircle as legacyUserCircle } from "free-solid-svg-icons-v5";
import { useEffect, useRef } from "react";
import type { ActivitySummary } from "../solves/activity";
import type { LifetimeSolveSummary } from "../solves/stats";
import type { UserProfile } from "../types";
import { formatAccountDate, formatSolvingTime } from "./format";

type AccountSummaryProps = {
    profile: UserProfile;
    lifetime: LifetimeSolveSummary & ActivitySummary;
    onEdit?: () => void;
};

const userCircle = legacyUserCircle as unknown as IconDefinition;

function FittedName({ name }: { name: string }) {
    const nameRef = useRef<HTMLHeadingElement>(null);

    // biome-ignore lint/correctness/useExhaustiveDependencies: Refit when the rendered name changes, even if the container size is unchanged.
    useEffect(() => {
        const heading = nameRef.current;
        const container = heading?.parentElement;
        if (!heading || !container || typeof ResizeObserver === "undefined")
            return;

        const fitName = () => {
            if (!container.clientWidth) return;
            heading.style.fontSize = "10px";
            const measuredWidth = heading.getBoundingClientRect().width;
            if (!measuredWidth) {
                heading.style.fontSize = "";
                return;
            }
            const maximum =
                2 *
                parseFloat(getComputedStyle(document.documentElement).fontSize);
            heading.style.fontSize = `${Math.min(maximum, Math.max(10, (container.clientWidth / measuredWidth) * 10))}px`;
        };

        const observer = new ResizeObserver(fitName);
        observer.observe(container);
        fitName();
        void document.fonts.ready.then(fitName);
        return () => observer.disconnect();
    }, [name]);

    return (
        <h1 id="account-name" ref={nameRef}>
            {name}
        </h1>
    );
}

export function AccountSummary({
    profile,
    lifetime,
    onEdit,
}: AccountSummaryProps) {
    return (
        <section
            className={`account-summary${profile.bio ? " has-bio" : ""}`}
            aria-labelledby="account-name"
        >
            <div className="account-summary-body">
                <div className="account-summary-identity">
                    <FontAwesomeIcon
                        className="account-summary-avatar"
                        icon={userCircle}
                        aria-hidden="true"
                    />
                    <div className="account-summary-identity-text">
                        <FittedName name={profile.display_name} />
                        <div className="account-joined">
                            Joined{" "}
                            <time dateTime={profile.created_at}>
                                {formatAccountDate(profile.created_at)}
                            </time>
                        </div>
                        {lifetime.currentStreak > 0 && (
                            <div className="account-streak">
                                Current streak {lifetime.currentStreak}{" "}
                                {lifetime.currentStreak === 1 ? "day" : "days"}
                            </div>
                        )}
                    </div>
                    <div
                        className="account-level"
                        role="group"
                        aria-label="Level unavailable"
                    >
                        <span>—</span>
                        <span
                            className="account-level-track"
                            aria-hidden="true"
                        />
                        <span className="account-level-next">—/—</span>
                    </div>
                </div>
                <span className="account-divider" aria-hidden="true" />
                {profile.bio && (
                    <>
                        <div className="account-bio">
                            <span>bio</span>
                            <p>{profile.bio}</p>
                        </div>
                        <span
                            className="account-divider account-bio-divider"
                            aria-hidden="true"
                        />
                    </>
                )}
                <div
                    className="account-totals"
                    aria-label="Lifetime totals"
                    role="group"
                >
                    <div>
                        <span>total solves</span>
                        <strong>{lifetime.loggedCount.toLocaleString()}</strong>
                    </div>
                    <div>
                        <span>time solving</span>
                        <strong>
                            {formatSolvingTime(lifetime.totalRawDurationMs)}
                        </strong>
                    </div>
                    <div>
                        <span>active days</span>
                        <strong>
                            {lifetime.totalActiveDays.toLocaleString()}
                        </strong>
                    </div>
                </div>
            </div>
            {onEdit && (
                <button
                    className="account-edit"
                    type="button"
                    onClick={onEdit}
                    aria-label="Edit profile"
                    title="Edit profile"
                >
                    <FontAwesomeIcon icon={faPen} aria-hidden="true" />
                </button>
            )}
        </section>
    );
}
