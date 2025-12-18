import type { DockgeServer } from "./dockge-server";
import { TerminalSubscriptionHandler } from "./agent-socket-handlers/terminal-subscription-handler";
import { EventPublisher } from "./event-publisher";
import { log } from "./log";

/**
 * 订阅模式集成管理器
 * 负责将订阅模式集成到现有系统中
 */
export class SubscriptionIntegration {
    private static instance: SubscriptionIntegration;
    private eventPublisher: EventPublisher;
    private isEnabled: boolean = false;

    private constructor() {
        this.eventPublisher = EventPublisher.getInstance();
    }

    public static getInstance(): SubscriptionIntegration {
        if (!SubscriptionIntegration.instance) {
            SubscriptionIntegration.instance = new SubscriptionIntegration();
        }
        return SubscriptionIntegration.instance;
    }

    /**
     * 启用订阅模式
     */
    public enable(server: DockgeServer): void {
        if (this.isEnabled) {
            log.warn("SubscriptionIntegration", "Subscription mode is already enabled");
            return;
        }

        try {
            // 启动事件发布器的定期清理
            this.eventPublisher.startPeriodicCleanup(300000); // 5分钟清理一次

            // 注册订阅模式处理器
            const subscriptionHandler = new TerminalSubscriptionHandler();

            // 将处理器注册到服务器的 agent socket 系统中（避免重复注册）
            const alreadyRegistered = server.agentSocketHandlerList.some((handler) =>
                handler instanceof TerminalSubscriptionHandler
            );
            if (!alreadyRegistered) {
                server.agentSocketHandlerList.push(subscriptionHandler);
                log.debug("SubscriptionIntegration", "TerminalSubscriptionHandler registered");
            }

            this.isEnabled = true;
            log.info("SubscriptionIntegration", "Subscription mode enabled successfully");

            // 更新服务器信息，告知前端支持订阅模式
            this.updateServerFeatures(server);

        } catch (error) {
            log.error("SubscriptionIntegration", {
                msg: "Failed to enable subscription mode",
                error,
            });
            throw error;
        }
    }

    /**
     * 禁用订阅模式
     */
    public disable(): void {
        if (!this.isEnabled) {
            return;
        }

        // 清理所有订阅
        const stats = this.eventPublisher.getPerformanceStats();
        log.info("SubscriptionIntegration", `Disabling subscription mode. Active topics: ${stats.totalTopics}, Active subscribers: ${stats.activeSubscribers}`);

        // 强制刷新所有批量缓冲区
        this.eventPublisher.flushAllBatches();

        this.isEnabled = false;
        log.info("SubscriptionIntegration", "Subscription mode disabled");
    }

    /**
     * 检查订阅模式是否启用
     */
    public isSubscriptionModeEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * 更新服务器特性信息
     */
    private updateServerFeatures(server: DockgeServer): void {
        // 确保服务器信息包含订阅模式特性
        if (!server.info) {
            server.info = {};
        }

        if (!server.info.features) {
            server.info.features = [];
        }

        if (!server.info.features.includes("subscription-mode")) {
            server.info.features.push("subscription-mode");
            log.debug("SubscriptionIntegration", "Added subscription-mode to server features");
        }
    }

    /**
     * 获取订阅模式统计信息
     */
    public getStats() {
        return {
            enabled: this.isEnabled,
            performance: this.eventPublisher.getPerformanceStats()
        };
    }
}
