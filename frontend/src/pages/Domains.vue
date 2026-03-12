<template>
    <div class="container-fluid animate-fade-in">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h1>{{ $t("domainOverview") }}</h1>
            <button class="btn btn-primary" :disabled="loading" @click="refresh">
                <font-awesome-icon icon="sync" :spin="loading" /> {{ $t("refresh") }}
            </button>
        </div>

        <div v-if="unavailableEndpointLabels.length > 0" class="alert alert-warning shadow-box mb-4" role="alert">
            {{ $t("domainsUnavailableEndpoints", [unavailableEndpointLabels.join(", ")]) }}
        </div>

        <div v-if="loading && domainList.length === 0" class="text-center mt-5">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="text-secondary mt-2">{{ $t("loading") }}...</p>
        </div>

        <div v-else-if="domainList.length === 0" class="text-center mt-5">
            <p class="text-secondary text-center">
                {{ $t("noDomainsFound") }}
            </p>
        </div>

        <div v-else class="shadow-box glass table-responsive">
            <table class="table table-hover mb-0">
                <thead>
                    <tr>
                        <th style="width: 50px;">{{ $t("status") }}</th>
                        <th>{{ $t("stack") }}</th>
                        <th>{{ $t("service") }}</th>
                        <th>{{ $t("domains") }}</th>
                        <th v-if="showEndpoint">{{ $t("endpoint") }}</th>
                        <th style="width: 80px;"></th>
                    </tr>
                </thead>
                <tbody>
                    <template v-for="stack in domainList" :key="stack.endpoint + stack.stackName">
                        <template v-if="stack.services.length > 0">
                            <tr v-for="(svc, j) in stack.services" :key="stack.endpoint + stack.stackName + svc.serviceName">
                                <td class="text-center align-middle">
                                    <span v-if="j === 0" class="status-indicator" :class="getStatusClass(stack.status)" :title="getStatusText(stack.status)"></span>
                                </td>
                                <td class="align-middle">
                                    <router-link v-if="j === 0" :to="getStackLink(stack)" class="text-decoration-none fw-bold">
                                        {{ stack.stackName }}
                                    </router-link>
                                </td>
                                <td class="align-middle text-secondary">
                                    {{ svc.serviceName }}
                                </td>
                                <td class="align-middle">
                                    <div class="d-flex flex-column gap-1">
                                        <a v-for="domain in svc.domains" :key="domain" :href="domain" target="_blank" rel="noopener noreferrer" class="domain-link">
                                            {{ domain }}
                                            <font-awesome-icon icon="external-link-alt" class="ms-1 small-icon" />
                                        </a>
                                    </div>
                                </td>
                                <td v-if="showEndpoint" class="align-middle text-secondary small">
                                    {{ stack.endpoint }}
                                </td>
                                <td class="text-end align-middle">
                                    <router-link :to="getStackLink(stack)" class="btn btn-sm btn-outline-primary">
                                        <font-awesome-icon icon="pen" />
                                    </router-link>
                                </td>
                            </tr>
                        </template>
                    </template>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script>
import { RUNNING, EXITED, CREATED_STACK, CREATED_FILE } from "../../../common/util-common";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";

export default {
    components: {
        FontAwesomeIcon,
    },
    data() {
        return {
            loading: false,
            rawDomainList: [], // Array of { endpoint, ...stackInfo }
            refreshFallbackTimer: null,
            refreshRequestId: 0,
            unavailableEndpoints: [],
        };
    },
    computed: {
        showEndpoint() {
            return Object.keys(this.$root.agentList).length > 1;
        },
        requestableEndpoints() {
            const endpoints = Object.keys(this.$root.agentList);
            if (endpoints.length === 0) {
                return [ "" ];
            }

            return endpoints.filter((endpoint) => {
                return endpoint === "" || this.$root.agentStatusList[endpoint] === "online";
            });
        },
        requestableEndpointSignature() {
            return JSON.stringify(this.requestableEndpoints);
        },
        unavailableEndpointLabels() {
            return this.unavailableEndpoints.map((endpoint) => {
                return this.$root.endpointDisplayFunction(endpoint);
            });
        },
        domainList() {
            return this.rawDomainList.filter((item) => {
                return item.services && item.services.length > 0;
            }).sort((a, b) => {
                if (a.status === RUNNING && b.status !== RUNNING) {
                    return -1;
                }
                if (a.status !== RUNNING && b.status === RUNNING) {
                    return 1;
                }
                return a.stackName.localeCompare(b.stackName);
            });
        },
    },
    watch: {
        requestableEndpointSignature(newValue, oldValue) {
            if (newValue !== oldValue) {
                this.refresh();
            }
        },
    },
    mounted() {
        this.refresh();
    },
    beforeUnmount() {
        if (this.refreshFallbackTimer) {
            clearTimeout(this.refreshFallbackTimer);
            this.refreshFallbackTimer = null;
        }
    },
    methods: {
        clearRefreshFallbackTimer() {
            if (this.refreshFallbackTimer) {
                clearTimeout(this.refreshFallbackTimer);
                this.refreshFallbackTimer = null;
            }
        },
        markEndpointUnavailable(endpoint) {
            if (this.unavailableEndpoints.includes(endpoint)) {
                return;
            }
            this.unavailableEndpoints.push(endpoint);
        },
        refresh() {
            const requestId = ++this.refreshRequestId;
            this.loading = true;
            this.rawDomainList = [];
            this.unavailableEndpoints = [];

            this.clearRefreshFallbackTimer();

            const endpoints = [ ...this.requestableEndpoints ];
            const pendingEndpoints = new Set(endpoints);
            const offlineEndpoints = Object.keys(this.$root.agentList).filter((endpoint) => {
                return endpoint !== "" && this.$root.agentStatusList[endpoint] === "offline";
            });
            offlineEndpoints.forEach((endpoint) => {
                this.markEndpointUnavailable(endpoint);
            });

            const finishRefresh = (endpoint) => {
                if (requestId !== this.refreshRequestId) {
                    return;
                }

                pendingEndpoints.delete(endpoint);
                if (pendingEndpoints.size === 0) {
                    this.loading = false;
                    this.clearRefreshFallbackTimer();
                }
            };

            if (pendingEndpoints.size === 0) {
                this.loading = false;
                return;
            }

            for (const endpoint of endpoints) {
                this.$root.emitAgent(endpoint, "getDomainList", (res) => {
                    if (requestId !== this.refreshRequestId) {
                        return;
                    }

                    if (res.ok && Array.isArray(res.domains)) {
                        const items = res.domains.map((item) => ({
                            ...item,
                            endpoint,
                        }));
                        this.rawDomainList.push(...items);
                    } else {
                        this.markEndpointUnavailable(endpoint);
                    }

                    finishRefresh(endpoint);
                });
            }

            this.refreshFallbackTimer = setTimeout(() => {
                if (requestId !== this.refreshRequestId) {
                    return;
                }

                for (const endpoint of pendingEndpoints) {
                    this.markEndpointUnavailable(endpoint);
                }

                if (this.loading) {
                    this.loading = false;
                }
                this.clearRefreshFallbackTimer();
            }, 5000);
        },
        getStatusClass(status) {
            switch (status) {
                case RUNNING:
                    return "bg-success";
                case EXITED:
                    return "bg-danger";
                case CREATED_STACK:
                case CREATED_FILE:
                    return "bg-warning";
                default:
                    return "bg-secondary";
            }
        },
        getStatusText(status) {
            switch (status) {
                case RUNNING:
                    return this.$t("running");
                case EXITED:
                    return this.$t("exited");
                case CREATED_STACK:
                    return this.$t("created");
                case CREATED_FILE:
                    return this.$t("fileCreated");
                default:
                    return this.$t("unknown");
            }
        },
        getStackLink(stack) {
            if (stack.endpoint) {
                return `/compose/${stack.stackName}/${stack.endpoint}`;
            }
            return `/compose/${stack.stackName}`;
        },
    },
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

.status-indicator {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
}

.domain-link {
    text-decoration: none;
    color: $primary;

    &:hover {
        text-decoration: underline;
    }
}

.small-icon {
    font-size: 0.75em;
    opacity: 0.7;
}

.shadow-box {
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(0,0,0,0.05);

    .dark & {
        border-color: rgba(255,255,255,0.05);
    }
}

.table {
    margin-bottom: 0;

    th {
        border-top: none;
        background-color: rgba(0,0,0,0.02);
        font-weight: 600;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: $light-font-color2;
        padding: 1rem;

        .dark & {
            background-color: rgba(255,255,255,0.05);
            color: $dark-font-color2;
        }
    }

    td {
        padding: 1rem;
        vertical-align: middle;
        border-bottom: 1px solid rgba(0,0,0,0.05);

        .dark & {
            border-bottom-color: rgba(255,255,255,0.05);
            color: $dark-font-color;
        }
    }

    tbody tr:last-child td {
        border-bottom: none;
    }
}
</style>
