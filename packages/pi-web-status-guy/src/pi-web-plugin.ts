import type { PiWebPlugin } from "@jmfederico/pi-web/plugin-api";
// 模板里的标签名是字面量,须与 statusPanelElement.ts 的 statusPanelTagName("pi-web-status-guy-panel")保持一致
import { defineStatusPanelElement, statusPanelBadge } from "./statusPanelElement.js";

const plugin: PiWebPlugin = {
	apiVersion: 1,
	name: "Status Guy",
	activate: ({ html, svg }) => {
		defineStatusPanelElement();
		return {
			contributions: {
				workspacePanels: [
					{
						id: "workspace.status",
						title: "Status",
						icon: svg`
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M3 12h4l2 -7 4 14 2 -7h6"></path>
							</svg>
						`,
						order: 60,
						badge: (context) => statusPanelBadge(context),
						render: (context) => html`<pi-web-status-guy-panel .context=${context}></pi-web-status-guy-panel>`,
					},
				],
			},
		};
	},
};

export default plugin;
