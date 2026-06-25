/**
 * Settings ⚙️
 *
 * Tune these values to change the animation speed, colors and spinner style.
 */

export const SETTINGS = {
	// ---- Spinner indicator ----
	// Frames for the spinner animation. Swap for anything, e.g.:
	//   ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"]  moon phases
	//   ["◐", "◓", "◑", "◒"]                              half circles
	spinnerFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
	spinnerColor: [255, 180, 80] as [number, number, number], // spinner color (RGB). Set to null to use rainbow flow
	spinnerIntervalMs: 80, // spinner frame interval (ms)

	// ---- Text ----
	textRefreshMs: 90, // rainbow flow refresh interval (smaller = smoother)
	messageSwitchMs: 3500, // how long before switching to the next phrase (ms)
	randomOrder: false, // true = random phrase switching, false = cycle in order
	suffix: "…", // characters appended to the phrase (set to "" to disable)

	// ---- Event messages (pass / fail / etc) ----
	// Per-event details (text, channel, individual chance) live in events.ts.
	// These are the GLOBAL knobs that apply on top of every event.
	events: {
		enabled: true, // master on/off for ALL event messages
		chanceMultiplier: 1, // scales every event's `chance` (0 = never, 1 = as-defined, 2 = twice as likely)
		colorizeStatus: true, // pick a random palette color for each status-bar event message
	},

	// ---- Text color ----
	// "solid"   -> always use solidColor
	// "rainbow" -> flowing rainbow gradient
	// "random"  -> pick a random color from `palette` each time the phrase switches
	colorMode: "random" as "solid" | "rainbow" | "random",
	solidColor: [155, 86, 63] as [number, number, number], // used when colorMode="solid"

	// Palette used by colorMode="random" and event status colorizing.
	palette: [
		[255, 99, 132], // red
		[255, 159, 64], // orange
		[255, 205, 86], // yellow
		[75, 222, 128], // green
		[54, 200, 235], // cyan
		[99, 132, 255], // blue
		[177, 122, 255], // purple
		[255, 122, 222], // pink
		[120, 255, 214], // mint
		[255, 180, 80], // amber
	] as [number, number, number][],

	// ---- Rainbow params (colorMode="rainbow") ----
	rainbowSpeed: 0.25, // color flow speed
	rainbowSpread: 0.12, // hue difference between adjacent chars (larger = more colorful)
	rainbowSaturation: 0.9, // saturation 0..1
	rainbowLightness: 0.65, // lightness 0..1
};

export type Settings = typeof SETTINGS;
