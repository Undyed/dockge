import { EventEmitter } from "events";
import { DockgeSocket } from "./util-server";
import { log } from "./log";

/**
 * 事件发布器 - 实现订阅模式的核心
 */
export class EventPublisher extends EventEmitter {
    private static instance: EventPublisher;

    private isTerminalWritePayload(data: unknown): data is { terminalName: string; data: string } {
        if (!data || typeof data !== "object") {
            return false;
        }

        const raw = data as Record<string, unknown>;
        return typeof raw.terminalName === "string" && typeof raw.data === "string";
    }

    // 订阅者管理：topic -> Set<socketId>
    private subscribers: Map<string, Set<string>> = new Map();

    // Socket 管理：socketId -> socket
    private sockets: Map<string, DockgeSocket> = new Map();

    // 批量发送缓冲区：topic -> data[]
    private batchBuffer: Map<string, Array<{ eventName: string; data: unknown; timestamp: number }>> = new Map();

    // 批量发送定时器：topic -> timer
    private batchTimers: Map<string, NodeJS.Timeout> = new Map();

    // 批量发送配置
    private batchConfig = {
        maxBatchSize: 50,      // 最大批量大小
        batchTimeout: 100,     // 批量超时时间(ms)
        enableBatch: true      // 是否启用批量发送
    };

    private constructor() {
        super();
        this.setMaxListeners(0); // 移除监听器数量限制
    }

    public static getInstance(): EventPublisher {
        if (!EventPublisher.instance) {
            EventPublisher.instance = new EventPublisher();
        }
        return EventPublisher.instance;
    }

    /**
     * 订阅主题
     */
    public subscribe(topic: string, socket: DockgeSocket): void {
        if (!this.subscribers.has(topic)) {
            this.subscribers.set(topic, new Set());
        }

        this.subscribers.get(topic)!.add(socket.id);

        // 只在第一次添加 socket 时设置监听器和存储
        if (!this.sockets.has(socket.id)) {
            this.sockets.set(socket.id, socket);

            // 监听 socket 断开连接 - 只设置一次
            socket.on("disconnect", () => {
                this.unsubscribeSocket(socket.id);
            });
        }

        log.debug("EventPublisher", `Socket ${socket.id} subscribed to topic: ${topic}`);
    }

    /**
     * 取消订阅主题
     */
    public unsubscribe(topic: string, socket: DockgeSocket): void {
        const subscribers = this.subscribers.get(topic);
        if (subscribers) {
            subscribers.delete(socket.id);
            if (subscribers.size === 0) {
                this.subscribers.delete(topic);
                // 清理批量发送相关资源
                this.clearBatchResources(topic);
            }
        }

        // 检查 socket 是否还有其他订阅
        let hasOtherSubscriptions = false;
        for (const [ , subs ] of this.subscribers) {
            if (subs.has(socket.id)) {
                hasOtherSubscriptions = true;
                break;
            }
        }

        // 如果没有其他订阅，清理 socket
        if (!hasOtherSubscriptions) {
            this.sockets.delete(socket.id);
        }

        log.debug("EventPublisher", `Socket ${socket.id} unsubscribed from topic: ${topic}`);
    }

    /**
     * 取消 socket 的所有订阅
     */
    private unsubscribeSocket(socketId: string): void {
        for (const [ topic, subscribers ] of this.subscribers.entries()) {
            if (subscribers.has(socketId)) {
                subscribers.delete(socketId);
                if (subscribers.size === 0) {
                    this.subscribers.delete(topic);
                    this.clearBatchResources(topic);
                }
            }
        }
        this.sockets.delete(socketId);

        log.debug("EventPublisher", `Socket ${socketId} unsubscribed from all topics`);
    }

    /**
     * 发布事件到主题 - 只在有订阅者时才处理
     */
    public publish(topic: string, eventName: string, data: unknown): void {
        const subscribers = this.subscribers.get(topic);
        if (!subscribers || subscribers.size === 0) {
            // 没有订阅者，直接返回，避免性能浪费
            return;
        }

        if (this.batchConfig.enableBatch && this.shouldBatch(eventName)) {
            this.addToBatch(topic, eventName, data);
        } else {
            this.sendImmediate(topic, eventName, data);
        }
    }

    /**
     * 检查主题是否有活跃的订阅者
     */
    public hasActiveSubscribers(topic: string): boolean {
        const subscribers = this.subscribers.get(topic);
        if (!subscribers || subscribers.size === 0) {
            return false;
        }

        // 检查是否有连接的 socket
        for (const socketId of subscribers) {
            const socket = this.sockets.get(socketId);
            if (socket && socket.connected) {
                return true;
            }
        }

        return false;
    }

    /**
     * 获取主题的活跃订阅者数量
     */
    public getActiveSubscriberCount(topic: string): number {
        const subscribers = this.subscribers.get(topic);
        if (!subscribers || subscribers.size === 0) {
            return 0;
        }

        let activeCount = 0;
        for (const socketId of subscribers) {
            const socket = this.sockets.get(socketId);
            if (socket && socket.connected) {
                activeCount++;
            }
        }

        return activeCount;
    }

    /**
     * 立即发送数据
     */
    private sendImmediate(topic: string, eventName: string, data: unknown): void {
        const subscribers = this.subscribers.get(topic);
        if (!subscribers) {
            return;
        }

        const disconnectedSockets: string[] = [];

        for (const socketId of subscribers) {
            const socket = this.sockets.get(socketId);
            if (socket && socket.connected) {
                // 兼容旧的 terminalWrite 协议格式
                if (eventName === "terminalWrite" && this.isTerminalWritePayload(data)) {
                    socket.emitAgent(eventName, data.terminalName, data.data);
                } else {
                    socket.emitAgent(eventName, data);
                }
            } else {
                disconnectedSockets.push(socketId);
            }
        }

        // 清理断开连接的 socket
        disconnectedSockets.forEach(socketId => {
            this.unsubscribeSocket(socketId);
        });
    }

    /**
     * 添加到批量发送缓冲区
     */
    private addToBatch(topic: string, eventName: string, data: unknown): void {
        if (!this.batchBuffer.has(topic)) {
            this.batchBuffer.set(topic, []);
        }

        const buffer = this.batchBuffer.get(topic)!;
        buffer.push({ eventName,
            data,
            timestamp: Date.now() });

        // 如果达到最大批量大小，立即发送
        if (buffer.length >= this.batchConfig.maxBatchSize) {
            this.flushBatch(topic);
            return;
        }

        // 设置批量发送定时器
        if (!this.batchTimers.has(topic)) {
            const timer = setTimeout(() => {
                this.flushBatch(topic);
            }, this.batchConfig.batchTimeout);

            this.batchTimers.set(topic, timer);
        }
    }

    /**
     * 刷新批量发送缓冲区
     */
    private flushBatch(topic: string): void {
        const buffer = this.batchBuffer.get(topic);
        if (!buffer || buffer.length === 0) {
            return;
        }

        const subscribers = this.subscribers.get(topic);
        if (!subscribers || subscribers.size === 0) {
            this.clearBatchResources(topic);
            return;
        }

        const disconnectedSockets: string[] = [];

        // 发送批量数据
        for (const socketId of subscribers) {
            const socket = this.sockets.get(socketId);
            if (socket && socket.connected) {
                // 对于 terminalWrite 事件，发送兼容的批量终端数据
                const terminalWriteEvents: Array<{ terminalName: string; data: string; timestamp: number }> = [];
                for (const event of buffer) {
                    if (event.eventName === "terminalWrite" && this.isTerminalWritePayload(event.data)) {
                        terminalWriteEvents.push({
                            terminalName: event.data.terminalName,
                            data: event.data.data,
                            timestamp: event.timestamp,
                        });
                    }
                }

                if (terminalWriteEvents.length > 0) {
                    socket.emitAgent("batchTerminalWrite", topic, terminalWriteEvents);
                }

                // 发送其他类型的批量事件
                const otherEvents = buffer.filter(event => event.eventName !== "terminalWrite");
                if (otherEvents.length > 0) {
                    socket.emitAgent("batchEvents", topic, otherEvents);
                }
            } else {
                disconnectedSockets.push(socketId);
            }
        }

        // 清理断开连接的 socket
        disconnectedSockets.forEach(socketId => {
            this.unsubscribeSocket(socketId);
        });

        // 清理批量发送资源
        this.clearBatchResources(topic);
    }

    /**
     * 清理批量发送相关资源
     */
    private clearBatchResources(topic: string): void {
        // 清理定时器
        const timer = this.batchTimers.get(topic);
        if (timer) {
            clearTimeout(timer);
            this.batchTimers.delete(topic);
        }

        // 清理缓冲区
        this.batchBuffer.delete(topic);
    }

    /**
     * 判断是否应该批量发送
     */
    private shouldBatch(eventName: string): boolean {
        // 终端输出事件适合批量发送
        return eventName === "terminalWrite" || eventName === "terminalData";
    }

    /**
     * 获取主题的订阅者数量
     */
    public getSubscriberCount(topic: string): number {
        return this.subscribers.get(topic)?.size || 0;
    }

    /**
     * 获取所有主题
     */
    public getTopics(): string[] {
        return Array.from(this.subscribers.keys());
    }

    /**
     * 更新批量发送配置
     */
    public updateBatchConfig(config: Partial<typeof this.batchConfig>): void {
        this.batchConfig = { ...this.batchConfig,
            ...config };
        log.info("EventPublisher", {
            msg: "Batch config updated",
            config: this.batchConfig,
        });
    }

    /**
     * 获取性能统计信息
     */
    public getPerformanceStats(): {
        totalTopics: number;
        totalSubscribers: number;
        activeSubscribers: number;
        batchBufferSize: number;
        activeBatchTimers: number;
        topicStats: Array<{
            topic: string;
            totalSubscribers: number;
            activeSubscribers: number;
            hasBatchBuffer: boolean;
        }>;
        } {
        let totalSubscribers = 0;
        let activeSubscribers = 0;
        let batchBufferSize = 0;
        const topicStats: Array<{
            topic: string;
            totalSubscribers: number;
            activeSubscribers: number;
            hasBatchBuffer: boolean;
        }> = [];

        for (const [ topic, subscribers ] of this.subscribers.entries()) {
            const totalSubs = subscribers.size;
            const activeSubs = this.getActiveSubscriberCount(topic);
            const hasBatch = this.batchBuffer.has(topic);

            totalSubscribers += totalSubs;
            activeSubscribers += activeSubs;

            if (hasBatch) {
                batchBufferSize += this.batchBuffer.get(topic)?.length || 0;
            }

            topicStats.push({
                topic,
                totalSubscribers: totalSubs,
                activeSubscribers: activeSubs,
                hasBatchBuffer: hasBatch
            });
        }

        return {
            totalTopics: this.subscribers.size,
            totalSubscribers,
            activeSubscribers,
            batchBufferSize,
            activeBatchTimers: this.batchTimers.size,
            topicStats
        };
    }

    /**
     * 清理无效的订阅者
     */
    public cleanupInactiveSubscribers(): number {
        let cleanedCount = 0;

        for (const [ topic, subscribers ] of this.subscribers.entries()) {
            const toRemove: string[] = [];

            for (const socketId of subscribers) {
                const socket = this.sockets.get(socketId);
                if (!socket || !socket.connected) {
                    toRemove.push(socketId);
                }
            }

            for (const socketId of toRemove) {
                subscribers.delete(socketId);
                this.sockets.delete(socketId);
                cleanedCount++;
            }

            // 如果主题没有订阅者了，清理相关资源
            if (subscribers.size === 0) {
                this.subscribers.delete(topic);
                this.clearBatchResources(topic);
            }
        }

        if (cleanedCount > 0) {
            log.info("EventPublisher", `Cleaned up ${cleanedCount} inactive subscribers`);
        }

        return cleanedCount;
    }

    /**
     * 强制刷新所有批量缓冲区
     */
    public flushAllBatches(): void {
        const topics = Array.from(this.batchBuffer.keys());

        for (const topic of topics) {
            this.flushBatch(topic);
        }

        log.info("EventPublisher", `Flushed ${topics.length} batch buffers`);
    }

    /**
     * 启动定期清理任务
     */
    public startPeriodicCleanup(intervalMs: number = 300000): void { // 默认5分钟
        setInterval(() => {
            this.cleanupInactiveSubscribers();
        }, intervalMs);

        log.info("EventPublisher", `Started periodic cleanup with interval: ${intervalMs}ms`);
    }
}
