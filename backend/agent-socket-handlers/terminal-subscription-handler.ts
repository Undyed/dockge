import type { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { log } from "../log";
import { AgentSocketHandler } from "../agent-socket-handler";
import { AgentSocket } from "../../common/agent-socket";
import { EventPublisher } from "../event-publisher";
import { SubscriptionTerminal } from "../terminal-subscription";
import { Terminal } from "../terminal";

export class TerminalSubscriptionHandler extends AgentSocketHandler {
    private eventPublisher: EventPublisher;

    constructor() {
        super();
        this.eventPublisher = EventPublisher.getInstance();
    }

    create(socket: DockgeSocket, server: DockgeServer, agentSocket: AgentSocket) {

        // 订阅终端主题
        agentSocket.on("subscribeTerminal", async (topic: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(topic) !== "string") {
                    throw new ValidationError("Topic must be a string.");
                }

                log.debug("TerminalSubscriptionHandler", `Socket ${socket.id} subscribing to topic: ${topic}`);

                // 解析主题获取终端名称
                const terminalName = this.parseTerminalNameFromTopic(topic);
                if (!terminalName) {
                    throw new ValidationError("Invalid terminal topic format.");
                }

                // 订阅主题
                this.eventPublisher.subscribe(topic, socket);

                // 获取终端缓冲区内容
                let buffer = "";
                const subscriptionTerminal = SubscriptionTerminal.getTerminal(terminalName);
                if (subscriptionTerminal) {
                    buffer = subscriptionTerminal.getBuffer();
                } else {
                    const legacyTerminal = Terminal.getTerminal(terminalName);
                    if (legacyTerminal) {
                        buffer = legacyTerminal.getBuffer();
                    }
                }

                callbackResult({
                    ok: true,
                    buffer,
                    subscriberCount: this.eventPublisher.getSubscriberCount(topic)
                }, callback);

            } catch (e) {
                callbackError(e, callback);
            }
        });

        // 取消订阅终端主题
        agentSocket.on("unsubscribeTerminal", async (topic: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(topic) !== "string") {
                    throw new ValidationError("Topic must be a string.");
                }

                log.debug("TerminalSubscriptionHandler", `Socket ${socket.id} unsubscribing from topic: ${topic}`);

                this.eventPublisher.unsubscribe(topic, socket);

                if (callback && typeof callback === "function") {
                    callbackResult({
                        ok: true,
                        subscriberCount: this.eventPublisher.getSubscriberCount(topic)
                    }, callback);
                }

            } catch (e) {
                if (callback && typeof callback === "function") {
                    callbackError(e, callback);
                }
            }
        });

        // 获取订阅统计信息
        agentSocket.on("getSubscriptionStats", async (callback) => {
            try {
                checkLogin(socket);

                const topics = this.eventPublisher.getTopics();
                const stats = topics.map(topic => ({
                    topic,
                    subscriberCount: this.eventPublisher.getSubscriberCount(topic)
                }));

                callbackResult({
                    ok: true,
                    stats,
                    totalTopics: topics.length
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // 更新批量发送配置
        agentSocket.on("updateBatchConfig", async (config: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof config !== "object" || config === null) {
                    throw new ValidationError("Config must be an object.");
                }

                type BatchConfigPatch = {
                    maxBatchSize?: number;
                    batchTimeout?: number;
                    enableBatch?: boolean;
                };

                const raw = config as Record<string, unknown>;
                const patch: BatchConfigPatch = {};

                if (typeof raw.maxBatchSize === "number") {
                    patch.maxBatchSize = raw.maxBatchSize;
                }

                if (typeof raw.batchTimeout === "number") {
                    patch.batchTimeout = raw.batchTimeout;
                }

                // 兼容前端字段 enableOptimization（映射为 enableBatch）
                if (typeof raw.enableBatch === "boolean") {
                    patch.enableBatch = raw.enableBatch;
                } else if (typeof raw.enableOptimization === "boolean") {
                    patch.enableBatch = raw.enableOptimization;
                }

                this.eventPublisher.updateBatchConfig(patch);

                callbackResult({
                    ok: true,
                    message: "Batch config updated successfully"
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // 获取性能统计信息
        agentSocket.on("getPerformanceStats", async (callback) => {
            try {
                checkLogin(socket);

                const stats = this.eventPublisher.getPerformanceStats();
                const terminalStats = this.getTerminalStats();

                callbackResult({
                    ok: true,
                    performance: stats,
                    terminals: terminalStats
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // 清理无效订阅者
        agentSocket.on("cleanupSubscribers", async (callback) => {
            try {
                checkLogin(socket);

                const cleanedCount = this.eventPublisher.cleanupInactiveSubscribers();

                callbackResult({
                    ok: true,
                    message: `Cleaned up ${cleanedCount} inactive subscribers`,
                    cleanedCount
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // 强制刷新所有批量缓冲区
        agentSocket.on("flushAllBatches", async (callback) => {
            try {
                checkLogin(socket);

                this.eventPublisher.flushAllBatches();

                callbackResult({
                    ok: true,
                    message: "All batch buffers flushed"
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }

    /**
     * 从主题名称解析终端名称
     */
    private parseTerminalNameFromTopic(topic: string): string | null {
        const match = topic.match(/^terminal:(.+)$/);
        return match ? match[1] : null;
    }

    /**
     * 获取终端统计信息
     */
    private getTerminalStats() {
        return SubscriptionTerminal.getAllTerminalStats();
    }
}
