/**
 * Event messages 🪝
 *
 * Define what message to show for each agent hook / status.
 * This is fully data-driven: edit, add, or remove entries below and the
 * extension wires them up automatically.
 *
 * Each entry maps a logical STATE to an underlying pi hook (noted in comments).
 *
 * Themes: Michael Jackson 🕺 / Ronaldo ⚽ / Fallout ☢️ / Elder Scrolls 🐉
 *         Star Wars ✨ / LOTR 💍 / Pokémon ⚡ / Minecraft ⛏️ / Dark Souls 🔥
 *         Elden Ring ⚔️ / GTA 🚗 / God of War 🪓 / Cyberpunk 2077 🌃 / Witcher 🐺
 *         World Cup 🏆⚽ / Baldur's Gate 3 🎲 + internet memes 📈 + AI agent 🤖
 *
 * Placeholders you can use inside `messages`:
 *   {tool}  -> tool name (for tool* states)
 *   {turn}  -> turn index (for turnEnd)
 *   {ms}    -> elapsed milliseconds since agent_start (for agentDone)
 *
 * Channels (how the message is shown):
 *   "notify" -> pops a toast notification (info | warning | error)
 *   "status" -> writes to the footer status bar, auto-cleared after clearAfterMs
 *
 * Randomness:
 *   - One line from `messages` is picked at random each time.
 *   - `chance` (0..1) is the probability it fires at all, so even with
 *     everything enabled it stays fun instead of spammy. 1 = always.
 */

export type EventChannel = "notify" | "status";

export interface EventMessageConfig {
	/** Turn this event message on/off without deleting it. */
	enabled: boolean;
	/** Probability (0..1) that the message fires when the hook triggers. */
	chance: number;
	/** Message pool. One is chosen at random. Supports placeholders above. */
	messages: string[];
	/** Where to show it. */
	channel: EventChannel;
	/** Toast severity (channel="notify"). */
	notifyType?: "info" | "warning" | "error";
	/** Status bar slot key (channel="status"). Reuse the same key to overwrite. */
	statusKey?: string;
	/** Auto-clear the status text after this many ms (channel="status"). */
	clearAfterMs?: number;
}

/**
 * Supported states. The comment after each key is the pi hook it listens to.
 * Add your own memes, tweak `chance`, or flip `enabled` to false to silence one.
 */
export const EVENT_MESSAGES: Record<string, EventMessageConfig> = {
	// tool_execution_start — a tool is about to run (Elder Scrolls / Fallout flavor)
	toolStart: {
		enabled: true,
		chance: 0.35,
		messages: [
			"Channeling Thu'um for {tool}…",
			"Booting up {tool} on the Pip-Boy…",
			"Lining up the free kick: {tool}…",
			"Stepping up for the penalty: {tool} ⚽",
			"VAR reviewing {tool}… 📺",
			"Counter-attack: {tool} 🏃",
			"Lockpicking {tool}…",
			"Dogmeat sniffing out {tool}…",
			"M'aiq prepares {tool}…",
			"Loading {tool} into the warp pipe…",
			"Calma, calma… {tool} incoming",
			// internet / AI agent
			"Let him cook: {tool} 🧑‍🍳",
			"Speedrun any%: {tool} 🏃",
			"Why are you running… {tool}",
			"Tokens go brrr for {tool}",
			"Chain of thought → {tool}",
			"Just one more {tool} bro",
			"Trust me bro, running {tool}",
		],
		channel: "status",
		statusKey: "fun-event",
		clearAfterMs: 4000,
	},

	// tool_execution_end (isError === false) — a tool succeeded (Ronaldo SIUUU!)
	toolPass: {
		enabled: true,
		chance: 0.95,
		messages: [
			"SIUUUU! {tool} ⚽",
			"Fus Ro Dah! {tool} done 🐉",
			"Vault-Tec approves {tool} ☢️",
			"+10 XP — {tool}",
			"Smooth Criminal: {tool} 🕺",
			"Hattrick! {tool} ⚽",
			"Shamone! {tool} done 🕺",
			"Sweetroll earned for {tool} 🐉",
			"Top corner finish: {tool} ⚽",
			"Dogmeat approves {tool} ☢️",
			"Beat it — {tool} cleared 🕺",
			"Caps collected from {tool} ☢️",
			// internet / AI agent
			"Stonks 📈 {tool}",
			"GG EZ — {tool} 🏆",
			"Achievement unlocked: {tool} 🏆",
			"Gigachad ran {tool} 🗿",
			"That's a W — {tool}",
			"No cap, {tool} clean",
			"Based {tool} 😎",
			"It ain't much but {tool} is honest work",
			"Surprised Pikachu: {tool} worked 😮",
			"Clutch {tool} 🎯",
			"No hallucination detected: {tool} ✅",
			"First try (it wasn't): {tool}",
			// extra themes
			"The Force is strong with {tool} ✨",
			"One does not simply fail {tool} 💍",
			"{tool} is super effective ⚡",
			"Diamonds mined: {tool} ⛏️",
			"Praise the sun — {tool} ☀️",
			// Elden Ring / GTA / GoW / Cyberpunk
			"{tool}: Great, enemy felled ⚔️",
			"Wasted... not! {tool} 🚗",
			"BOY! {tool} done 🪓",
			"Preem work, {tool} choom 🌃",
			"{tool}: legendary loot 🔫",
			"Witcher contract complete: {tool} 🐺",
			"Toss a coin for {tool} 🪙",
			// World Cup 🏆⚽
			"GOOOAL! {tool} ⚽",
			"Hat-trick! {tool} ⚽⚽⚽",
			"Top bins finish: {tool} 🎯",
			"Penalty buried: {tool} ⚽",
			"Back of the net: {tool} 🥅",
			"World Cup winner: {tool} 🏆",
			"Golden Boot for {tool} 🥇",
			"What a screamer: {tool} 🚀",
			// Baldur's Gate 3 🎲
			"Nat 20! {tool} 🎲",
			"Critical hit: {tool} ⚔️",
			"{tool} approves 🧛",
			"Magic Missile hits {tool} ✨",
		],
		channel: "status",
		statusKey: "fun-event",
		clearAfterMs: 2500,
	},

	// tool_execution_end (isError === true) — a tool failed (the unlucky reel)
	toolFail: {
		enabled: true,
		chance: 1,
		messages: [
			"{tool} took an arrow to the knee 🏹",
			"Penaldo moment on {tool} 😬",
			"Radroach ate {tool} ☢️",
			"Annie, are you OK? {tool} is not 🕺",
			"War never changes… {tool} failed",
			"Nazeem laughs at {tool} 🐉",
			"Off the crossbar: {tool} missed ⚽",
			"You died. {tool} ☠️",
			"Sheogorath scrambled {tool} 🧀",
			"Mankind divided — {tool} broke ☢️",
			// internet / AI agent
			"Task failed successfully: {tool} ✅",
			"Press F for {tool} 🇫",
			"Skill issue: {tool} 💀",
			"This is fine 🔥🐶 ({tool})",
			"Wasted ☠️ {tool}",
			"L + ratio: {tool}",
			"404: {tool} success not found",
			"Bonk. {tool} 🔨",
			"Hallucinated {tool}, my bad 🤖",
			"It's not a bug, it's a {tool} feature 🐛",
			"Cope. {tool} retry incoming",
			// extra themes
			"It's a trap! {tool} 🖥️",
			"You shall not pass: {tool} 🧙",
			"{tool} fainted ⚡",
			"Creeper blew up {tool} 💥",
			"YOU DIED — {tool} 🔥",
			// Elden Ring / GTA / GoW / Cyberpunk
			"You died. {tool} — Maidenless ⚔️",
			"WASTED — {tool} 🚔",
			"The cycle of {tool} failure 🪓",
			"Flatlined: {tool} 🌃",
			"Wanted level rising: {tool} 🚨",
			"Damn, {tool} — wind's howling 🐺",
			"{tool}: missed the Quen sign 🛡️",
			// World Cup 🏆⚽
			"Penalty missed: {tool} 🥺",
			"Red card for {tool} 🟥",
			"Offside! {tool} 🚩",
			"Hit the post: {tool} 🥸",
			"Own goal: {tool} 😬",
			"Out on penalties: {tool} 😭",
			"VAR ruled out {tool} 📺",
			// Baldur's Gate 3 🎲
			"Nat 1! {tool} 🎲",
			"{tool} disapproves 🧛",
			"Failed the saving throw: {tool} 💀",
			"Gale ate {tool} 🧙‍♂️",
		],
		channel: "notify",
		notifyType: "error",
	},

	// agent_start — the agent loop begins (kick-off vibes)
	agentStart: {
		enabled: true,
		chance: 0.5,
		messages: [
			"Hee-hee! Let's go 🕺",
			"War. War never changes. ☢️",
			"The Dragonborn comes 🐉",
			"Calma, calma… here we go ⚽",
			"Wake up, Vault Dweller ☢️",
			"It's showtime 🕺",
			// internet / AI agent
			"Hello there 👋",
			"Let him cook 🧑‍🍳",
			"Vibe check ✅",
			"It's morbin time",
			"Agentic mode: ON 🤖",
			"Tokens, assemble 🔥",
		],
		channel: "notify",
		notifyType: "info",
	},

	// agent_end — the agent loop finishes (the celebration)
	agentDone: {
		enabled: true,
		chance: 1,
		messages: [
			"SIUUUU! Done in {ms}ms ⚽",
			"Skyrim belongs to the Nords 🐉",
			"Nuka-Cola break — finished ☢️",
			"Just beat it ✨ ({ms}ms)",
			"Hattrick complete ⚽ ({ms}ms)",
			"Fast travel complete 🐉",
			"Moonwalk off stage 🕺 ({ms}ms)",
			"Another one for the GOAT ⚽",
			// internet / AI agent
			"GG 🏆 ({ms}ms)",
			"Stonks 📈 done in {ms}ms",
			"We did it Reddit 🎉",
			"That's a W ({ms}ms)",
			"Task completed successfully ✅ ({ms}ms)",
			"The cook is done 🧑‍🍳 ({ms}ms)",
			"No tokens were harmed 🤖 ({ms}ms)",
			"Touch grass now 🌱 ({ms}ms)",
			// Elden Ring / GTA / GoW / Cyberpunk
			"Great Rune restored ⚔️ ({ms}ms)",
			"Mission passed 🚗 ({ms}ms)",
			"The Realms are safe 🪓 ({ms}ms)",
			"Wake up, samurai — done 🌃 ({ms}ms)",
			"Contract fulfilled 🐺 ({ms}ms)",
			// World Cup 🏆⚽
			"It's coming home 🏆 ({ms}ms)",
			"Champions of the world ⚽ ({ms}ms)",
			"Lifted the trophy 🏆 ({ms}ms)",
			"Final whistle 📣 ({ms}ms)",
			"SIUUU — we are the champions ⚽ ({ms}ms)",
			// Baldur's Gate 3 🎲
			"Quest complete 🎲 ({ms}ms)",
			"Time for a long rest 🛏️ ({ms}ms)",
			"The Absolute is defeated 🦠 ({ms}ms)",
		],
		channel: "notify",
		notifyType: "info",
	},

	// turn_start — a new turn begins
	turnStart: {
		enabled: true,
		chance: 0.25,
		messages: [
			"Round {turn}, fight! 🥊",
			"Turn {turn}: it's morbin time",
			"Casting again — turn {turn} 🐉",
			"One does not simply skip turn {turn} 💍",
			"A wild turn {turn} appeared ⚡",
		],
		channel: "status",
		statusKey: "fun-event",
		clearAfterMs: 1800,
	},

	// turn_end — one turn finished (level-up flavor)
	turnEnd: {
		enabled: true,
		chance: 0.4,
		messages: [
			"Level up! Turn {turn} 🆙",
			"Moonwalk to turn {turn} 🕺",
			"Turn {turn}: SIUUU ⚽",
			"Vault {turn} cleared ☢️",
			"Word of Power learned — turn {turn} 🐉",
			// internet / AI agent
			"Achievement unlocked: turn {turn} 🏆",
			"Combo x{turn} 🔥",
			"+1 social credit (turn {turn})",
			"Galaxy brain — turn {turn} 🧠",
			"Context window survives turn {turn} 🤖",
			// extra themes
			"You leveled up! Turn {turn} ⚡",
			"+1 to the Force, turn {turn} ✨",
			"Diamond block mined — turn {turn} ⛏️",
		],
		channel: "status",
		statusKey: "fun-event",
		clearAfterMs: 2000,
	},

	// session_start — a session opens
	sessionStart: {
		enabled: true,
		chance: 1,
		messages: [
			"A new adventure begins 💍",
			"Spawn point set ⛏️",
			"May the Force be with you ✨",
			"Welcome back, Dragonborn 🐉",
			"Loading save file ☢️",
			"It's-a me, the agent 🍄",
			"Rise, Tarnished ⚔️",
			"Welcome to Night City, choom 🌃",
			"BOY. We have work to do 🪓",
			"Ah shit, here we go again 🚗",
			"Wind's howling... let's hunt 🐺",
			"Kick-off! ⚽",
			"The World Cup final begins 🏆",
			"Walking out to the anthem 🎵",
			"Roll for initiative 🎲",
			"WE NEED TO TALK 🦠",
		],
		channel: "notify",
		notifyType: "info",
	},

	// session_compact — context was compacted
	sessionCompact: {
		enabled: true,
		chance: 1,
		messages: [
			"Memories compacted 🧠",
			"Context window spring cleaning 🧹",
			"This memory has been... condensed 🔥",
			"Snap! Half the tokens are gone 🫰",
			"Folding the context like laundry 🧺",
		],
		channel: "notify",
		notifyType: "warning",
	},

	// message_start — assistant starts a message (frequent: low chance)
	messageStart: {
		enabled: true,
		chance: 0.12,
		messages: ["Cooking a reply 🧑‍🍳", "Channeling thoughts 🐉", "Tokens incoming 🤖"],
		channel: "status",
		statusKey: "fun-event",
		clearAfterMs: 1500,
	},

	// message_end — assistant finished a message (frequent: low chance)
	messageEnd: {
		enabled: true,
		chance: 0.12,
		messages: ["Mic drop 🎤", "And that's the tea ☕", "Reply delivered 📬"],
		channel: "status",
		statusKey: "fun-event",
		clearAfterMs: 1500,
	},

	// model_select — the model changed
	modelSelect: {
		enabled: true,
		chance: 1,
		messages: [
			"Switching to {model} 🤖",
			"{model} enters the chat ⚡",
			"New brain installed: {model} 🧠",
			"{model}, I choose you! ⚡",
		],
		channel: "notify",
		notifyType: "info",
	},

	// thinking_level_select — reasoning effort changed
	thinkingLevel: {
		enabled: true,
		chance: 1,
		messages: [
			"Thinking level: {level} 🧠",
			"Galaxy brain dialed to {level} 🌌",
			"Big brain mode: {level}",
		],
		channel: "notify",
		notifyType: "info",
	},

	// user_bash — user ran a shell command via ! prefix
	userBash: {
		enabled: true,
		chance: 0.5,
		messages: ["Hacking the mainframe 💻", "Running it raw ⛏️", "Sudo make me a sandwich 🥪"],
		channel: "status",
		statusKey: "fun-event",
		clearAfterMs: 2500,
	},

	// input — user submitted a prompt (frequent: low chance)
	input: {
		enabled: true,
		chance: 0.2,
		messages: ["Message received 📨", "On it, boss 🫡", "Say no more 🤝", "Bet. 🎲"],
		channel: "status",
		statusKey: "fun-event",
		clearAfterMs: 1500,
	},
};
