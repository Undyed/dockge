import "dotenv/config";
import { MainRouter } from "./routers/main-router";
import * as fs from "node:fs";
import { PackageJson } from "type-fest";
import { Database } from "./database";
import packageJSON from "../package.json";
import { log } from "./log";
import * as socketIO from "socket.io";
import express, { Express } from "express";
import { parse } from "ts-command-line-args";
import https from "https";
import http from "http";
import { Router } from "./router";
import { Socket } from "socket.io";
import { MainSocketHandler } from "./socket-handlers/main-socket-handler";
import { SocketHandler } from "./socket-handler";
import { Settings } from "./settings";
import checkVersion from "./check-version";
import dayjs from "dayjs";
import { db } from "./db/knex";
import { SettingRepo } from "./repositories/setting-repo";
import { genSecret, isDev, LooseObject } from "../common/util-common";
import { generatePasswordHash } from "./password-hash";

import { Arguments, Config, DockgeSocket } from "./util-server";
import { DockerSocketHandler } from "./agent-socket-handlers/docker-socket-handler";
import expressStaticGzip from "express-static-gzip";
import path from "path";
import { TerminalSocketHandler } from "./agent-socket-handlers/terminal-socket-handler";
import { FileSocketHandler } from "./agent-socket-handlers/file-socket-handler";
import { Stack } from "./stack";
import { Cron } from "croner";
import gracefulShutdown from "http-graceful-shutdown";
import User from "./models/user";
import { UserRepo } from "./repositories/user-repo";
import { AgentManager } from "./agent-manager";
import { AgentProxySocketHandler } from "./socket-handlers/agent-proxy-socket-handler";
import { AgentSocketHandler } from "./agent-socket-handler";
import { AgentSocket } from "../common/agent-socket";
import { ManageAgentSocketHandler } from "./socket-handlers/manage-agent-socket-handler";
import { Terminal } from "./terminal";
import { DockerClient } from "./docker-client";
import type { SubscriptionIntegration } from "./subscription-integration";

export class DockgeServer {
    app: Express;
    httpServer: http.Server;
    packageJSON: PackageJson;
    io: socketIO.Server;
    config: Config;
    indexHTML: string = "";

    /**
     * List of express routers
     */
    routerList: Router[] = [
        new MainRouter(),
    ];

    /**
     * List of socket handlers (no agent support)
     */
    socketHandlerList: SocketHandler[] = [
        new MainSocketHandler(),
        new ManageAgentSocketHandler(),
    ];

    agentProxySocketHandler = new AgentProxySocketHandler();

    /**
     * List of socket handlers (support agent)
     */
    agentSocketHandlerList: AgentSocketHandler[] = [
        new DockerSocketHandler(),
        new TerminalSocketHandler(),
        new FileSocketHandler(),
    ];

    /**
     * 订阅模式相关
     */
    subscriptionIntegration?: SubscriptionIntegration;
    info: LooseObject = {};

    /**
     * Show Setup Page
     */
    needSetup = false;

    jwtSecret: string = "";

    stacksDir: string = "";

    /**
     *
     */
    constructor() {
        // Catch unexpected errors here
        let unexpectedErrorHandler = (error: unknown) => {
            console.trace(error);
            console.error("If you keep encountering errors, please report to https://github.com/louislam/dockge");
        };
        process.addListener("unhandledRejection", unexpectedErrorHandler);
        process.addListener("uncaughtException", unexpectedErrorHandler);

        if (!process.env.NODE_ENV) {
            process.env.NODE_ENV = "production";
        }

        // Log NODE ENV
        log.info("server", "NODE_ENV: " + process.env.NODE_ENV);

        // Default stacks directory
        let defaultStacksDir;
        if (process.platform === "win32") {
            defaultStacksDir = "./stacks";
        } else {
            defaultStacksDir = "/opt/stacks";
        }

        // Define all possible arguments
        let args = parse<Arguments>({
            sslKey: {
                type: String,
                optional: true,
            },
            sslCert: {
                type: String,
                optional: true,
            },
            sslKeyPassphrase: {
                type: String,
                optional: true,
            },
            port: {
                type: Number,
                optional: true,
            },
            hostname: {
                type: String,
                optional: true,
            },
            dataDir: {
                type: String,
                optional: true,
            },
            stacksDir: {
                type: String,
                optional: true,
            },
            enableConsole: {
                type: Boolean,
                optional: true,
                defaultValue: false,
            }
        });

        this.config = args as Config;

        // Load from environment variables or default values if args are not set
        this.config.sslKey = args.sslKey || process.env.DOCKGE_SSL_KEY || undefined;
        this.config.sslCert = args.sslCert || process.env.DOCKGE_SSL_CERT || undefined;
        this.config.sslKeyPassphrase = args.sslKeyPassphrase || process.env.DOCKGE_SSL_KEY_PASSPHRASE || undefined;
        this.config.port = args.port || Number(process.env.DOCKGE_PORT) || 5001;
        this.config.hostname = args.hostname || process.env.DOCKGE_HOSTNAME || undefined;
        this.config.dataDir = args.dataDir || process.env.DOCKGE_DATA_DIR || "./data/";
        this.config.stacksDir = args.stacksDir || process.env.DOCKGE_STACKS_DIR || defaultStacksDir;
        this.config.enableConsole = args.enableConsole || process.env.DOCKGE_ENABLE_CONSOLE === "true" || false;
        this.stacksDir = this.config.stacksDir;

        log.debug("server", this.config);

        this.packageJSON = packageJSON as PackageJson;

        try {
            this.indexHTML = fs.readFileSync("./frontend-dist/index.html").toString();
        } catch (e) {
            // "dist/index.html" is not necessary for development
            if (process.env.NODE_ENV !== "development") {
                log.error("server", "Error: Cannot find 'frontend-dist/index.html', did you install correctly?");
                process.exit(1);
            }
        }

        // Create express
        this.app = express();

        // Create HTTP server
        if (this.config.sslKey && this.config.sslCert) {
            log.info("server", "Server Type: HTTPS");
            this.httpServer = https.createServer({
                key: fs.readFileSync(this.config.sslKey),
                cert: fs.readFileSync(this.config.sslCert),
                passphrase: this.config.sslKeyPassphrase,
            }, this.app);
        } else {
            log.info("server", "Server Type: HTTP");
            this.httpServer = http.createServer(this.app);
        }

        // Binding Routers
        for (const router of this.routerList) {
            this.app.use(router.create(this.app, this));
        }

        // Static files
        this.app.use("/", expressStaticGzip("frontend-dist", {
            enableBrotli: true,
        }));

        // Universal Route Handler, must be at the end of all express routes.
        this.app.get("*", async (_request, response) => {
            response.send(this.indexHTML);
        });

        // Allow all CORS origins in development
        let cors = undefined;
        if (isDev) {
            cors = {
                origin: "*",
            };
        }

        // Create Socket.io
        this.io = new socketIO.Server(this.httpServer, {
            cors,
            allowRequest: (req, callback) => {
                let isOriginValid = true;
                const bypass = isDev || process.env.UPTIME_KUMA_WS_ORIGIN_CHECK === "bypass";

                if (!bypass) {
                    let host = req.headers.host;

                    // If this is set, it means the request is from the browser
                    let origin = req.headers.origin;

                    // If this is from the browser, check if the origin is allowed
                    if (origin) {
                        try {
                            let originURL = new URL(origin);

                            if (host !== originURL.host) {
                                isOriginValid = false;
                                log.error("auth", `Origin (${origin}) does not match host (${host}), IP: ${req.socket.remoteAddress}`);
                            }
                        } catch (e) {
                            // Invalid origin url, probably not from browser
                            isOriginValid = false;
                            log.error("auth", `Invalid origin url (${origin}), IP: ${req.socket.remoteAddress}`);
                        }
                    } else {
                        log.info("auth", `Origin is not set, IP: ${req.socket.remoteAddress}`);
                    }
                } else {
                    log.debug("auth", "Origin check is bypassed");
                }

                callback(null, isOriginValid);
            }
        });

        this.io.on("connection", async (socket: Socket) => {
            let dockgeSocket = socket as DockgeSocket;
            dockgeSocket.instanceManager = new AgentManager(dockgeSocket);
            dockgeSocket.emitAgent = (event: string, ...args: unknown[]) => {
                let obj = args[0];
                if (typeof (obj) === "object") {
                    let obj2 = obj as LooseObject;
                    obj2.endpoint = dockgeSocket.endpoint;
                }
                dockgeSocket.emit("agent", event, ...args);
            };

            // 前端在握手阶段上报的能力标记（可选）
            const rawClientFeatures: unknown = (socket.handshake as unknown as {
                auth?: {
                    clientFeatures?: unknown;
                };
            })?.auth?.clientFeatures;
            if (Array.isArray(rawClientFeatures)) {
                dockgeSocket.clientFeatures = rawClientFeatures.filter((x) => typeof x === "string");
            } else if (typeof rawClientFeatures === "string") {
                dockgeSocket.clientFeatures = [ rawClientFeatures ];
            }

            if (typeof (socket.request.headers.endpoint) === "string") {
                dockgeSocket.endpoint = socket.request.headers.endpoint;
            } else {
                dockgeSocket.endpoint = "";
            }

            if (dockgeSocket.endpoint) {
                log.info("server", "Socket connected (agent), as endpoint " + dockgeSocket.endpoint);
            } else {
                log.info("server", "Socket connected (direct)");
            }

            this.sendInfo(dockgeSocket, true);

            if (this.needSetup) {
                log.info("server", "Redirect to setup page");
                dockgeSocket.emit("setup");
            }

            // Create socket handlers (original, no agent support)
            for (const socketHandler of this.socketHandlerList) {
                socketHandler.create(dockgeSocket, this);
            }

            // Create Agent Socket
            let agentSocket = new AgentSocket();

            // Create agent socket handlers
            for (const socketHandler of this.agentSocketHandlerList) {
                socketHandler.create(dockgeSocket, this, agentSocket);
            }

            // Create agent proxy socket handlers
            this.agentProxySocketHandler.create2(dockgeSocket, this, agentSocket);

            // ***************************
            // Better do anything after added all socket handlers here
            // ***************************

            log.debug("auth", "check auto login");
            if (await Settings.get("disableAuth")) {
                log.info("auth", "Disabled Auth: auto login to admin");
                const row = await UserRepo.getFirstUser();
                if (row) {
                    this.afterLogin(dockgeSocket, row as unknown as User);
                }
                dockgeSocket.emit("autoLogin");
            } else {
                log.debug("auth", "need auth");
            }

            // Socket disconnect
            dockgeSocket.on("disconnect", () => {
                log.info("server", "Socket disconnected!");
                dockgeSocket.instanceManager.disconnectAll();
            });

        });

        this.io.on("disconnect", () => {

        });

        if (isDev) {
            setInterval(() => {
                log.debug("terminal", "Terminal count: " + Terminal.getTerminalCount());
            }, 5000);
        }
    }

    async afterLogin(socket: DockgeSocket, user: User) {
        socket.userID = user.id;
        socket.join(user.id.toString());

        this.sendInfo(socket);

        try {
            this.sendStackList();
        } catch (e) {
            log.error("server", e);
        }

        socket.instanceManager.sendAgentList();

        // Also connect to other dockge instances
        socket.instanceManager.connectAll();
    }

    /**
     *
     */
    async serve() {
        // Create all the necessary directories
        this.initDataDir();

        // Connect to database
        try {
            await Database.init(this);
        } catch (e) {
            if (e instanceof Error) {
                log.error("server", "Failed to prepare your database: " + e.message);
            }
            process.exit(1);
        }

        // First time setup if needed
        const existingSecret = await SettingRepo.getValueByKey("jwtSecret");

        const normalizeJwtSecret = (raw: string) => {
            try {
                const parsed = JSON.parse(raw);
                return typeof parsed === "string" ? parsed : raw;
            } catch {
                return raw;
            }
        };

        if (!existingSecret) {
            log.info("server", "JWT secret is not found, generate one.");
            const newSecret = generatePasswordHash(genSecret());
            await SettingRepo.set("jwtSecret", newSecret, null);
            this.jwtSecret = newSecret;
            log.info("server", "Stored JWT secret into database");
        } else {
            log.debug("server", "Load JWT secret from database.");
            this.jwtSecret = normalizeJwtSecret(existingSecret);
        }

        const userCount = Number((await db("user").count("id as count").first())?.count);

        log.debug("server", "User count: " + userCount);

        // If there is no record in user table, it is a new Dockge instance, need to setup
        if (userCount == 0) {
            log.info("server", "No user, need setup");
            this.needSetup = true;
        }

        // 初始化订阅模式
        await this.initSubscriptionMode();

        // Listen
        this.httpServer.listen(this.config.port, this.config.hostname, async () => {
            if (this.config.hostname) {
                log.info("server", `Listening on ${this.config.hostname}:${this.config.port}`);
            } else {
                log.info("server", `Listening on ${this.config.port}`);
            }

            const eventsEnabled = await this.startDockerEventMonitor();
            const pollingIntervalSeconds = eventsEnabled ? 60 : 10;

            // Poll stack list periodically (faster when Docker events are unavailable)
            Cron(`*/${pollingIntervalSeconds} * * * * *`, {
                protect: true,  // Enabled over-run protection.
            }, () => {
                //log.debug("server", "Cron job running");
                this.sendStackList(true);
            });

            checkVersion.startInterval();
        });

        gracefulShutdown(this.httpServer, {
            signals: "SIGINT SIGTERM",
            timeout: 30000,                   // timeout: 30 secs
            development: false,               // not in dev mode
            forceExit: true,                  // triggers process.exit() at the end of shutdown process
            onShutdown: (signal) => this.shutdownFunction(signal),     // shutdown function (async) - e.g. for cleanup DB, ...
            finally: () => this.finalFunction(),            // finally function (sync) - e.g. for logging
        });

    }

    /**
     * 初始化订阅模式（可选能力，失败不应阻塞启动）
     */
    private async initSubscriptionMode() {
        try {
            const { SubscriptionIntegration } = await import("./subscription-integration");

            // 保存引用，便于后续扩展/关闭
            this.subscriptionIntegration = SubscriptionIntegration.getInstance();
            this.subscriptionIntegration.enable(this);
        } catch (e) {
            if (e instanceof Error) {
                log.warn("server", `Failed to init subscription mode: ${e.message}`);
            } else {
                log.warn("server", "Failed to init subscription mode");
            }
        }
    }

    /**
     * Emits the version information to the client.
     * @param socket Socket.io socket instance
     * @param hideVersion Should we hide the version information in the response?
     * @returns
     */
    async sendInfo(socket: Socket, hideVersion = false) {
        let versionProperty;
        let latestVersionProperty;
        let isContainer;

        if (!hideVersion) {
            versionProperty = packageJSON.version;
            latestVersionProperty = checkVersion.latestVersion;
            isContainer = (process.env.DOCKGE_IS_CONTAINER === "1");
        }

        const serverInfo: LooseObject = {
            version: versionProperty,
            latestVersion: latestVersionProperty,
            isContainer,
            primaryHostname: await Settings.get("primaryHostname"),
            //serverTimezoneOffset: this.getTimezoneOffset(),
        };

        // 合并服务器信息和特性（例如 subscription-mode）
        const extraInfo = this.info ?? {};
        const features = Array.isArray(extraInfo.features) ? extraInfo.features : [];

        socket.emit("info", {
            ...serverInfo,
            ...extraInfo,
            features,
        });
    }

    /**
     * Get the IP of the client connected to the socket
     * @param {Socket} socket Socket to query
     * @returns IP of client
     */
    async getClientIP(socket: Socket): Promise<string> {
        let clientIP = socket.client.conn.remoteAddress;

        if (clientIP === undefined) {
            clientIP = "";
        }

        if (await Settings.get("trustProxy")) {
            const forwardedFor = socket.client.conn.request.headers["x-forwarded-for"];

            if (typeof forwardedFor === "string") {
                return forwardedFor.split(",")[0].trim();
            } else if (typeof socket.client.conn.request.headers["x-real-ip"] === "string") {
                return socket.client.conn.request.headers["x-real-ip"];
            }
        }
        return clientIP.replace(/^::ffff:/, "");
    }

    /**
     * Attempt to get the current server timezone
     * If this fails, fall back to environment variables and then make a
     * guess.
     * @returns {Promise<string>} Current timezone
     */
    async getTimezone() {
        // From process.env.TZ
        try {
            if (process.env.TZ) {
                this.checkTimezone(process.env.TZ);
                return process.env.TZ;
            }
        } catch (e) {
            if (e instanceof Error) {
                log.warn("timezone", e.message + " in process.env.TZ");
            }
        }

        const timezone = await Settings.get("serverTimezone");

        // From Settings
        try {
            log.debug("timezone", "Using timezone from settings: " + timezone);
            if (timezone) {
                this.checkTimezone(timezone);
                return timezone;
            }
        } catch (e) {
            if (e instanceof Error) {
                log.warn("timezone", e.message + " in settings");
            }
        }

        // Guess
        try {
            const guess = dayjs.tz.guess();
            log.debug("timezone", "Guessing timezone: " + guess);
            if (guess) {
                this.checkTimezone(guess);
                return guess;
            } else {
                return "UTC";
            }
        } catch (e) {
            // Guess failed, fall back to UTC
            log.debug("timezone", "Guessed an invalid timezone. Use UTC as fallback");
            return "UTC";
        }
    }

    /**
     * Get the current offset
     * @returns {string} Time offset
     */
    getTimezoneOffset() {
        return dayjs().format("Z");
    }

    /**
     * Throw an error if the timezone is invalid
     * @param {string} timezone Timezone to test
     * @returns {void}
     * @throws The timezone is invalid
     */
    checkTimezone(timezone: string) {
        try {
            dayjs.utc("2013-11-18 11:55").tz(timezone).format();
        } catch (e) {
            throw new Error("Invalid timezone:" + timezone);
        }
    }

    /**
     * Initialize the data directory
     */
    initDataDir() {
        if (!fs.existsSync(this.config.dataDir)) {
            fs.mkdirSync(this.config.dataDir, { recursive: true });
        }

        // Check if a directory
        if (!fs.lstatSync(this.config.dataDir).isDirectory()) {
            throw new Error(`Fatal error: ${this.config.dataDir} is not a directory`);
        }

        // Create data/stacks directory
        if (!fs.existsSync(this.stacksDir)) {
            fs.mkdirSync(this.stacksDir, { recursive: true });
        }

        log.info("server", `Data Dir: ${this.config.dataDir}`);

        // Check Docker version
        this.checkDockerVersion();
    }

    /**
     * Check and log Docker version information
     */
    async checkDockerVersion() {
        try {
            const dockerClient = DockerClient.getInstance();
            const versionInfo = await dockerClient.getVersion();
            log.info("server", `Docker Version: ${versionInfo.version} (API: ${versionInfo.apiVersion})`);

            const isAvailable = await dockerClient.isDockerAvailable();
            if (!isAvailable) {
                log.warn("server", "Docker daemon is not accessible. Please check your Docker installation.");
            }
        } catch (e) {
            if (e instanceof Error) {
                log.error("server", "Failed to check Docker version: " + e.message);
            }
        }
    }

    /**
     * Init or reset JWT secret
     * @returns  JWT secret
     */
    async initJWTSecret(): Promise<void> {
        const value = generatePasswordHash(genSecret());
        await SettingRepo.set("jwtSecret", value, null);
    }

    /**
     * Send stack list to all connected sockets
     * @param useCache
     */
    async sendStackList(useCache = false, skipStatusUpdate = false) {
        let socketList = this.io.sockets.sockets.values();

        let stackList;

        for (let socket of socketList) {
            let dockgeSocket = socket as DockgeSocket;

            // Check if the room is a number (user id)
            if (dockgeSocket.userID) {

                // Get the list only if there is a logged in user
                if (!stackList) {
                    stackList = await Stack.getStackList(this, useCache, skipStatusUpdate);
                }

                let map: Map<string, object> = new Map();

                for (let [ stackName, stack ] of stackList) {
                    map.set(stackName, stack.toSimpleJSON(dockgeSocket.endpoint));
                }

                log.debug("server", "Send stack list to user: " + dockgeSocket.id + " (" + dockgeSocket.endpoint + ")");
                dockgeSocket.emitAgent("stackList", {
                    ok: true,
                    stackList: Object.fromEntries(map),
                });
            }
        }
    }

    async getDockerNetworkList(): Promise<string[]> {
        const dockerClient = DockerClient.getInstance();
        return await dockerClient.getNetworkList();
    }

    get stackDirFullPath() {
        return path.resolve(this.stacksDir);
    }

    /**
     * Shutdown the application
     * Stops all monitors and closes the database connection.
     * @param signal The signal that triggered this function to be called.
     */
    async shutdownFunction(signal: string | undefined) {
        log.info("server", "Shutdown requested");
        log.info("server", "Called signal: " + signal);

        // Clean up Docker event stream
        this.cleanupDockerEventStream();
        this.pendingEventProjectNames.clear();

        if (this.eventStatusSyncTimeout) {
            clearTimeout(this.eventStatusSyncTimeout);
            this.eventStatusSyncTimeout = null;
        }

        if (this.dockerEventReconnectTimeout) {
            clearTimeout(this.dockerEventReconnectTimeout);
            this.dockerEventReconnectTimeout = null;
        }

        // TODO: Close all terminals?

        await Database.close();
        Settings.stopCacheCleaner();
    }

    /**
     * Final function called before application exits
     */
    finalFunction() {
        log.info("server", "Graceful shutdown successful!");
    }

    /**
     * Force connected sockets of a user to refresh and disconnect.
     * Used for resetting password.
     * @param {string} userID
     * @param {string?} currentSocketID
     */
    disconnectAllSocketClients(userID: number | undefined, currentSocketID?: string) {
        for (const rawSocket of this.io.sockets.sockets.values()) {
            let socket = rawSocket as DockgeSocket;
            if ((!userID || socket.userID === userID) && socket.id !== currentSocketID) {
                try {
                    socket.emit("refresh");
                    socket.disconnect();
                } catch (e) {

                }
            }
        }
    }

    isSSL() {
        return this.config.sslKey && this.config.sslCert;
    }

    getLocalWebSocketURL() {
        const protocol = this.isSSL() ? "wss" : "ws";
        const host = this.config.hostname || "localhost";
        return `${protocol}://${host}:${this.config.port}`;
    }

    private dockerEventReconnectAttempts = 0;
    private readonly maxDockerEventReconnectAttempts = 10;
    private dockerEventStream: NodeJS.ReadableStream | null = null;
    private dockerEventReconnectTimeout: NodeJS.Timeout | null = null;
    private dockerEventMonitorStarting = false;

    private pendingEventProjectNames = new Set<string>();
    private eventStatusSyncTimeout: NodeJS.Timeout | null = null;
    private eventStatusSyncInProgress = false;

    async startDockerEventMonitor(): Promise<boolean> {
        if (this.dockerEventStream) {
            return true;
        }

        if (this.dockerEventMonitorStarting) {
            return false;
        }

        this.dockerEventMonitorStarting = true;
        const client = DockerClient.getInstance();

        try {
            const stream = await client.getEvents();

            if (!stream) {
                log.warn("server", "Docker event monitoring disabled - API not available");
                return false;
            }

            this.dockerEventStream = stream;
            let buffer = "";

            stream.on("data", async (chunk) => {
                // Reset reconnect attempts on successful data
                this.dockerEventReconnectAttempts = 0;

                buffer += chunk.toString();
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.trim()) {
                        continue;
                    }
                    try {
                        const event = JSON.parse(line);
                        if (event.Type === "container" && event.Actor?.Attributes) {
                            const projectName = event.Actor.Attributes["com.docker.compose.project"];
                            if (projectName) {
                                this.scheduleEventStatusSync(projectName);
                            }
                        }
                    } catch (e) {
                        // Ignore invalid JSON (partial data)
                    }
                }
            });

            stream.on("error", (err) => {
                log.error("server", "Docker event stream error: " + (err instanceof Error ? err.message : String(err)));
                this.scheduleDockerEventReconnect();
            });

            stream.on("end", () => {
                log.warn("server", "Docker event stream ended unexpectedly");
                this.scheduleDockerEventReconnect();
            });

            stream.on("close", () => {
                log.debug("server", "Docker event stream closed");
                // Only reconnect if this wasn't intentional (e.g., during shutdown)
                if (this.dockerEventStream) {
                    this.scheduleDockerEventReconnect();
                }
            });

            log.info("server", "Docker event monitor started");
            return true;
        } catch (e) {
            log.error("server", "Failed to start Docker event monitor: " + (e instanceof Error ? e.message : String(e)));
            this.scheduleDockerEventReconnect();
            return false;
        } finally {
            this.dockerEventMonitorStarting = false;
        }
    }

    private scheduleDockerEventReconnect() {
        if (this.dockerEventReconnectTimeout) {
            return;
        }

        // Clean up current stream
        this.cleanupDockerEventStream();

        if (this.dockerEventReconnectAttempts < this.maxDockerEventReconnectAttempts) {
            this.dockerEventReconnectAttempts++;
            // Exponential backoff: 2s, 4s, 8s, 16s, ... max 5 minutes
            const delay = Math.min(2000 * Math.pow(2, this.dockerEventReconnectAttempts - 1), 300000);
            log.info("server", `Reconnecting to Docker events in ${delay / 1000}s (attempt ${this.dockerEventReconnectAttempts}/${this.maxDockerEventReconnectAttempts})`);

            this.dockerEventReconnectTimeout = setTimeout(() => {
                this.dockerEventReconnectTimeout = null;
                void this.startDockerEventMonitor();
            }, delay);
        } else {
            log.error("server", "Max reconnect attempts reached for Docker events. Event monitoring disabled.");
            log.info("server", "Stack status will still be updated via periodic polling.");
        }
    }

    private scheduleEventStatusSync(projectName: string) {
        this.pendingEventProjectNames.add(projectName);

        if (this.eventStatusSyncTimeout) {
            return;
        }

        // Debounce multiple events into a single status update & push.
        this.eventStatusSyncTimeout = setTimeout(() => {
            this.eventStatusSyncTimeout = null;
            void this.flushEventStatusSync();
        }, 1000);
    }

    private async flushEventStatusSync() {
        if (this.eventStatusSyncInProgress) {
            // Let the pending set accumulate; the next timer tick will flush.
            if (!this.eventStatusSyncTimeout) {
                this.eventStatusSyncTimeout = setTimeout(() => {
                    this.eventStatusSyncTimeout = null;
                    void this.flushEventStatusSync();
                }, 1000);
            }
            return;
        }

        this.eventStatusSyncInProgress = true;
        try {
            const projectNames = Array.from(this.pendingEventProjectNames);
            this.pendingEventProjectNames.clear();

            if (projectNames.length === 0) {
                return;
            }

            const stackList = await Stack.getStackList(this, true, true);
            let changedAny = false;

            for (const projectName of projectNames) {
                const stack = stackList.get(projectName);
                if (!stack) {
                    continue;
                }

                const changed = await stack.syncStatus();
                if (changed) {
                    changedAny = true;
                }
            }

            if (changedAny) {
                log.debug("server", "Stack status changed (Event), sending update");
                await this.sendStackList(true, true);
            }
        } finally {
            this.eventStatusSyncInProgress = false;
        }
    }

    private cleanupDockerEventStream() {
        if (this.dockerEventStream) {
            try {
                // Remove all listeners to prevent memory leaks
                this.dockerEventStream.removeAllListeners();
                // Attempt to destroy the stream if possible
                if ("destroy" in this.dockerEventStream && typeof this.dockerEventStream.destroy === "function") {
                    this.dockerEventStream.destroy();
                }
            } catch (e) {
                log.debug("server", "Error cleaning up Docker event stream: " + (e instanceof Error ? e.message : String(e)));
            }
            this.dockerEventStream = null;
        }
    }

}
