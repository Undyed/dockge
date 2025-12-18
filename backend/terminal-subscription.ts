import { DockgeServer } from "./dockge-server";
import * as os from "node:os";
import * as pty from "@homebridge/node-pty-prebuilt-multiarch";
import { LimitQueue } from "./utils/limit-queue";
import { DockgeSocket } from "./util-server";
import {
    PROGRESS_TERMINAL_ROWS,
    TERMINAL_COLS,
    TERMINAL_ROWS
} from "../common/util-common";
import { sync as commandExistsSync } from "command-exists";
import { log } from "./log";
import { EventPublisher } from "./event-publisher";

/**
 * 基于订阅模式的终端类
 */
export class SubscriptionTerminal {
    protected static terminalMap: Map<string, SubscriptionTerminal> = new Map();

    protected _ptyProcess?: pty.IPty;
    protected server: DockgeServer;
    protected buffer: LimitQueue<string> = new LimitQueue(100);
    protected _name: string;
    protected topicName: string; // 订阅主题名称

    protected file: string;
    protected args: string | string[];
    protected cwd: string;
    protected callback?: (exitCode: number) => void;

    protected _rows: number = TERMINAL_ROWS;
    protected _cols: number = TERMINAL_COLS;

    public enableKeepAlive: boolean = false;
    protected keepAliveInterval?: NodeJS.Timeout;
    protected kickDisconnectedClientsInterval?: NodeJS.Timeout;

    // 使用事件发布器替代直接的 socket 列表
    protected eventPublisher: EventPublisher;
    protected isDataStreamActive: boolean = false;
    protected dataStreamCheckInterval?: NodeJS.Timeout;

    constructor(server: DockgeServer, name: string, file: string, args: string | string[], cwd: string) {
        this.server = server;
        this._name = name;
        this.topicName = `terminal:${name}`; // 创建主题名称
        this.file = file;
        this.args = args;
        this.cwd = cwd;
        this.eventPublisher = EventPublisher.getInstance();

        SubscriptionTerminal.terminalMap.set(this.name, this);
    }

    get rows() {
        return this._rows;
    }

    set rows(rows: number) {
        this._rows = rows;
        try {
            this.ptyProcess?.resize(this.cols, this.rows);
        } catch (e) {
            if (e instanceof Error) {
                log.debug("SubscriptionTerminal", "Failed to resize terminal: " + e.message);
            }
        }
    }

    get cols() {
        return this._cols;
    }

    set cols(cols: number) {
        this._cols = cols;
        log.debug("SubscriptionTerminal", `Terminal cols: ${this._cols}`);
        try {
            this.ptyProcess?.resize(this.cols, this.rows);
        } catch (e) {
            if (e instanceof Error) {
                log.debug("SubscriptionTerminal", "Failed to resize terminal: " + e.message);
            }
        }
    }

    public start() {
        if (this._ptyProcess) {
            return;
        }

        // 启动数据流监控
        this.startDataStreamMonitoring();

        // 定期检查是否还有订阅者
        if (this.enableKeepAlive) {
            log.debug("SubscriptionTerminal", "Keep alive enabled for terminal " + this.name);

            this.keepAliveInterval = setInterval(() => {
                const activeSubscriberCount = this.eventPublisher.getActiveSubscriberCount(this.topicName);

                if (activeSubscriberCount === 0) {
                    log.debug("SubscriptionTerminal", "Terminal " + this.name + " has no active subscribers, closing...");
                    this.close();
                } else {
                    log.debug("SubscriptionTerminal", "Terminal " + this.name + " has " + activeSubscriberCount + " active subscriber(s)");
                }
            }, 60 * 1000);
        } else {
            log.debug("SubscriptionTerminal", "Keep alive disabled for terminal " + this.name);
        }

        try {
            this._ptyProcess = pty.spawn(this.file, this.args, {
                name: this.name,
                cwd: this.cwd,
                cols: TERMINAL_COLS,
                rows: this.rows,
            });

            // 数据处理 - 只在有监听者时才处理和发布
            this._ptyProcess.onData((data) => {
                // 始终保存到缓冲区，以便新订阅者获取历史数据
                this.buffer.pushItem(data);

                // 只在有活跃订阅者时才发布数据
                if (this.shouldPublishData()) {
                    this.eventPublisher.publish(this.topicName, "terminalWrite", {
                        terminalName: this.name,
                        data: data,
                        timestamp: Date.now()
                    });
                }
            });

            // 退出处理
            this._ptyProcess.onExit(this.exit);
        } catch (error) {
            if (error instanceof Error) {
                clearInterval(this.keepAliveInterval);

                log.error("SubscriptionTerminal", "Failed to start terminal: " + error.message);
                const exitCode = Number(error.message.split(" ").pop());
                this.exit({
                    exitCode,
                });
            }
        }
    }

    /**
     * 退出事件处理
     */
    protected exit = (res: { exitCode: number, signal?: number | undefined }) => {
        // 发布退出事件
        this.eventPublisher.publish(this.topicName, "terminalExit", {
            terminalName: this.name,
            exitCode: res.exitCode,
            timestamp: Date.now()
        });

        SubscriptionTerminal.terminalMap.delete(this.name);
        log.debug("SubscriptionTerminal", "Terminal " + this.name + " exited with code " + res.exitCode);

        clearInterval(this.keepAliveInterval);
        clearInterval(this.kickDisconnectedClientsInterval);

        if (this.callback) {
            this.callback(res.exitCode);
        }
    };

    public onExit(callback: (exitCode: number) => void) {
        this.callback = callback;
    }

    /**
     * 订阅终端输出
     */
    public subscribe(socket: DockgeSocket) {
        this.eventPublisher.subscribe(this.topicName, socket);
        log.debug("SubscriptionTerminal", `Socket ${socket.id} subscribed to terminal ${this.name}`);
    }

    /**
     * 取消订阅终端输出
     */
    public unsubscribe(socket: DockgeSocket) {
        this.eventPublisher.unsubscribe(this.topicName, socket);
        log.debug("SubscriptionTerminal", `Socket ${socket.id} unsubscribed from terminal ${this.name}`);
    }

    public get ptyProcess() {
        return this._ptyProcess;
    }

    public get name() {
        return this._name;
    }

    /**
     * 获取终端输出缓冲区
     */
    getBuffer(): string {
        if (this.buffer.length === 0) {
            return "";
        }
        return this.buffer.join("");
    }

    close() {
        clearInterval(this.keepAliveInterval);
        clearInterval(this.dataStreamCheckInterval);
        // 发送 Ctrl+C 到终端
        this.ptyProcess?.write("\x03");
    }

    /**
     * 启动数据流监控
     */
    private startDataStreamMonitoring() {
        this.dataStreamCheckInterval = setInterval(() => {
            const hasActiveSubscribers = this.eventPublisher.hasActiveSubscribers(this.topicName);

            if (hasActiveSubscribers !== this.isDataStreamActive) {
                this.isDataStreamActive = hasActiveSubscribers;

                if (this.isDataStreamActive) {
                    log.debug("SubscriptionTerminal", `Data stream activated for terminal: ${this.name}`);
                } else {
                    log.debug("SubscriptionTerminal", `Data stream deactivated for terminal: ${this.name}`);
                }
            }
        }, 5000); // 每5秒检查一次
    }

    /**
     * 判断是否应该发布数据
     */
    private shouldPublishData(): boolean {
        return this.eventPublisher.hasActiveSubscribers(this.topicName);
    }

    /**
     * 获取数据流状态
     */
    public isDataStreamActiveStatus(): boolean {
        return this.isDataStreamActive;
    }

    /**
     * 获取运行中的终端
     */
    public static getTerminal(name: string): SubscriptionTerminal | undefined {
        return SubscriptionTerminal.terminalMap.get(name);
    }

    public static getOrCreateTerminal(
        server: DockgeServer,
        name: string,
        file: string,
        args: string | string[],
        cwd: string
    ): SubscriptionTerminal {
        let terminal = SubscriptionTerminal.getTerminal(name);
        if (!terminal) {
            terminal = new SubscriptionTerminal(server, name, file, args, cwd);
        }
        return terminal;
    }

    /**
     * 执行命令并返回 Promise
     */
    public static exec(
        server: DockgeServer,
        socket: DockgeSocket | undefined,
        terminalName: string,
        file: string,
        args: string | string[],
        cwd: string
    ): Promise<number> {
        return new Promise((resolve, reject) => {
            // 检查终端是否已存在
            if (SubscriptionTerminal.terminalMap.has(terminalName)) {
                reject("Another operation is already running, please try again later.");
                return;
            }

            let terminal = new SubscriptionTerminal(server, terminalName, file, args, cwd);
            terminal.rows = PROGRESS_TERMINAL_ROWS;

            if (socket) {
                terminal.subscribe(socket);
            }

            terminal.onExit((exitCode: number) => {
                resolve(exitCode);
            });
            terminal.start();
        });
    }

    public static getTerminalCount() {
        return SubscriptionTerminal.terminalMap.size;
    }

    /**
     * 获取所有终端的统计信息
     */
    public static getAllTerminalStats() {
        const terminals = Array.from(SubscriptionTerminal.terminalMap.entries()).map(([ name, terminal ]) => ({
            name,
            isActive: terminal.isDataStreamActiveStatus(),
            subscriberCount: terminal.getSubscriberCount(),
            rows: terminal.rows,
            cols: terminal.cols,
            enableKeepAlive: terminal.enableKeepAlive
        }));

        return {
            totalTerminals: terminals.length,
            activeTerminals: terminals.filter(t => t.isActive).length,
            terminals
        };
    }

    /**
     * 获取订阅者数量
     */
    public getSubscriberCount(): number {
        return this.eventPublisher.getSubscriberCount(this.topicName);
    }
}

/**
 * 基于订阅模式的交互式终端
 */
export class SubscriptionInteractiveTerminal extends SubscriptionTerminal {
    public write(input: string) {
        this.ptyProcess?.write(input);
    }

    resetCWD() {
        const cwd = process.cwd();
        this.ptyProcess?.write(`cd "${cwd}"\r`);
    }
}

/**
 * 基于订阅模式的主终端
 */
export class SubscriptionMainTerminal extends SubscriptionInteractiveTerminal {
    constructor(server: DockgeServer, name: string) {
        let shell;

        // 检查控制台是否启用
        if (!server.config.enableConsole) {
            throw new Error("Console is not enabled.");
        }

        if (os.platform() === "win32") {
            if (commandExistsSync("pwsh.exe")) {
                shell = "pwsh.exe";
            } else {
                shell = "powershell.exe";
            }
        } else {
            shell = "bash";
        }
        super(server, name, shell, [], server.stacksDir);
    }

    public write(input: string) {
        super.write(input);
    }
}
