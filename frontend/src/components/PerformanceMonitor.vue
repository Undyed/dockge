<template>
    <div class="performance-monitor">
        <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0">{{ $t("Performance Monitor") }}</h5>
                <div>
                    <button class="btn btn-sm btn-outline-primary me-2" @click="refreshStats">
                        <font-awesome-icon icon="sync" :spin="loading" />
                        {{ $t("Refresh") }}
                    </button>
                    <button class="btn btn-sm btn-outline-warning me-2" @click="cleanupSubscribers">
                        <font-awesome-icon icon="broom" />
                        {{ $t("Cleanup") }}
                    </button>
                    <button class="btn btn-sm btn-outline-info" @click="flushBatches">
                        <font-awesome-icon icon="paper-plane" />
                        {{ $t("Flush") }}
                    </button>
                </div>
            </div>

            <div class="card-body">
                <div v-if="loading" class="text-center">
                    <div class="spinner-border" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>

                <div v-else-if="stats">
                    <!-- 总体统计 -->
                    <div class="row mb-4">
                        <div class="col-md-3">
                            <div class="stat-card bg-primary text-white">
                                <div class="stat-number">{{ stats.performance.totalTopics }}</div>
                                <div class="stat-label">{{ $t("Total Topics") }}</div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="stat-card bg-success text-white">
                                <div class="stat-number">{{ stats.performance.activeSubscribers }}</div>
                                <div class="stat-label">{{ $t("Active Subscribers") }}</div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="stat-card bg-info text-white">
                                <div class="stat-number">{{ stats.terminals.activeTerminals }}</div>
                                <div class="stat-label">{{ $t("Active Terminals") }}</div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="stat-card bg-warning text-white">
                                <div class="stat-number">{{ stats.performance.batchBufferSize }}</div>
                                <div class="stat-label">{{ $t("Batch Buffer Size") }}</div>
                            </div>
                        </div>
                    </div>

                    <!-- 主题详情 -->
                    <div class="mb-4">
                        <h6>{{ $t("Topic Details") }}</h6>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>{{ $t("Topic") }}</th>
                                        <th>{{ $t("Total Subscribers") }}</th>
                                        <th>{{ $t("Active Subscribers") }}</th>
                                        <th>{{ $t("Has Batch Buffer") }}</th>
                                        <th>{{ $t("Status") }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="topic in stats.performance.topicStats" :key="topic.topic">
                                        <td>
                                            <code>{{ topic.topic }}</code>
                                        </td>
                                        <td>{{ topic.totalSubscribers }}</td>
                                        <td>
                                            <span :class="getSubscriberBadgeClass(topic.activeSubscribers)">
                                                {{ topic.activeSubscribers }}
                                            </span>
                                        </td>
                                        <td>
                                            <span v-if="topic.hasBatchBuffer" class="badge bg-warning">
                                                <font-awesome-icon icon="clock" />
                                            </span>
                                            <span v-else class="badge bg-secondary">-</span>
                                        </td>
                                        <td>
                                            <span :class="getTopicStatusClass(topic)">
                                                {{ getTopicStatus(topic) }}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 终端详情 -->
                    <div class="mb-4">
                        <h6>{{ $t("Terminal Details") }}</h6>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>{{ $t("Terminal Name") }}</th>
                                        <th>{{ $t("Subscribers") }}</th>
                                        <th>{{ $t("Size") }}</th>
                                        <th>{{ $t("Keep Alive") }}</th>
                                        <th>{{ $t("Status") }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="terminal in stats.terminals.terminals" :key="terminal.name">
                                        <td>
                                            <code>{{ terminal.name }}</code>
                                        </td>
                                        <td>{{ terminal.subscriberCount }}</td>
                                        <td>{{ terminal.cols }}x{{ terminal.rows }}</td>
                                        <td>
                                            <span v-if="terminal.enableKeepAlive" class="badge bg-success">
                                                <font-awesome-icon icon="check" />
                                            </span>
                                            <span v-else class="badge bg-secondary">-</span>
                                        </td>
                                        <td>
                                            <span :class="terminal.isActive ? 'badge bg-success' : 'badge bg-secondary'">
                                                {{ terminal.isActive ? $t("Active") : $t("Inactive") }}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 配置调整 -->
                    <div class="mb-4">
                        <h6>{{ $t("Batch Configuration") }}</h6>
                        <div class="row">
                            <div class="col-md-4">
                                <label class="form-label">{{ $t("Max Batch Size") }}</label>
                                <input
                                    v-model.number="batchConfig.maxBatchSize"
                                    type="number"
                                    class="form-control form-control-sm"
                                    min="1"
                                    max="1000"
                                >
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">{{ $t("Batch Timeout (ms)") }}</label>
                                <input
                                    v-model.number="batchConfig.batchTimeout"
                                    type="number"
                                    class="form-control form-control-sm"
                                    min="10"
                                    max="5000"
                                >
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">{{ $t("Enable Optimization") }}</label>
                                <div class="form-check form-switch">
                                    <input
                                        v-model="batchConfig.enableOptimization"
                                        class="form-check-input"
                                        type="checkbox"
                                    >
                                </div>
                            </div>
                        </div>
                        <div class="mt-2">
                            <button class="btn btn-sm btn-primary" @click="updateBatchConfig">
                                {{ $t("Update Configuration") }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    props: {
        endpoint: {
            type: String,
            default: ""
        }
    },

    data() {
        return {
            stats: null,
            loading: false,
            batchConfig: {
                maxBatchSize: 50,
                batchTimeout: 100,
                enableOptimization: true
            }
        };
    },

    mounted() {
        this.refreshStats();

        // 定期刷新统计信息
        this.refreshInterval = setInterval(() => {
            if (!this.loading) {
                this.refreshStats();
            }
        }, 10000); // 每10秒刷新一次
    },

    unmounted() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    },

    methods: {
        refreshStats() {
            this.loading = true;
            this.$root.getPerformanceStats(this.endpoint, (res) => {
                this.loading = false;
                if (res.ok) {
                    this.stats = res;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        cleanupSubscribers() {
            this.$root.cleanupSubscribers(this.endpoint, (res) => {
                if (res.ok) {
                    this.$root.toastSuccess(`Cleaned up ${res.cleanedCount} inactive subscribers`);
                    this.refreshStats();
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        flushBatches() {
            this.$root.flushAllBatches(this.endpoint, (res) => {
                if (res.ok) {
                    this.$root.toastSuccess("All batch buffers flushed");
                    this.refreshStats();
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        updateBatchConfig() {
            this.$root.updateBatchConfig(this.endpoint, this.batchConfig, (res) => {
                if (res.ok) {
                    this.$root.toastSuccess("Batch configuration updated");
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        getSubscriberBadgeClass(count) {
            if (count === 0) {
                return "badge bg-secondary";
            }
            if (count <= 2) {
                return "badge bg-success";
            }
            if (count <= 5) {
                return "badge bg-warning";
            }
            return "badge bg-danger";
        },

        getTopicStatusClass(topic) {
            if (topic.activeSubscribers === 0) {
                return "badge bg-secondary";
            }
            if (topic.hasBatchBuffer) {
                return "badge bg-warning";
            }
            return "badge bg-success";
        },

        getTopicStatus(topic) {
            if (topic.activeSubscribers === 0) {
                return this.$t("Inactive");
            }
            if (topic.hasBatchBuffer) {
                return this.$t("Batching");
            }
            return this.$t("Active");
        }
    }
};
</script>

<style scoped lang="scss">
.performance-monitor {
    .stat-card {
        padding: 1rem;
        border-radius: 0.5rem;
        text-align: center;

        .stat-number {
            font-size: 2rem;
            font-weight: bold;
        }

        .stat-label {
            font-size: 0.875rem;
            opacity: 0.9;
        }
    }

    .table {
        font-size: 0.875rem;

        code {
            font-size: 0.8rem;
            background-color: rgba(0, 0, 0, 0.1);
            padding: 0.2rem 0.4rem;
            border-radius: 0.25rem;
        }
    }
}
</style>
