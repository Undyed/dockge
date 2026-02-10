<template>
    <div class="container-fluid animate-fade-in">
        <h1 class="mb-4">{{ $t("serviceStatus") }}</h1>

        <div v-if="Object.keys($root.completeStackList).length === 0" class="text-center mt-5">
            <p class="text-secondary">{{ $t("noStacksMonitor") }}</p>
        </div>

        <div v-else class="row gy-4">
            <div class="col-12 mb-2 d-flex justify-content-end">
                <div class="form-check form-switch">
                    <input
                        id="hideInactive"
                        v-model="hideInactive"
                        class="form-check-input"
                        type="checkbox"
                    >
                    <label class="form-check-label text-secondary ms-2" for="hideInactive">
                        {{ $t("hideInactiveStacks") }}
                    </label>
                </div>
            </div>

            <div
                v-for="stack in processedStackList"
                :key="stack.id"
                class="col-12 col-xl-6"
            >
                <div class="shadow-box glass h-100">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h4 class="mb-0 text-primary">
                            <font-awesome-icon icon="layer-group" class="me-2" />
                            {{ stack.name }}
                        </h4>
                        <span class="badge" :class="getStatusBadgeClass(stack.status)">
                            {{ $t(getStatusText(stack.status)) }}
                        </span>
                    </div>

                    <div v-if="!getStatsForStack(stack)" class="text-center py-4 text-secondary">
                        <template v-if="stack.status === RUNNING">
                            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                            {{ $t("loadingStats") }}
                        </template>
                        <template v-else>
                            <font-awesome-icon icon="info-circle" class="me-2 opacity-50" />
                            <span class="opacity-75">{{ $t("inactive") }}</span>
                        </template>
                    </div>

                    <div v-else class="service-list">
                        <div
                            v-for="service in getStatsForStack(stack)"
                            :key="service.ID || service.Name"
                            class="service-item mb-4"
                        >
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="fw-bold">
                                    <font-awesome-icon icon="cube" class="me-2 text-secondary" />
                                    {{ service.Name }}
                                </span>
                                <small class="text-secondary">{{ service.ID }}</small>
                            </div>

                            <div class="row g-3">
                                <!-- CPU -->
                                <div class="col-12 col-md-6">
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <small class="text-secondary text-nowrap me-2">{{ $t("CPU") }}</small>
                                        <small class="fw-bold text-nowrap">{{ service.CPUPerc }}</small>
                                    </div>
                                    <div class="progress">
                                        <div
                                            class="progress-bar"
                                            :class="getUsageClass(parseFloat(service.CPUPerc || '0'))"
                                            role="progressbar"
                                            :style="{ width: service.CPUPerc || '0%' }"
                                        ></div>
                                    </div>
                                </div>

                                <!-- Memory -->
                                <div class="col-12 col-md-6">
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <small class="text-secondary text-nowrap me-2">{{ $t("Memory") }}</small>
                                        <small class="fw-bold text-nowrap">
                                            {{ service.MemPerc }}
                                            <span class="text-secondary fw-normal ms-1 d-none d-sm-inline" style="font-size: 0.7rem">
                                                ({{ service.MemUsage }})
                                            </span>
                                        </small>
                                    </div>
                                    <div class="progress">
                                        <div
                                            class="progress-bar"
                                            :class="getUsageClass(parseFloat(service.MemPerc || '0'))"
                                            role="progressbar"
                                            :style="{ width: service.MemPerc || '0%' }"
                                        ></div>
                                    </div>
                                </div>

                                <!-- Network -->
                                <div class="col-12 col-sm-6">
                                    <div class="d-flex align-items-center text-nowrap mt-1">
                                        <font-awesome-icon icon="network-wired" class="me-2 text-secondary opacity-75" />
                                        <small class="me-3">
                                            <font-awesome-icon icon="arrow-down" class="me-1 text-success opacity-75" />
                                            {{ getNetIOPart(service.NetIO, 0) }}
                                        </small>
                                        <small>
                                            <font-awesome-icon icon="arrow-up" class="me-1 text-primary opacity-75" />
                                            {{ getNetIOPart(service.NetIO, 1) }}
                                        </small>
                                    </div>
                                </div>

                                <!-- Disk I/O -->
                                <div class="col-12 col-sm-6 text-sm-end">
                                    <div class="d-inline-flex align-items-center text-nowrap mt-1">
                                        <font-awesome-icon icon="hdd" class="me-2 text-secondary opacity-75" />
                                        <small class="text-secondary">
                                            {{ $t("Disk IO") }}: <span class="text-dark fw-500">{{ service.BlockIO || "0B / 0B" }}</span>
                                        </small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { CREATED_FILE, CREATED_STACK, EXITED, RUNNING } from "../../../common/util-common";

export default {
    data() {
        return {
            stats: {},
            activeSubscriptions: new Set(),
            hideInactive: false,
        };
    },

    computed: {
        processedStackList() {
            let list = Object.entries(this.$root.completeStackList).map(([id, stack]) => ({
                id,
                ...stack
            }));

            if (this.hideInactive) {
                list = list.filter(stack => stack.status === RUNNING);
            }

            // Sort: 1. Status (Running first) 2. Name
            return list.sort((a, b) => {
                if (a.status === RUNNING && b.status !== RUNNING) return -1;
                if (a.status !== RUNNING && b.status === RUNNING) return 1;

                if (a.status === EXITED && (b.status === CREATED_STACK || b.status === CREATED_FILE)) return -1;
                if ((a.status === CREATED_STACK || a.status === CREATED_FILE) && b.status === EXITED) return 1;

                return a.name.localeCompare(b.name);
            });
        },

        stackSubscriptionSnapshot() {
            const list = this.$root.completeStackList;
            const snapshot = [];

            for (const stack of Object.values(list)) {
                if (!stack || typeof stack.name !== "string") {
                    continue;
                }

                const endpoint = typeof stack.endpoint === "string" ? stack.endpoint : "";
                snapshot.push(this.getSubscriptionID(endpoint, stack.name));
            }

            snapshot.sort();
            return snapshot.join("|");
        },
    },

    watch: {
        stackSubscriptionSnapshot() {
            this.syncSubscriptions();
        },
    },

    mounted() {
        this.$root.getSocket().on("agent", this.onAgentEvent);
        this.syncSubscriptions();
    },

    beforeUnmount() {
        this.$root.getSocket().off("agent", this.onAgentEvent);
        this.unsubscribeAll();
    },

    methods: {
        getSubscriptionID(endpoint, stackName) {
            return JSON.stringify([ endpoint, stackName ]);
        },

        parseSubscriptionID(subscriptionID) {
            try {
                const parsed = JSON.parse(subscriptionID);

                if (Array.isArray(parsed) && parsed.length === 2) {
                    const endpoint = typeof parsed[0] === "string" ? parsed[0] : "";
                    const stackName = typeof parsed[1] === "string" ? parsed[1] : "";

                    if (stackName) {
                        return {
                            endpoint,
                            stackName,
                        };
                    }
                }
            } catch {
                // Ignore invalid subscriptionID
            }

            return null;
        },

        getStatsKey(stack) {
            const endpoint = typeof stack.endpoint === "string" ? stack.endpoint : "";
            return this.getSubscriptionID(endpoint, stack.name);
        },

        getStatsForStack(stack) {
            return this.stats[this.getStatsKey(stack)];
        },

        getNetIOPart(netIO, index) {
            if (typeof netIO !== "string") {
                return "0B";
            }

            const parts = netIO.split(" / ");
            return parts[index] || "0B";
        },

        onAgentEvent(event, data) {
            if (event !== "stackStats") {
                return;
            }

            if (!data || typeof data.stackName !== "string") {
                return;
            }

            const endpoint = typeof data.endpoint === "string" ? data.endpoint : "";
            const statsKey = this.getSubscriptionID(endpoint, data.stackName);
            const stats = Array.isArray(data.stats) ? data.stats : [];

            this.stats[statsKey] = stats;
        },

        syncSubscriptions() {
            const desiredSubscriptions = new Set();

            for (const stack of Object.values(this.$root.completeStackList)) {
                if (!stack || typeof stack.name !== "string") {
                    continue;
                }

                const endpoint = typeof stack.endpoint === "string" ? stack.endpoint : "";
                const subscriptionID = this.getSubscriptionID(endpoint, stack.name);
                desiredSubscriptions.add(subscriptionID);

                if (!this.activeSubscriptions.has(subscriptionID)) {
                    this.$root.emitAgent(endpoint, "subscribeStackStats", stack.name);
                    this.activeSubscriptions.add(subscriptionID);
                }
            }

            for (const subscriptionID of Array.from(this.activeSubscriptions)) {
                if (desiredSubscriptions.has(subscriptionID)) {
                    continue;
                }

                const parsed = this.parseSubscriptionID(subscriptionID);
                if (parsed) {
                    this.$root.emitAgent(parsed.endpoint, "unsubscribeStackStats", parsed.stackName);
                    delete this.stats[subscriptionID];
                }

                this.activeSubscriptions.delete(subscriptionID);
            }
        },

        unsubscribeAll() {
            for (const subscriptionID of this.activeSubscriptions) {
                const parsed = this.parseSubscriptionID(subscriptionID);
                if (parsed) {
                    this.$root.emitAgent(parsed.endpoint, "unsubscribeStackStats", parsed.stackName);
                }
            }

            this.activeSubscriptions.clear();
            this.stats = {};
        },

        getStatusBadgeClass(status) {
            if (status === RUNNING) {
                return "bg-success";
            }

            if (status === EXITED) {
                return "bg-danger";
            }

            return "bg-secondary";
        },

        getStatusText(status) {
            if (status === RUNNING) {
                return "running";
            }

            if (status === EXITED) {
                return "exited";
            }

            if (status === CREATED_STACK) {
                return "created";
            }

            return "unknown";
        },

        getUsageClass(perc) {
            const usage = Number.isFinite(perc) ? perc : 0;

            if (usage > 80) {
                return "bg-danger";
            }

            if (usage > 50) {
                return "bg-warning";
            }

            return "bg-primary";
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars";

.shadow-box {
    border: 1px solid rgba(0, 0, 0, 0.05);
    transition: all 0.3s ease;

    &:hover {
        transform: translateY(-5px);
        box-shadow: $light-shadow;
    }

    .dark & {
        border-color: rgba(255, 255, 255, 0.05);

        &:hover {
            box-shadow: $dark-shadow;
        }
    }
}

.service-item {
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.03);

    &:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }

    .dark & {
        border-bottom-color: rgba(255, 255, 255, 0.03);
    }
}

.progress {
    height: 8px;
    border-radius: 4px;
    background-color: rgba(0, 0, 0, 0.05);

    .dark & {
        background-color: rgba(255, 255, 255, 0.05);
    }
}

.progress-bar {
    border-radius: 4px;
    transition: width 0.5s ease;
}

.bg-primary {
    background: $primary-gradient !important;
}

.bg-warning {
    background-color: #fcc419 !important;
}

.bg-danger {
    background-color: #ff6b6b !important;
}
</style>
