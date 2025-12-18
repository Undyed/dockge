import { DockgeServer } from "./dockge-server";
import fs, { promises as fsAsync } from "fs";
import { log } from "./log";
import yaml from "yaml";
import { DockgeSocket, fileExists, ValidationError } from "./util-server";
import path from "path";
import {
    acceptedComposeFileNames,
    COMBINED_TERMINAL_COLS,
    COMBINED_TERMINAL_ROWS,
    CREATED_FILE,
    CREATED_STACK,
    EXITED, getCombinedTerminalName,
    getComposeTerminalName, getContainerExecTerminalName,
    RUNNING, TERMINAL_ROWS,
    UNKNOWN
} from "../common/util-common";
import { SubscriptionTerminal, SubscriptionInteractiveTerminal } from "./terminal-subscription";
import { Settings } from "./settings";
import { DockerClient } from "./docker-client";
import { EventPublisher } from "./event-publisher";

export class SubscriptionStack {
    name: string;
    protected _status: number = UNKNOWN;
    protected _composeYAML?: string;
    protected _composeENV?: string;
    protected _configFilePath?: string;
    protected _composeFileName: string = "compose.yaml";
    protected server: DockgeServer;
    protected eventPublisher: EventPublisher;

    protected combinedTerminal?: SubscriptionTerminal;
    protected static managedStackList: Map<string, SubscriptionStack> = new Map();

    constructor(server: DockgeServer, name: string, composeYAML?: string, composeENV?: string, skipFSOperations = false) {
        this.name = name;
        this.server = server;
        this._composeYAML = composeYAML;
        this._composeENV = composeENV;
        this.eventPublisher = EventPublisher.getInstance();

        if (!skipFSOperations) {
            // Check if compose file name is different from compose.yaml
            for (const filename of acceptedComposeFileNames) {
                if (fs.existsSync(path.join(this.path, filename))) {
                    this._composeFileName = filename;
                    break;
                }
            }
        }
    }

    async toJSON(endpoint: string): Promise<object> {
        let primaryHostname = await Settings.get("primaryHostname");
        if (!primaryHostname) {
            if (!endpoint) {
                primaryHostname = "localhost";
            } else {
                try {
                    primaryHostname = (new URL("https://" + endpoint).hostname);
                } catch (e) {
                    primaryHostname = "localhost";
                }
            }
        }

        let obj = this.toSimpleJSON(endpoint);
        return {
            ...obj,
            composeYAML: this.composeYAML,
            composeENV: this.composeENV,
            primaryHostname,
        };
    }

    toSimpleJSON(endpoint: string): object {
        return {
            name: this.name,
            status: this._status,
            tags: [],
            isManagedByDockge: this.isManagedByDockge,
            composeFileName: this._composeFileName,
            endpoint,
        };
    }

    async ps(): Promise<object> {
        const dockerClient = DockerClient.getInstance();
        let res = await dockerClient.composeExec([ "ps", "--format", "json" ], this.path);
        if (!res.stdout) {
            return {};
        }
        return JSON.parse(res.stdout.toString());
    }

    get isManagedByDockge(): boolean {
        return fs.existsSync(this.path) && fs.statSync(this.path).isDirectory();
    }

    get status(): number {
        return this._status;
    }

    validate() {
        if (!this.name.match(/^[a-z0-9_-]+$/)) {
            throw new ValidationError("Stack name can only contain [a-z][0-9] _ - only");
        }

        yaml.parse(this.composeYAML);

        let lines = this.composeENV.split("\n");

        if (lines.length === 1 && !lines[0].includes("=") && lines[0].length > 0) {
            throw new ValidationError("Invalid .env format");
        }
    }

    get composeYAML(): string {
        if (this._composeYAML === undefined) {
            try {
                this._composeYAML = fs.readFileSync(path.join(this.path, this._composeFileName), "utf-8");
            } catch (e) {
                this._composeYAML = "";
            }
        }
        return this._composeYAML;
    }

    get composeENV(): string {
        if (this._composeENV === undefined) {
            try {
                this._composeENV = fs.readFileSync(path.join(this.path, ".env"), "utf-8");
            } catch (e) {
                this._composeENV = "";
            }
        }
        return this._composeENV;
    }

    get path(): string {
        return path.join(this.server.stacksDir, this.name);
    }

    get fullPath(): string {
        let dir = this.path;
        let fullPathDir;

        if (!path.isAbsolute(dir)) {
            fullPathDir = path.join(process.cwd(), dir);
        } else {
            fullPathDir = dir;
        }
        return fullPathDir;
    }

    async save(isAdd: boolean) {
        this.validate();

        let dir = this.path;

        if (isAdd) {
            if (await fileExists(dir)) {
                throw new ValidationError("Stack name already exists");
            }
            await fsAsync.mkdir(dir);
        } else {
            if (!await fileExists(dir)) {
                throw new ValidationError("Stack not found");
            }
        }

        await fsAsync.writeFile(path.join(dir, this._composeFileName), this.composeYAML);

        const envPath = path.join(dir, ".env");

        if (await fileExists(envPath) || this.composeENV.trim() !== "") {
            await fsAsync.writeFile(envPath, this.composeENV);
        }
    }

    async deploy(socket: DockgeSocket): Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await SubscriptionTerminal.exec(this.server, socket, terminalName, "docker", [ "compose", "up", "-d", "--remove-orphans" ], this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to deploy, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async delete(socket: DockgeSocket): Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await SubscriptionTerminal.exec(this.server, socket, terminalName, "docker", [ "compose", "down", "--remove-orphans" ], this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to delete, please check the terminal output for more information.");
        }

        await fsAsync.rm(this.path, {
            recursive: true,
            force: true
        });

        return exitCode;
    }

    async updateStatus() {
        let statusList = await SubscriptionStack.getStatusList();
        let status = statusList.get(this.name);

        if (status) {
            this._status = status;
        } else {
            this._status = UNKNOWN;
        }
    }

    static async composeFileExists(stacksDir: string, filename: string): Promise<boolean> {
        let filenamePath = path.join(stacksDir, filename);
        for (const filename of acceptedComposeFileNames) {
            let composeFile = path.join(filenamePath, filename);
            if (await fileExists(composeFile)) {
                return true;
            }
        }
        return false;
    }

    static async getStackList(server: DockgeServer, useCacheForManaged = false): Promise<Map<string, SubscriptionStack>> {
        let stacksDir = server.stacksDir;
        let stackList: Map<string, SubscriptionStack>;

        if (useCacheForManaged && this.managedStackList.size > 0) {
            stackList = this.managedStackList;
        } else {
            stackList = new Map<string, SubscriptionStack>();

            let filenameList = await fsAsync.readdir(stacksDir);

            for (let filename of filenameList) {
                try {
                    let stat = await fsAsync.stat(path.join(stacksDir, filename));
                    if (!stat.isDirectory()) {
                        continue;
                    }
                    if (!await SubscriptionStack.composeFileExists(stacksDir, filename)) {
                        continue;
                    }
                    let stack = await this.getStack(server, filename);
                    stack._status = CREATED_FILE;
                    stackList.set(filename, stack);
                } catch (e) {
                    if (e instanceof Error) {
                        log.warn("getStackList", `Failed to get stack ${filename}, error: ${e.message}`);
                    }
                }
            }

            this.managedStackList = new Map(stackList);
        }

        const dockerClient = DockerClient.getInstance();
        let res = await dockerClient.composeExec([ "ls", "--all", "--format", "json" ], process.cwd());

        if (!res.stdout) {
            return stackList;
        }

        let composeList = JSON.parse(res.stdout.toString());

        for (let composeStack of composeList) {
            let stack = stackList.get(composeStack.Name);

            if (!stack) {
                if (composeStack.Name === "dockge") {
                    continue;
                }
                stack = new SubscriptionStack(server, composeStack.Name);
                stackList.set(composeStack.Name, stack);
            }

            stack._status = this.statusConvert(composeStack.Status);
            stack._configFilePath = composeStack.ConfigFiles;
        }

        return stackList;
    }

    static async getStatusList(): Promise<Map<string, number>> {
        let statusList = new Map<string, number>();

        const dockerClient = DockerClient.getInstance();
        let res = await dockerClient.composeExec([ "ls", "--all", "--format", "json" ], process.cwd());

        if (!res.stdout) {
            return statusList;
        }

        let composeList = JSON.parse(res.stdout.toString());

        for (let composeStack of composeList) {
            statusList.set(composeStack.Name, this.statusConvert(composeStack.Status));
        }

        return statusList;
    }

    static statusConvert(status: string): number {
        if (status.startsWith("created")) {
            return CREATED_STACK;
        } else if (status.includes("exited")) {
            return EXITED;
        } else if (status.startsWith("running")) {
            return RUNNING;
        } else {
            return UNKNOWN;
        }
    }

    static async getStack(server: DockgeServer, stackName: string, skipFSOperations = false): Promise<SubscriptionStack> {
        let dir = path.join(server.stacksDir, stackName);

        if (!skipFSOperations) {
            if (!await fileExists(dir) || !(await fsAsync.stat(dir)).isDirectory()) {
                let stackList = await this.getStackList(server, true);
                let stack = stackList.get(stackName);

                if (stack) {
                    return stack;
                } else {
                    throw new ValidationError("Stack not found");
                }
            }
        }

        let stack: SubscriptionStack;

        if (!skipFSOperations) {
            stack = new SubscriptionStack(server, stackName);
        } else {
            stack = new SubscriptionStack(server, stackName, undefined, undefined, true);
        }

        stack._status = UNKNOWN;
        stack._configFilePath = path.resolve(dir);
        return stack;
    }

    async start(socket: DockgeSocket) {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await SubscriptionTerminal.exec(this.server, socket, terminalName, "docker", [ "compose", "up", "-d", "--remove-orphans" ], this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to start, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async stop(socket: DockgeSocket): Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await SubscriptionTerminal.exec(this.server, socket, terminalName, "docker", [ "compose", "stop" ], this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to stop, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async restart(socket: DockgeSocket): Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await SubscriptionTerminal.exec(this.server, socket, terminalName, "docker", [ "compose", "restart" ], this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to restart, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async down(socket: DockgeSocket): Promise<number> {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await SubscriptionTerminal.exec(this.server, socket, terminalName, "docker", [ "compose", "down" ], this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to down, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async update(socket: DockgeSocket) {
        const terminalName = getComposeTerminalName(socket.endpoint, this.name);
        let exitCode = await SubscriptionTerminal.exec(this.server, socket, terminalName, "docker", [ "compose", "pull" ], this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to pull, please check the terminal output for more information.");
        }

        await this.updateStatus();
        log.debug("update", "Status: " + this.status);
        if (this.status !== RUNNING) {
            return exitCode;
        }

        exitCode = await SubscriptionTerminal.exec(this.server, socket, terminalName, "docker", [ "compose", "up", "-d", "--remove-orphans" ], this.path);
        if (exitCode !== 0) {
            throw new Error("Failed to restart, please check the terminal output for more information.");
        }
        return exitCode;
    }

    /**
     * 智能加入组合终端 - 只在有订阅者时启动日志流
     */
    async joinCombinedTerminal(socket: DockgeSocket) {
        const terminalName = getCombinedTerminalName(socket.endpoint, this.name);
        const topicName = `terminal:${terminalName}`;

        // 检查是否已有活跃的终端
        let terminal = SubscriptionTerminal.getTerminal(terminalName);

        if (!terminal) {
            // 创建新的终端，但不立即启动
            terminal = SubscriptionTerminal.getOrCreateTerminal(
                this.server,
                terminalName,
                "docker",
                [ "compose", "logs", "-f", "--tail", "100" ],
                this.path
            );
            terminal.enableKeepAlive = true;
            terminal.rows = COMBINED_TERMINAL_ROWS;
            terminal.cols = COMBINED_TERMINAL_COLS;

            log.debug("SubscriptionStack", `Created combined terminal for stack: ${this.name}`);
        }

        // 订阅终端
        terminal.subscribe(socket);

        // 只在第一个订阅者时启动终端
        const activeSubscribers = this.eventPublisher.getActiveSubscriberCount(topicName);
        if (activeSubscribers === 1) {
            terminal.start();
            log.debug("SubscriptionStack", `Started combined terminal for stack: ${this.name} (first subscriber)`);
        } else {
            log.debug("SubscriptionStack", `Joined existing combined terminal for stack: ${this.name} (${activeSubscribers} subscribers)`);
        }
    }

    async leaveCombinedTerminal(socket: DockgeSocket) {
        const terminalName = getCombinedTerminalName(socket.endpoint, this.name);
        const terminal = SubscriptionTerminal.getTerminal(terminalName);
        if (terminal) {
            terminal.unsubscribe(socket);

            // 如果没有订阅者了，终端会自动关闭（通过 keepAlive 机制）
            const activeSubscribers = this.eventPublisher.getActiveSubscriberCount(`terminal:${terminalName}`);
            log.debug("SubscriptionStack", `Left combined terminal for stack: ${this.name} (${activeSubscribers} remaining subscribers)`);
        }
    }

    async joinContainerTerminal(socket: DockgeSocket, serviceName: string, shell: string = "sh", index: number = 0) {
        const terminalName = getContainerExecTerminalName(socket.endpoint, this.name, serviceName, index);
        let terminal = SubscriptionTerminal.getTerminal(terminalName);

        if (!terminal) {
            terminal = new SubscriptionInteractiveTerminal(this.server, terminalName, "docker", [ "compose", "exec", serviceName, shell ], this.path);
            terminal.rows = TERMINAL_ROWS;
            log.debug("SubscriptionStack", "Container terminal created");
        }

        terminal.subscribe(socket);
        terminal.start();
    }

    async getServiceStatusList() {
        let statusList = new Map<string, number>();

        try {
            const dockerClient = DockerClient.getInstance();
            let res = await dockerClient.composeExec([ "ps", "--format", "json" ], this.path);

            if (!res.stdout) {
                return statusList;
            }

            let lines = res.stdout?.toString().split("\n");

            for (let line of lines) {
                try {
                    let obj = JSON.parse(line);
                    if (obj.Health === "") {
                        statusList.set(obj.Service, obj.State);
                    } else {
                        statusList.set(obj.Service, obj.Health);
                    }
                } catch (e) {
                }
            }

            return statusList;
        } catch (e) {
            log.error("getServiceStatusList", e);
            return statusList;
        }
    }

    /**
     * 获取组合终端的监听状态
     */
    getCombinedTerminalListenerCount(endpoint: string): number {
        const terminalName = getCombinedTerminalName(endpoint, this.name);
        const topicName = `terminal:${terminalName}`;
        return this.eventPublisher.getActiveSubscriberCount(topicName);
    }

    /**
     * 检查是否有活跃的日志监听者
     */
    hasActiveLogListeners(endpoint: string): boolean {
        const terminalName = getCombinedTerminalName(endpoint, this.name);
        const topicName = `terminal:${terminalName}`;
        return this.eventPublisher.hasActiveSubscribers(topicName);
    }
}
