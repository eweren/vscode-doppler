import * as vscode from 'vscode';
import * as cp from "child_process";

let updateInterval: number | NodeJS.Timeout | undefined;
const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

export async function activate(context: vscode.ExtensionContext) {

	item.accessibilityInformation = { label: 'Doppler extension' };
	updateStatusBarItem();

	updateInterval = setInterval(async () => {
		await updateStatusBarItem();
	}, 10000);

	const setupMainScripts = () => {
		const setup = vscode.commands.registerCommand('doppler.setup', async () => setupDopplerProject());
		context.subscriptions.push(setup);

		const change = vscode.commands.registerCommand('doppler.change', async () => setupDopplerEnvironment());
		context.subscriptions.push(change);
	};

	try {
		await checkIfDopplerIsInstalled();
		setupMainScripts();
	} catch (e) {
		setupDoppler();
	}

	console.log('Doppler initialized!');
}

// this method is called when your extension is deactivated
export function deactivate() {
	if (updateInterval) {
		clearInterval(updateInterval);
	}
}

/**
 * Creates a status bar item with the current Doppler environment.
 */
async function updateStatusBarItem() {
	try {
		const dopplerConfig = await execShell('doppler configure --json');
		const paths = Object.keys(JSON.parse(dopplerConfig));
		// get most deeply nested path
		const configForPath = JSON.parse(dopplerConfig)[paths.sort((p1, p2) => p2.split("/").length - p1.split("/").length)[0]] as { "enclave.config": string, "enclave.project": string };
		if (!Object.keys(configForPath).includes("enclave.config")) {
			throw new Error("No enclave.config found");
		}
		item.command = 'doppler.change';
		item.text = `$(magnet)  ${configForPath['enclave.config']}`;
		item.tooltip = `Project: ${configForPath['enclave.project']}`;
		item.show();
	} catch (e) {
		item.text = `Setup doppler`;
		item.command = 'doppler.setup';
		item.tooltip = `Currently not in a doppler scope. Click here to setup.`;
		item.show();
		vscode.window.showWarningMessage("The current workspace doesn't seem to be scoped to doppler.");
		return;
	}
}

/**
 * Returns the env of the currently configured doppler project.
 */
async function getEnvsOfProject() {
	let configsOfProject: Array<{ name: string, root: boolean, locked: boolean, environment: string, project: string, created_at: string, initial_fetch_at: string, last_fetch_at: string }> = [];
	try {
		configsOfProject = JSON.parse(await execShell('doppler configs --json'));
		return configsOfProject;
	} catch (e) {
		vscode.window.showErrorMessage('An error occurred while trying to fetch doppler environments.');
	}
}

/**
 * Returns all doppler projects associated with the current doppler user.
 */
async function getProjects() {
	let projectsOfUser: Array<{ id: string, name: string, description: string, created_at: string }> = [];
	try {
		projectsOfUser = JSON.parse(await execShell('doppler projects --json'));
		return projectsOfUser;
	} catch (e) {
		vscode.window.showErrorMessage('An error occurred while trying to fetch doppler projects.');
	}
}

/**
 * Returns the current doppler project.
 */
async function getCurrentProject() {
	return (await getEnvsOfProject())?.[0].project;
}

/**
 * Executes the doppler setup command and prompts the user to select a project.
 */
async function setupDopplerProject() {
	const projects = await getProjects();
	if (projects) {
		const selectedProject = await vscode.window.showQuickPick(projects.map(e => e.name), { canPickMany: false, title: "Select a doppler project" });
		if (selectedProject) {
			await execShell(`doppler setup -p ${selectedProject} -c dev --no-interactive`);
			setupDopplerEnvironment();
			updateStatusBarItem();
		}
	} else {
		vscode.window.showWarningMessage("You don't seem to be either logged in to doppler or you do not have any project associated with your account.");
	}
}

/**
 * Executes the doppler config command and prompts the user to select an environment.
 */
async function setupDopplerEnvironment() {
	const project = await getCurrentProject();
	const envsOfProject = await getEnvsOfProject();
	if (!envsOfProject) {
		return;
	}
	const selectedEnv = await vscode.window.showQuickPick(envsOfProject.map(e => e.name), { canPickMany: false, title: "Select an environment" });
	if (selectedEnv) {
		await execShell(`doppler setup -p ${project} -c ${selectedEnv} --no-interactive`);
		vscode.window.showInformationMessage(`Doppler is configured for ${project} - ${selectedEnv}`);
		updateStatusBarItem();
	}
}

/**
 * Executes the scripts to install doppler and asks the user to sign in.
 */
async function setupDoppler() {
	vscode.window.showInformationMessage("Please install Doppler: https://docs.doppler.com/docs/install-cli");
}

/**
 * Command to check if doppler is installed.
 */
async function checkIfDopplerIsInstalled() {
	const dopplerVersion = await execShell('command -v doppler');
	if (!dopplerVersion.includes('doppler')) {
		vscode.window.showErrorMessage('Doppler not found. Please install doppler.');
		throw new Error("Doppler not found.");
	}
}

/**
 * Helper to execute a shell command.
 * @param cmd The command to execute.
 * @returns The output of the command.
 */
const execShell = (cmd: string) =>
	new Promise<string>((resolve, reject) => {
		cp.exec(cmd, (err, out) => {
			if (err) {
				return reject(err);
			}
			return resolve(out);
		});
	});