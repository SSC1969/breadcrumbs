import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS } from "src/const/settings";
import { VIEW_IDS } from "src/const/views";
import { rebuild_graph } from "src/graph/build";
import type { BreadcrumbsGraph } from "src/interfaces/graph";
import type { BreadcrumbsSettings } from "src/interfaces/settings";
import { BreadcrumbsSettingTab } from "src/settings/SettingsTab";
import { active_file_store } from "src/stores/active_file";
import { MatrixView } from "src/views/matrix";
import { dataview_plugin } from "./external/dataview";
import { migrate_old_settings } from "./settings/migration";

export default class BreadcrumbsPlugin extends Plugin {
	graph!: BreadcrumbsGraph;
	settings!: BreadcrumbsSettings;

	async onload() {
		console.log("loading breadcrumbs");

		// Settings
		await this.loadSettings();

		/// Migrations
		await migrate_old_settings(this);

		this.addSettingTab(new BreadcrumbsSettingTab(this.app, this));

		// Events
		this.registerEvent(
			this.app.workspace.on("file-open", async (file) => {
				active_file_store.set(file);
			})
		);

		this.app.workspace.onLayoutReady(async () => {
			console.log("onLayoutReady");

			await dataview_plugin.await_if_enabled(this);

			this.refresh();

			// Views
			this.registerView(
				VIEW_IDS.matrix,
				(leaf) => new MatrixView(leaf, this)
			);

			// console.log("Test traversal");

			// const path_upwards: Partial<GraphEdge>[] = [];

			// traverse_graph.depth_first(
			// 	this.graph,
			// 	get(active_file_store)?.path!,
			// 	({ source_id, target_id, attr }) => {
			// 		path_upwards.push({ source_id, target_id, attr });
			// 	},
			// 	(e) => e.attr.dir === "up"
			// );

			// console.log(path_upwards);
		});

		// Commands
		this.addCommand({
			id: "breadcrumbs:rebuild-graph",
			name: "Rebuild graph",
			callback: () => this.refresh(),
		});

		this.addCommand({
			id: "breadcrumbs:open-matrix-view",
			name: "Open matrix view",
			callback: () => this.activateView(VIEW_IDS.matrix),
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Refresh active_file_store, then rebuild_graph */
	refresh() {
		console.log("bc.refresh");

		// Rebuild the graph
		this.graph = rebuild_graph(this);

		// _Then_ react
		active_file_store.refresh(this.app);
	}

	// SOURCE: https://docs.obsidian.md/Plugins/User+interface/Views
	async activateView(view_id: string, options?: { side?: "left" | "right" }) {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(view_id);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found in the workspace, create a new leaf in the right sidebar for it.
			// Default is to open on the right
			leaf =
				options?.side === "left"
					? workspace.getLeftLeaf(false)
					: workspace.getRightLeaf(false);

			await leaf.setViewState({ type: view_id, active: true });
		}

		// "Reveal" the leaf in case it is in a collapsed sidebar
		workspace.revealLeaf(leaf);
	}
}
