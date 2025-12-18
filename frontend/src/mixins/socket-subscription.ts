import { io } from "socket.io-client";
import { Socket } from "socket.io-client";
import { defineComponent } from "vue";
import jwtDecode from "jwt-decode";
import { Terminal } from "@xterm/xterm";
import { AgentSocket } from "../../../common/agent-socket";

let socket: Socket;
let terminalMap: Map<string, Terminal> = new Map();
let terminalEndpointMap: Map<string, string> = new Map();

// 批量处理配置
const batchConfig = {
    maxBatchSize: 50,
    batchTimeout: 100,
    enableOptimization: true
};

type AgentResponse = {
    ok: boolean;
    msg?: string;
    [key: string]: unknown;
};

type AgentCallback<T = AgentResponse> = (res: T) => void;

// 终端输出优化器
class TerminalOutputOptimizer {
    private pendingWrites: Map<string, string[]> = new Map();
    private writeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    public addWrite(terminalName: string, data: string) {
        if (!batchConfig.enableOptimization) {
            // 直接写入
            const terminal = terminalMap.get(terminalName);
            if (terminal) {
                terminal.write(data);
            }
            return;
        }

        // 添加到待处理队列
        if (!this.pendingWrites.has(terminalName)) {
            this.pendingWrites.set(terminalName, []);
        }

        const pending = this.pendingWrites.get(terminalName)!;
        pending.push(data);

        // 如果达到最大批量大小，立即刷新
        if (pending.length >= batchConfig.maxBatchSize) {
            this.flushWrites(terminalName);
            return;
        }

        // 设置定时器
        if (!this.writeTimers.has(terminalName)) {
            const timer = setTimeout(() => {
                this.flushWrites(terminalName);
            }, batchConfig.batchTimeout);

            this.writeTimers.set(terminalName, timer);
        }
    }

    private flushWrites(terminalName: string) {
        const pending = this.pendingWrites.get(terminalName);
        if (!pending || pending.length === 0) {
            return;
        }

        const terminal = terminalMap.get(terminalName);
        if (terminal) {
            // 合并所有待写入的数据
            const combinedData = pending.join("");
            terminal.write(combinedData);
        }

        // 清理资源
        this.pendingWrites.delete(terminalName);

        const timer = this.writeTimers.get(terminalName);
        if (timer) {
            clearTimeout(timer);
            this.writeTimers.delete(terminalName);
        }
    }

    public flush(terminalName?: string) {
        if (terminalName) {
            this.flushWrites(terminalName);
        } else {
            // 刷新所有终端
            for (const name of this.pendingWrites.keys()) {
                this.flushWrites(name);
            }
        }
    }
}

const terminalOptimizer = new TerminalOutputOptimizer();

export default defineComponent({
    data() {
        return {
            socketIO: {
                token: null,
                firstConnect: true,
                connected: false,
                connectCount: 0,
                initedSocketIO: false,
                connectionErrorMsg: `${this.$t("Cannot connect to the socket server.")} ${this.$t("Reconnecting...")}`,
                showReverseProxyGuide: true,
                connecting: false,
            },
            info: {},
            remember: (localStorage.remember !== "0"),
            loggedIn: false,
            allowLoginDialog: false,
            username: null,
            composeTemplate: "",
            stackList: {},
            allAgentStackList: {} as Record<string, object>,
            agentStatusList: {},
            agentList: {},

            // 订阅管理
            subscriptions: new Set<string>(),
        };
    },

    computed: {
        agentCount() {
            return Object.keys(this.agentList).length;
        },

        completeStackList() {
            let list: Record<string, object> = {};

            for (let stackName in this.stackList) {
                list[stackName + "_"] = this.stackList[stackName];
            }

            for (let endpoint in this.allAgentStackList) {
                let instance = this.allAgentStackList[endpoint];
                for (let stackName in instance.stackList) {
                    list[stackName + "_" + endpoint] = instance.stackList[stackName];
                }
            }
            return list;
        },

        usernameFirstChar() {
            if (typeof this.username == "string" && this.username.length >= 1) {
                return this.username.charAt(0).toUpperCase();
            } else {
                return "🐬";
            }
        },

        frontendVersion() {
            // eslint-disable-next-line no-undef
            return FRONTEND_VERSION;
        },

        isFrontendBackendVersionMatched() {
            if (!this.info.version) {
                return true;
            }
            return this.info.version === this.frontendVersion;
        },
    },

    watch: {
        "socketIO.connected"() {
            if (this.socketIO.connected) {
                this.agentStatusList[""] = "online";
            } else {
                this.agentStatusList[""] = "offline";
            }
        },

        remember() {
            localStorage.remember = (this.remember) ? "1" : "0";
        },

        "info.version"(to, from) {
            if (from && from !== to) {
                window.location.reload();
            }
        },
    },

    created() {
        this.initSocketIO();
    },

    mounted() {
        // 页面卸载时刷新所有待处理的终端输出
        window.addEventListener("beforeunload", () => {
            terminalOptimizer.flush();
        });
    },

    methods: {
        endpointDisplayFunction(endpoint: string) {
            if (endpoint) {
                return endpoint;
            } else {
                return this.$t("currentEndpoint");
            }
        },

        initSocketIO(bypass = false) {
            if (this.socketIO.initedSocketIO) {
                return;
            }

            this.socketIO.initedSocketIO = true;
            let url: string;
            const env = process.env.NODE_ENV || "production";
            if (env === "development" || localStorage.dev === "dev") {
                url = location.protocol + "//" + location.hostname + ":5001";
            } else {
                url = location.protocol + "//" + location.host;
            }

            let connectingMsgTimeout = setTimeout(() => {
                this.socketIO.connecting = true;
            }, 1500);

            socket = io(url, {
                auth: {
                    clientFeatures: [ "subscription-mode" ],
                },
            });

            // 处理来自代理的事件
            let agentSocket = new AgentSocket();
            socket.on("agent", (eventName: unknown, ...args: unknown[]) => {
                agentSocket.call(eventName, ...args);
            });

            socket.on("connect", () => {
                console.log("Connected to the socket server");

                clearTimeout(connectingMsgTimeout);
                this.socketIO.connecting = false;
                this.socketIO.connectCount++;
                this.socketIO.connected = true;
                this.socketIO.showReverseProxyGuide = false;

                const token = this.storage().token;

                if (token) {
                    if (token !== "autoLogin") {
                        console.log("Logging in by token");
                        this.loginByToken(token);
                    } else {
                        setTimeout(() => {
                            if (!this.loggedIn) {
                                this.allowLoginDialog = true;
                                this.storage().removeItem("token");
                            }
                        }, 5000);
                    }
                } else {
                    this.allowLoginDialog = true;
                }

                this.socketIO.firstConnect = false;
            });

            socket.on("disconnect", () => {
                console.log("disconnect");
                this.socketIO.connectionErrorMsg = `${this.$t("Lost connection to the socket server. Reconnecting...")}`;
                this.socketIO.connected = false;
            });

            socket.on("connect_error", (err) => {
                console.error(`Failed to connect to the backend. Socket.io connect_error: ${err.message}`);
                this.socketIO.connectionErrorMsg = `${this.$t("Cannot connect to the socket server.")} [${err}] ${this.$t("reconnecting...")}`;
                this.socketIO.showReverseProxyGuide = true;
                this.socketIO.connected = false;
                this.socketIO.firstConnect = false;
                this.socketIO.connecting = false;
            });

            // 自定义事件
            socket.on("info", (info) => {
                this.info = info;
            });

            socket.on("autoLogin", () => {
                this.loggedIn = true;
                this.storage().token = "autoLogin";
                this.socketIO.token = "autoLogin";
                this.allowLoginDialog = false;
                this.afterLogin();
            });

            socket.on("setup", () => {
                console.log("setup");
                this.$router.push("/setup");
            });

            // 处理单个终端写入事件（兼容旧版本）
            agentSocket.on("terminalWrite", (terminalName, data) => {
                terminalOptimizer.addWrite(terminalName, data);
            });

            // 处理批量终端写入事件（新的订阅模式）
            agentSocket.on("batchTerminalWrite", (topic, events) => {
                console.debug(`Received batch terminal write for topic: ${topic}, count: ${events.length}`);

                for (const event of events) {
                    terminalOptimizer.addWrite(event.terminalName, event.data);
                }
            });

            // 处理其他批量事件
            agentSocket.on("batchEvents", (topic, events) => {
                console.debug(`Received batch events for topic: ${topic}, count: ${events.length}`);

                for (const event of events) {
                    if (event.eventName === "terminalExit") {
                        const { terminalName, exitCode } = event.data;
                        console.log(`Terminal ${terminalName} exited with code ${exitCode}`);
                    }
                    // 处理其他类型的事件
                }
            });

            // 其他事件处理保持不变
            agentSocket.on("stackList", (res) => {
                if (res.ok) {
                    if (!res.endpoint) {
                        this.stackList = res.stackList;
                    } else {
                        if (!this.allAgentStackList[res.endpoint]) {
                            this.allAgentStackList[res.endpoint] = {
                                stackList: {},
                            };
                        }
                        this.allAgentStackList[res.endpoint].stackList = res.stackList;
                    }
                }
            });

            socket.on("stackStatusList", (res) => {
                if (res.ok) {
                    for (let stackName in res.stackStatusList) {
                        const stackObj = this.stackList[stackName];
                        if (stackObj) {
                            stackObj.status = res.stackStatusList[stackName];
                        }
                    }
                }
            });

            socket.on("agentStatus", (res) => {
                this.agentStatusList[res.endpoint] = res.status;

                if (res.msg) {
                    this.toastError(res.msg);
                }
            });

            socket.on("agentList", (res) => {
                if (res.ok) {
                    this.agentList = res.agentList;
                }
            });

            socket.on("refresh", () => {
                location.reload();
            });
        },

        storage(): Storage {
            return (this.remember) ? localStorage : sessionStorage;
        },

        getSocket(): Socket {
            return socket;
        },

        emitAgent(endpoint: string, eventName: string, ...args: unknown[]) {
            this.getSocket().emit("agent", endpoint, eventName, ...args);
        },

        getJWTPayload() {
            const jwtToken = this.storage().token;

            if (jwtToken && jwtToken !== "autoLogin") {
                return jwtDecode(jwtToken);
            }
            return undefined;
        },

        login(username: string, password: string, token: string, callback) {
            this.getSocket().emit("login", {
                username,
                password,
                token,
            }, (res) => {
                if (res.tokenRequired) {
                    callback(res);
                }

                if (res.ok) {
                    this.storage().token = res.token;
                    this.socketIO.token = res.token;
                    this.loggedIn = true;
                    this.username = this.getJWTPayload()?.username;

                    this.afterLogin();
                    history.pushState({}, "");
                }

                callback(res);
            });
        },

        loginByToken(token: string) {
            socket.emit("loginByToken", token, (res) => {
                this.allowLoginDialog = true;

                if (!res.ok) {
                    this.logout();
                } else {
                    this.loggedIn = true;
                    this.username = this.getJWTPayload()?.username;
                    this.afterLogin();
                }
            });
        },

        logout() {
            socket.emit("logout", () => { });
            this.storage().removeItem("token");
            this.socketIO.token = null;
            this.loggedIn = false;
            this.username = null;
            this.clearData();
        },

        clearData() {
            // 清理订阅
            this.subscriptions.clear();
            terminalMap.clear();
            terminalEndpointMap.clear();
        },

        afterLogin() {
            // 登录后的处理
        },

        /**
         * 订阅终端（新的订阅模式）
         */
        subscribeTerminal(endpoint: string, terminalName: string, terminal: Terminal) {
            const topic = `terminal:${terminalName}`;

            // 先记录本地映射，避免在回调返回前组件卸载导致无法正确解绑
            terminalMap.set(terminalName, terminal);
            terminalEndpointMap.set(terminalName, endpoint);
            this.subscriptions.add(topic);

            // 发送订阅请求
            this.emitAgent(endpoint, "subscribeTerminal", topic, (res) => {
                if (res.ok) {
                    terminal.write(res.buffer);
                    console.log(`Subscribed to terminal: ${terminalName}`);
                } else {
                    // 回滚本地状态
                    terminalMap.delete(terminalName);
                    terminalEndpointMap.delete(terminalName);
                    this.subscriptions.delete(topic);
                    this.toastRes(res);
                }
            });
        },

        /**
         * 取消订阅终端
         */
        unsubscribeTerminal(endpoint: string, terminalName: string) {
            const topic = `terminal:${terminalName}`;

            this.emitAgent(endpoint, "unsubscribeTerminal", topic);
            terminalMap.delete(terminalName);
            terminalEndpointMap.delete(terminalName);
            this.subscriptions.delete(topic);
            console.log(`Unsubscribed from terminal: ${terminalName}`);
        },

        /**
         * 绑定终端（兼容旧版本的方法）
         */
        bindTerminal(endpoint: string, terminalName: string, terminal: Terminal) {
            // 优先使用订阅模式
            if (this.isSubscriptionModeSupported()) {
                this.subscribeTerminal(endpoint, terminalName, terminal);
            } else {
                // 回退到旧的点对点模式
                this.emitAgent(endpoint, "terminalJoin", terminalName, (res) => {
                    if (res.ok) {
                        terminal.write(res.buffer);
                        terminalMap.set(terminalName, terminal);
                    } else {
                        this.toastRes(res);
                    }
                });
            }
        },

        unbindTerminal(terminalName: string) {
            // 如果是订阅模式，需要发送取消订阅请求
            const topic = `terminal:${terminalName}`;
            if (this.subscriptions.has(topic)) {
                const endpoint = terminalEndpointMap.get(terminalName);
                if (endpoint !== undefined) {
                    this.unsubscribeTerminal(endpoint, terminalName);
                } else {
                    // 没有 endpoint 映射时，至少清理本地状态
                    this.subscriptions.delete(topic);
                }
            }

            terminalMap.delete(terminalName);
            terminalEndpointMap.delete(terminalName);
        },

        /**
         * 检查是否支持订阅模式
         */
        isSubscriptionModeSupported(): boolean {
            // 可以通过服务器版本或特性检测来判断
            return this.info.features?.includes("subscription-mode") || false;
        },

        /**
         * 更新批量处理配置
         */
        updateBatchConfig(endpoint: string, config: Partial<typeof batchConfig>, callback?: AgentCallback) {
            // 更新本地配置
            Object.assign(batchConfig, config);
            console.log("Local batch config updated:", batchConfig);

            // 同步到后端
            const backendPatch: Record<string, unknown> = {};
            if (typeof config.maxBatchSize === "number") {
                backendPatch.maxBatchSize = config.maxBatchSize;
            }
            if (typeof config.batchTimeout === "number") {
                backendPatch.batchTimeout = config.batchTimeout;
            }
            if (typeof config.enableOptimization === "boolean") {
                backendPatch.enableBatch = config.enableOptimization;
            }

            this.emitAgent(endpoint, "updateBatchConfig", backendPatch, (res: AgentResponse) => {
                if (res.ok) {
                    console.log("Backend batch config updated successfully");
                } else {
                    console.error("Failed to update backend batch config:", res.msg);
                }
                if (callback) {
                    callback(res);
                }
            });
        },

        /**
         * 手动刷新终端输出
         */
        flushTerminalOutput(terminalName?: string) {
            terminalOptimizer.flush(terminalName);
        },

        /**
         * 获取性能统计信息
         */
        getPerformanceStats(endpoint: string, callback: AgentCallback) {
            this.emitAgent(endpoint, "getPerformanceStats", callback);
        },

        /**
         * 清理无效订阅者
         */
        cleanupSubscribers(endpoint: string, callback: AgentCallback) {
            this.emitAgent(endpoint, "cleanupSubscribers", callback);
        },

        /**
         * 强制刷新所有批量缓冲区
         */
        flushAllBatches(endpoint: string, callback: AgentCallback) {
            this.emitAgent(endpoint, "flushAllBatches", callback);
        },

        /**
         * 监控订阅状态
         */
        monitorSubscriptionHealth() {
            // 定期检查订阅健康状况
            setInterval(() => {
                if (this.loggedIn && this.subscriptions.size > 0) {
                    console.debug(`Active subscriptions: ${this.subscriptions.size}`);

                    // 可以在这里添加更多监控逻辑
                    // 比如检测长时间无响应的订阅
                }
            }, 30000); // 每30秒检查一次
        }
    }
});
