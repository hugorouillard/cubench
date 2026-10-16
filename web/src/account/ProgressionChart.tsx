import { faChartLine, faCrown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ChartData, ChartOptions } from "chart.js";
import { useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
	formatTimeAxisTick,
	getChartColors,
	getLineChartOptions,
	getTooltipOptions,
} from "../Charts";
import { chronologicalSolves, completedDuration } from "../solves/stats";
import { formatTime } from "../timer/timer";
import type { Solve } from "../types";
import { formatAccountDate } from "./format";

const AVERAGE_SERIES = [
	{ key: "ao5", label: "Avg of 5", size: 5 },
	{ key: "ao12", label: "Avg of 12", size: 12 },
	{ key: "ao50", label: "Avg of 50", size: 50 },
] as const;
type Series = "pb" | (typeof AVERAGE_SERIES)[number]["key"];
const SERIES: { key: Series; label: string }[] = [
	{ key: "pb", label: "PB" },
	...AVERAGE_SERIES,
];

function blendHex(
	background: string,
	foreground: string,
	amount: number,
): string {
	const channels = [1, 3, 5].map((offset) => {
		const start = parseInt(background.slice(offset, offset + 2), 16);
		const end = parseInt(foreground.slice(offset, offset + 2), 16);
		return Math.round(start * (1 - amount) + end * amount)
			.toString(16)
			.padStart(2, "0");
	});
	return `#${channels.join("")}`;
}

export function AccountProgression({
	solves,
	theme,
}: {
	solves: Solve[];
	theme: string;
}) {
	const [visible, setVisible] = useState<Record<Series, boolean>>({
		pb: true,
		ao5: true,
		ao12: true,
		ao50: true,
	});
	// Transform attempts into dots once; every series below is a view of these dots.
	const plotted = useMemo(
		() =>
			chronologicalSolves(solves).flatMap((solve, index) => {
				const singleMs = completedDuration(solve);
				return singleMs === null
					? []
					: [
							{
								singleMs,
								recordedAt: solve.recorded_at,
								solveNumber: index + 1,
							},
						];
			}),
		[solves],
	);
	const singles = plotted.map(({ singleMs }) => singleMs);
	const rollingMean = (size: number) =>
		singles.map((_, index) =>
			index < size - 1
				? null
				: Math.round(
						singles
							.slice(index - size + 1, index + 1)
							.reduce((sum, time) => sum + time, 0) / size,
					),
		);
	let best = Infinity;
	const personalBests = singles.map((time) => {
		best = Math.min(best, time);
		return best;
	});
	const firstPb = personalBests[0];
	const currentPb = personalBests.at(-1);
	const timeSolving = solves.reduce((sum, solve) => sum + solve.duration_ms, 0);
	const improvementPerHour =
		firstPb != null && currentPb != null && timeSolving > 0
			? (firstPb - currentPb) / 1000 / (timeSolving / 3_600_000)
			: null;
	// biome-ignore lint/correctness/useExhaustiveDependencies: Theme changes invalidate colors read from CSS custom properties.
	const colors = useMemo(getChartColors, [theme]);
	const baseOptions = getLineChartOptions();
	const visibleAverages = AVERAGE_SERIES.filter(({ key }) => visible[key]);
	const averageColors = Object.fromEntries(
		visibleAverages.map(({ key }, index) => [
			key,
			blendHex(
				colors.background,
				colors.main,
				[0.45, 0.7, 1][index + 3 - visibleAverages.length],
			),
		]),
	) as Record<(typeof AVERAGE_SERIES)[number]["key"], string>;
	const singleColor = blendHex(
		colors.background,
		colors.main,
		[1, 0.55, 0.4, 0.25][visibleAverages.length],
	);

	const data: ChartData<"line", (number | null)[], string> = {
		labels: plotted.map(({ solveNumber }) => `#${solveNumber}`),
		datasets: [
			{
				label: "solve",
				data: singles,
				borderColor: singleColor,
				pointBackgroundColor: singleColor,
				borderWidth: 0,
				showLine: false,
				pointRadius: 3,
				pointHoverRadius: 5,
				pointHitRadius: 7,
				order: 1,
			},
			{
				label: "PB",
				data: personalBests,
				borderColor: blendHex(colors.background, colors.text, 0.2),
				borderWidth: 3,
				fill: false,
				stepped: "before",
				pointRadius: 0,
				pointHoverRadius: 0,
				spanGaps: true,
				hidden: !visible.pb,
				order: 3,
			},
			...AVERAGE_SERIES.map(({ key, label, size }) => ({
				label,
				data: rollingMean(size),
				borderColor: averageColors[key] ?? colors.main,
				borderWidth: 3,
				fill: false,
				tension: 0.5,
				pointRadius: 0,
				pointHoverRadius: 0,
				spanGaps: true,
				hidden: !visible[key],
				order: 2,
			})),
		],
	};
	const options: ChartOptions<"line"> = {
		...baseOptions,
		interaction: { mode: "nearest", intersect: false },
		plugins: {
			...baseOptions.plugins,
			tooltip: {
				...getTooltipOptions(colors),
				borderColor: colors.surface,
				filter: (item) => item.datasetIndex === 0,
				callbacks: {
					title: () => "",
					label: (context) => {
						const result = plotted[context.dataIndex];
						if (!result) return "";
						const date = new Date(result.recordedAt);
						return [
							`solve #${result.solveNumber}: ${formatTime(result.singleMs)}`,
							`${formatAccountDate(result.recordedAt)} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
						];
					},
				},
			},
		},
		scales: {
			x: {
				display: false,
				offset: true,
			},
			y: {
				position: "right",
				beginAtZero: false,
				grid: { color: colors.surface, tickColor: colors.surface },
				border: { color: colors.surface },
				title: {
					display: true,
					text: "Time",
					color: colors.muted,
				},
				ticks: {
					color: colors.muted,
					callback: formatTimeAxisTick,
				},
			},
		},
	};

	return (
		<section
			className="account-progression"
			aria-labelledby="account-progression-title"
		>
			<header className="account-progression-header">
				<h2 id="account-progression-title">progression</h2>
			</header>
			{plotted.length ? (
				<div className="account-progression-chart">
					<Line
						data={data}
						options={options}
						role="img"
						aria-label={`Progression of ${plotted.length} completed solves: individual solve dots, personal best, and rolling averages of 5, 12, and 50 completed solves`}
					/>
				</div>
			) : (
				<p className="account-progression-empty">
					Your progression will appear after your first completed solve.
				</p>
			)}
			<div className="account-progression-footer">
				<span className="account-progression-caption">
					PB improvement per hour spent solving:{" "}
					{improvementPerHour === null
						? "—"
						: `-${improvementPerHour.toFixed(2)}s`}
				</span>
				<div
					className="account-progression-controls"
					role="group"
					aria-label="Progression series"
				>
					{SERIES.map(({ key, label }) => (
						<button
							key={key}
							className="account-progression-toggle"
							type="button"
							aria-pressed={visible[key]}
							onClick={() =>
								setVisible((current) => ({ ...current, [key]: !current[key] }))
							}
						>
							<FontAwesomeIcon
								icon={key === "pb" ? faCrown : faChartLine}
								fixedWidth
								aria-hidden="true"
							/>
							{label}
						</button>
					))}
				</div>
			</div>
		</section>
	);
}
