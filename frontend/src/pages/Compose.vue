<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 v-if="isAdd" class="mb-3">{{ $t("compose") }}</h1>
            <h1 v-else class="mb-3">
                <Uptime :stack="globalStack" :pill="true" /> {{ stack.name }}
                <span v-if="$root.agentCount > 1" class="agent-name">
                    ({{ endpointDisplay }})
                </span>
            </h1>

            <div v-if="stack.isManagedByDockge && !isAdd" class="mb-3">
                <ul class="nav nav-pills small">
                    <li class="nav-item">
                        <button class="nav-link" :class="{ active: tab === 'compose' }" @click="tab = 'compose'">
                            <font-awesome-icon icon="pen-to-square" class="me-1" />
                            {{ $t("Compose") }}
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" :class="{ active: tab === 'monitoring' }" @click="tab = 'monitoring'">
                            <font-awesome-icon icon="chart-line" class="me-1" />
                            {{ $t("Monitoring") }}
                        </button>
                    </li>
                </ul>
            </div>

            <div v-if="stack.isManagedByDockge && tab === 'compose'" class="mb-3">
                <div class="btn-group me-2" role="group">
                    <button v-if="isEditMode" class="btn btn-primary" :disabled="processing" @click="deployStack">
                        <font-awesome-icon icon="rocket" class="me-1" />
                        {{ $t("deployStack") }}
                    </button>

                    <button v-if="isEditMode" class="btn btn-normal" :disabled="processing" @click="saveStack">
                        <font-awesome-icon icon="save" class="me-1" />
                        {{ $t("saveStackDraft") }}
                    </button>

                    <button v-if="!isEditMode" class="btn btn-secondary" :disabled="processing" @click="enableEditMode">
                        <font-awesome-icon icon="pen" class="me-1" />
                        {{ $t("editStack") }}
                    </button>

                    <button v-if="!isEditMode && !active" class="btn btn-primary" :disabled="processing" @click="startStack">
                        <font-awesome-icon icon="play" class="me-1" />
                        {{ $t("startStack") }}
                    </button>

                    <button v-if="!isEditMode && active" class="btn btn-normal " :disabled="processing" @click="restartStack">
                        <font-awesome-icon icon="rotate" class="me-1" />
                        {{ $t("restartStack") }}
                    </button>

                    <button v-if="!isEditMode" class="btn btn-normal" :disabled="processing" @click="updateStack">
                        <font-awesome-icon icon="cloud-arrow-down" class="me-1" />
                        {{ $t("updateStack") }}
                    </button>

                    <button v-if="!isEditMode && active" class="btn btn-normal" :disabled="processing" @click="stopStack">
                        <font-awesome-icon icon="stop" class="me-1" />
                        {{ $t("stopStack") }}
                    </button>

                    <BDropdown right text="" variant="normal">
                        <BDropdownItem @click="downStack">
                            <font-awesome-icon icon="stop" class="me-1" />
                            {{ $t("downStack") }}
                        </BDropdownItem>
                    </BDropdown>
                </div>

                <button v-if="isEditMode && !isAdd" class="btn btn-normal" :disabled="processing" @click="discardStack">{{ $t("discardStack") }}</button>
                <button v-if="!isEditMode" class="btn btn-danger" :disabled="processing" @click="showDeleteDialog = !showDeleteDialog">
                    <font-awesome-icon icon="trash" class="me-1" />
                    {{ $t("deleteStack") }}
                </button>
            </div>

            <!-- URLs -->
            <div v-if="urls.length > 0" class="mb-3">
                <a v-for="(url, index) in urls" :key="index" target="_blank" :href="url.url">
                    <span class="badge bg-secondary me-2">{{ url.display }}</span>
                </a>
            </div>

            <!-- Progress Terminal -->
            <transition name="slide-fade" appear>
                <Terminal
                    v-show="showProgressTerminal"
                    ref="progressTerminal"
                    class="mb-3 terminal"
                    :name="terminalName"
                    :endpoint="endpoint"
                    :rows="progressTerminalRows"
                    @has-data="showProgressTerminal = true; submitted = true;"
                ></Terminal>
            </transition>
            <!-- Tab Content: Compose -->
            <div v-if="stack.isManagedByDockge && tab === 'compose'" class="row animate-fade-in">
                <div class="col-lg-6">
                    <!-- General -->
                    <div v-if="isAdd">
                        <h4 class="mb-3">{{ $t("general") }}</h4>
                        <div class="shadow-box glass big-padding mb-3">
                            <!-- Stack Name -->
                            <div>
                                <label for="name" class="form-label">{{ $t("stackName") }}</label>
                                <input id="name" v-model="stack.name" type="text" class="form-control" required @blur="stackNameToLowercase">
                                <div class="form-text">{{ $t("Lowercase only") }}</div>
                            </div>

                            <!-- Endpoint -->
                            <div class="mt-3">
                                <label for="name" class="form-label">{{ $t("dockgeAgent") }}</label>
                                <select v-model="stack.endpoint" class="form-select">
                                    <option v-for="(agent, endpoint) in $root.agentList" :key="endpoint" :value="endpoint" :disabled="$root.agentStatusList[endpoint] != 'online'">
                                        ({{ $root.agentStatusList[endpoint] }}) {{ (endpoint) ? endpoint : $t("currentEndpoint") }}
                                    </option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Containers -->
                    <h4 class="mb-3">{{ $tc("container", 2) }}</h4>

                    <div v-if="isEditMode" class="input-group mb-3">
                        <input
                            v-model="newContainerName"
                            :placeholder="$t(`New Container Name...`)"
                            class="form-control"
                            @keyup.enter="addContainer"
                        />
                        <button class="btn btn-primary" @click="addContainer">
                            {{ $t("addContainer") }}
                        </button>
                    </div>

                    <div ref="containerList">
                        <Container
                            v-for="(service, name) in jsonConfig.services"
                            :key="name"
                            :name="name"
                            :is-edit-mode="isEditMode"
                            :first="name === Object.keys(jsonConfig.services)[0]"
                            :status="serviceStatusList[name]"
                        />
                    </div>

                    <button v-if="false && isEditMode && jsonConfig.services && Object.keys(jsonConfig.services).length > 0" class="btn btn-normal mb-3" @click="addContainer">{{ $t("addContainer") }}</button>

                    <!-- General -->
                    <div v-if="isEditMode">
                        <h4 class="mb-3">{{ $t("extra") }}</h4>
                        <div class="shadow-box glass big-padding mb-3">
                            <!-- URLs -->
                            <div class="mb-4">
                                <label class="form-label">
                                    {{ $tc("url", 2) }}
                                </label>
                                <ArrayInput name="urls" :display-name="$t('url')" placeholder="https://" object-type="x-dockge" />
                            </div>
                        </div>
                    </div>

                    <!-- Combined Terminal Output -->
                    <div v-show="!isEditMode">
                        <h4 class="mb-3">{{ $t("terminal") }}</h4>
                        <Terminal
                            ref="combinedTerminal"
                            class="mb-3 terminal"
                            :name="combinedTerminalName"
                            :endpoint="endpoint"
                            :rows="combinedTerminalRows"
                            :cols="combinedTerminalCols"
                            style="height: 315px;"
                        ></Terminal>
                    </div>
                </div>
                <div class="col-lg-6">
                    <h4 class="mb-3">{{ stack.composeFileName }}</h4>

                    <!-- YAML editor -->
                    <div class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode}">
                        <CodeEditor
                            ref="editor"
                            v-model="stack.composeYAML"
                            language="yaml"
                            :readonly="!isEditMode"
                            height="300px"
                            @change="yamlCodeChange"
                            @focus="editorFocus = true"
                            @blur="editorFocus = false"
                        />
                    </div>
                    <div v-if="isEditMode" class="mb-3">
                        {{ yamlError }}
                    </div>

                    <!-- ENV editor -->
                    <div v-if="isEditMode">
                        <h4 class="mb-3">.env</h4>
                        <div class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode}">
                            <CodeEditor
                                v-model="stack.composeENV"
                                language="env"
                                :readonly="!isEditMode"
                                height="200px"
                                @focus="editorFocus = true"
                                @blur="editorFocus = false"
                            />
                        </div>
                    </div>

                    <div v-if="isEditMode">
                        <!-- Networks -->
                        <h4 class="mb-3">{{ $tc("network", 2) }}</h4>
                        <div class="shadow-box glass big-padding mb-3">
                            <NetworkInput />
                        </div>

                        <!-- Custom File Editor -->
                        <CustomFileEditor
                            :stack-name="stack.name"
                            :endpoint="endpoint"
                            :is-edit-mode="isEditMode"
                        />
                    </div>
                </div>
            </div>

            <div v-if="stack.isManagedByDockge && tab === 'monitoring' && !isAdd" class="animate-fade-in">
                <div class="shadow-box glass big-padding">
                    <div v-if="currentStackStats.length === 0" class="text-center py-5">
                        <template v-if="active">
                            <div class="spinner-border text-primary mb-3" role="status"></div>
                            <p class="text-secondary">{{ $t("loadingStats") }}</p>
                        </template>
                        <template v-else>
                            <font-awesome-icon icon="info-circle" size="3x" class="text-secondary mb-3 opacity-25" />
                            <p class="text-secondary">{{ $t("inactive") }}</p>
                        </template>
                    </div>

                    <div v-else class="service-stats-list">
                        <div class="d-flex justify-content-between align-items-center mb-4">
                            <p class="text-secondary mb-0 fw-bold">{{ $t("Real-time Resource Usage") }}</p>
                            <button class="btn btn-sm btn-outline-secondary px-3" @click="expandedStats = !expandedStats">
                                <font-awesome-icon :icon="expandedStats ? 'compress' : 'expand'" class="me-2" />
                                {{ expandedStats ? $t("Compact View") : $t("Expanded View") }}
                            </button>
                        </div>

                        <div v-for="service in currentStackStats" :key="service.ID" class="service-stats-item mb-5 pb-4 border-bottom last-child-no-border animate-fade-in">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h5 class="mb-0 fw-bold">
                                    <font-awesome-icon icon="cube" class="me-2 text-primary opacity-75" />
                                    {{ service.Name }}
                                </h5>
                                <code class="text-secondary small">{{ service.ID }}</code>
                            </div>

                            <div class="row g-4">
                                <div :class="expandedStats ? 'col-12' : 'col-md-6'">
                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                        <div class="d-flex align-items-center">
                                            <small class="text-secondary fw-500 text-nowrap me-2">{{ $t("CPU") }}</small>
                                            <Sparkline
                                                v-if="statsHistory[service.ID]"
                                                :data="statsHistory[service.ID].cpu"
                                                :width="expandedStats ? 400 : 120"
                                                :height="expandedStats ? 60 : 30"
                                                class="ms-2 opacity-75"
                                                color="primary"
                                                suffix="%"
                                            />
                                        </div>
                                        <span class="fw-bold text-nowrap">{{ service.CPUPerc }}</span>
                                    </div>
                                    <div class="progress" :style="{ height: expandedStats ? '10px' : '6px' }">
                                        <div
                                            class="progress-bar"
                                            :class="getUsageClass(parseFloat(service.CPUPerc))"
                                            :style="{ width: service.CPUPerc }"
                                        ></div>
                                    </div>
                                </div>

                                <div :class="expandedStats ? 'col-12' : 'col-md-6'">
                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                        <div class="d-flex align-items-center">
                                            <small class="text-secondary fw-500 text-nowrap me-2">{{ $t("Memory") }}</small>
                                            <Sparkline
                                                v-if="statsHistory[service.ID]"
                                                :data="statsHistory[service.ID].mem"
                                                :width="expandedStats ? 400 : 120"
                                                :height="expandedStats ? 60 : 30"
                                                class="ms-2 opacity-75"
                                                color="success"
                                                suffix="%"
                                            />
                                        </div>
                                        <span class="fw-bold text-nowrap">
                                            {{ service.MemPerc }}
                                            <small class="fw-normal text-secondary ms-1">({{ service.MemUsage }})</small>
                                        </span>
                                    </div>
                                    <div class="progress" :style="{ height: expandedStats ? '10px' : '6px' }">
                                        <div
                                            class="progress-bar"
                                            :class="getUsageClass(parseFloat(service.MemPerc))"
                                            :style="{ width: service.MemPerc }"
                                        ></div>
                                    </div>
                                </div>

                                <div class="col-md-6">
                                    <div class="d-flex align-items-center text-nowrap mb-2">
                                        <font-awesome-icon icon="network-wired" class="me-3 text-secondary opacity-50" />
                                        <div class="d-flex gap-4">
                                            <div class="d-flex align-items-center">
                                                <font-awesome-icon icon="arrow-down" class="me-1 text-success" />
                                                <small class="fw-500">{{ getNetIOPart(service.NetIO, 0) }}</small>
                                                <Sparkline
                                                    v-if="statsHistory[service.ID]"
                                                    :data="statsHistory[service.ID].netIn"
                                                    :width="expandedStats ? 120 : 60"
                                                    :height="30"
                                                    class="ms-2 opacity-50"
                                                    color="success"
                                                    :max="0"
                                                    :formatValue="formatBytes"
                                                />
                                            </div>
                                            <div class="d-flex align-items-center">
                                                <font-awesome-icon icon="arrow-up" class="me-1 text-primary" />
                                                <small class="fw-500">{{ getNetIOPart(service.NetIO, 1) }}</small>
                                                <Sparkline
                                                    v-if="statsHistory[service.ID]"
                                                    :data="statsHistory[service.ID].netOut"
                                                    :width="expandedStats ? 120 : 60"
                                                    :height="30"
                                                    class="ms-2 opacity-50"
                                                    color="primary"
                                                    :max="0"
                                                    :formatValue="formatBytes"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <!-- Speed line -->
                                    <div class="d-flex align-items-center text-nowrap mt-3">
                                        <small class="text-secondary me-3" style="width: 40px;">{{ $t("Speed") }}</small>
                                        <div class="d-flex gap-4">
                                            <div class="d-flex align-items-center">
                                                <Sparkline
                                                    v-if="statsHistory[service.ID]"
                                                    :data="statsHistory[service.ID].netInSpeed"
                                                    :width="expandedStats ? 150 : 80"
                                                    :height="30"
                                                    color="success"
                                                    class="opacity-100"
                                                    :max="0"
                                                    :formatValue="(v) => formatBytes(v) + '/s'"
                                                />
                                            </div>
                                            <div class="d-flex align-items-center">
                                                <Sparkline
                                                    v-if="statsHistory[service.ID]"
                                                    :data="statsHistory[service.ID].netOutSpeed"
                                                    :width="expandedStats ? 150 : 80"
                                                    :height="30"
                                                    color="primary"
                                                    class="opacity-100"
                                                    :max="0"
                                                    :formatValue="(v) => formatBytes(v) + '/s'"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="col-md-6 text-md-end">
                                    <div class="d-inline-flex align-items-center text-nowrap">
                                        <font-awesome-icon icon="hdd" class="me-2 text-secondary opacity-50" />
                                        <div class="d-flex align-items-center align-items-md-end flex-column flex-md-row">
                                            <small class="text-secondary me-2">
                                                {{ $t("Disk IO") }}: <span class="text-dark fw-bold ms-1">{{ service.BlockIO || "0B / 0B" }}</span>
                                            </small>
                                            <div class="d-flex align-items-center">
                                                <Sparkline
                                                    v-if="statsHistory[service.ID]"
                                                    :data="statsHistory[service.ID].diskRead"
                                                    :width="expandedStats ? 120 : 50"
                                                    :height="expandedStats ? 30 : 15"
                                                    class="ms-2 opacity-50"
                                                    color="info"
                                                    :max="0"
                                                    :formatValue="formatBytes"
                                                />
                                                <Sparkline
                                                    v-if="statsHistory[service.ID]"
                                                    :data="statsHistory[service.ID].diskWrite"
                                                    :width="expandedStats ? 120 : 50"
                                                    :height="expandedStats ? 30 : 15"
                                                    class="ms-1 opacity-50"
                                                    color="warning"
                                                    :max="0"
                                                    :formatValue="formatBytes"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="!stack.isManagedByDockge && !processing">
                {{ $t("stackNotManagedByDockgeMsg") }}
            </div>

            <!-- Delete Dialog -->
            <BModal v-model="showDeleteDialog" :cancelTitle="$t('cancel')" :okTitle="$t('deleteStack')" okVariant="danger" @ok="deleteDialog">
                {{ $t("deleteStackMsg") }}
            </BModal>
        </div>
    </transition>
</template>

<script>
import { parseDocument, Document } from "yaml";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import CodeEditor from "../components/CodeEditor.vue";
import {
    COMBINED_TERMINAL_COLS,
    COMBINED_TERMINAL_ROWS,
    copyYAMLComments, envsubstYAML,
    getCombinedTerminalName,
    getComposeTerminalName,
    PROGRESS_TERMINAL_ROWS,
    RUNNING
} from "../../../common/util-common";
import { BModal } from "bootstrap-vue-next";
import NetworkInput from "../components/NetworkInput.vue";
import CustomFileEditor from "../components/CustomFileEditor.vue";
import Sparkline from "../components/Sparkline.vue";
import dotenv from "dotenv";

const template = `
services:
  nginx:
    image: nginx:latest
    restart: unless-stopped
    ports:
      - "8080:80"
`;
const envDefault = "# VARIABLE=value #comment";

let yamlErrorTimeout = null;

let serviceStatusTimeout = null;

export default {
    components: {
        NetworkInput,
        CustomFileEditor,
        FontAwesomeIcon,
        CodeEditor,
        BModal,
        Sparkline,
    },
    beforeRouteUpdate(to, from, next) {
        this.exitConfirm(next);
    },
    beforeRouteLeave(to, from, next) {
        this.exitConfirm(next);
    },
    yamlDoc: null,  // For keeping the yaml comments
    data() {
        return {
            editorFocus: false,
            jsonConfig: {},
            envsubstJSONConfig: {},
            yamlError: "",
            processing: true,
            showProgressTerminal: false,
            progressTerminalRows: PROGRESS_TERMINAL_ROWS,
            combinedTerminalRows: COMBINED_TERMINAL_ROWS,
            combinedTerminalCols: COMBINED_TERMINAL_COLS,
            stack: {

            },
            serviceStatusList: {},
            isEditMode: false,
            submitted: false,
            showDeleteDialog: false,
            newContainerName: "",
            stopServiceStatusTimeout: false,
            tab: "compose",
            currentStackStats: [],
            statsHistory: {}, // { serviceID: { cpu: [], mem: [] } }
            expandedStats: false, // Toggle larger charts
        };
    },
    computed: {

        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.endpoint);
        },

        urls() {
            if (!this.envsubstJSONConfig["x-dockge"] || !this.envsubstJSONConfig["x-dockge"].urls || !Array.isArray(this.envsubstJSONConfig["x-dockge"].urls)) {
                return [];
            }

            let urls = [];
            for (const url of this.envsubstJSONConfig["x-dockge"].urls) {
                let display;
                try {
                    let obj = new URL(url);
                    let pathname = obj.pathname;
                    if (pathname === "/") {
                        pathname = "";
                    }
                    display = obj.host + pathname + obj.search;
                } catch (e) {
                    display = url;
                }

                urls.push({
                    display,
                    url,
                });
            }
            return urls;
        },

        isAdd() {
            return this.$route.path === "/compose" && !this.submitted;
        },

        /**
         * Get the stack from the global stack list, because it may contain more real-time data like status
         * @return {*}
         */
        globalStack() {
            return this.$root.completeStackList[this.stack.name + "_" + this.endpoint];
        },

        status() {
            return this.globalStack?.status;
        },

        active() {
            return this.status === RUNNING;
        },

        terminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getComposeTerminalName(this.endpoint, this.stack.name);
        },

        combinedTerminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getCombinedTerminalName(this.endpoint, this.stack.name);
        },

        networks() {
            return this.jsonConfig.networks;
        },

        endpoint() {
            return this.stack.endpoint || this.$route.params.endpoint || "";
        },

        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },
    },
    watch: {
        "stack.composeYAML": {
            handler() {
                if (this.editorFocus) {
                    console.debug("yaml code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        "stack.composeENV": {
            handler() {
                if (this.editorFocus) {
                    console.debug("env code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        jsonConfig: {
            handler() {
                if (!this.editorFocus) {
                    console.debug("jsonConfig changed");

                    let doc = new Document(this.jsonConfig);

                    // Stick back the yaml comments
                    if (this.yamlDoc) {
                        copyYAMLComments(doc, this.yamlDoc);
                    }

                    this.stack.composeYAML = doc.toString();
                    this.yamlDoc = doc;
                }
            },
            deep: true,
        },

        tab(newTab) {
            if (newTab === "monitoring") {
                this.subscribeStats();
            } else {
                this.unsubscribeStats();
            }
        },

        $route(to, from) {

        }
    },
    mounted() {
        if (this.isAdd) {
            this.processing = false;
            this.isEditMode = true;

            let composeYAML;
            let composeENV;

            if (this.$root.composeTemplate) {
                composeYAML = this.$root.composeTemplate;
                this.$root.composeTemplate = "";
            } else {
                composeYAML = template;
            }
            if (this.$root.envTemplate) {
                composeENV = this.$root.envTemplate;
                this.$root.envTemplate = "";
            } else {
                composeENV = envDefault;
            }

            // Default Values
            this.stack = {
                name: "",
                composeYAML,
                composeENV,
                isManagedByDockge: true,
                endpoint: "",
            };

            this.yamlCodeChange();

        } else {
            this.stack.name = this.$route.params.stackName;
            this.loadStack();
        }

        this.requestServiceStatus();

        this.$root.getSocket().on("agent", this.onAgentEvent);
    },
    beforeUnmount() {
        this.$root.getSocket().off("agent", this.onAgentEvent);
        this.unsubscribeStats();
    },
    methods: {
        onAgentEvent(event, data) {
            if (event === "stackStats" && data.stackName === this.stack.name && (data.endpoint || "") === (this.endpoint || "")) {
                this.updateStatsHistory(Array.isArray(data.stats) ? data.stats : []);
            }
        },

        updateStatsHistory(statsList) {
            this.currentStackStats = statsList;

            for (const service of statsList) {
                if (!this.statsHistory[service.ID]) {
                    this.statsHistory[service.ID] = {
                        cpu: [],
                        mem: [],
                        netIn: [],
                        netOut: [],
                        netInSpeed: [],
                        netOutSpeed: [],
                        diskRead: [],
                        diskWrite: [],
                    };
                }

                const cpu = parseFloat(service.CPUPerc) || 0;
                const memPerc = parseFloat(service.MemPerc) || 0;

                const netIn = this.parseSize(this.getNetIOPart(service.NetIO, 0));
                const netOut = this.parseSize(this.getNetIOPart(service.NetIO, 1));
                const diskRead = this.parseSize(this.getNetIOPart(service.BlockIO, 0));
                const diskWrite = this.parseSize(this.getNetIOPart(service.BlockIO, 1));

                // Calculate speeds
                const history = this.statsHistory[service.ID];
                let inSpeed = 0;
                let outSpeed = 0;
                if (history.netIn.length > 0) {
                    const lastIn = history.netIn[history.netIn.length - 1];
                    const lastOut = history.netOut[history.netOut.length - 1];
                    // Standard interval is 5s
                    inSpeed = Math.max(0, (netIn - (typeof lastIn === "object" ? lastIn.value : lastIn)) / 5);
                    outSpeed = Math.max(0, (netOut - (typeof lastOut === "object" ? lastOut.value : lastOut)) / 5);
                }

                history.cpu.push(cpu);
                history.mem.push({
                    value: memPerc,
                    label: `${memPerc.toFixed(2)}% (${service.MemUsage})`,
                });
                history.netIn.push(netIn);
                history.netOut.push(netOut);
                history.netInSpeed.push(inSpeed);
                history.netOutSpeed.push(outSpeed);
                history.diskRead.push(diskRead);
                history.diskWrite.push(diskWrite);

                // Keep up to 600 points (approx 50 mins at 5s interval)
                ["cpu", "mem", "netIn", "netOut", "netInSpeed", "netOutSpeed", "diskRead", "diskWrite"].forEach(key => {
                    if (history[key].length > 600) {
                        history[key].shift();
                    }
                });
            }
        },

        parseSize(sizeStr) {
            if (typeof sizeStr !== "string") return 0;
            const units = {
                "b": 1,
                "kb": 1000,
                "mb": 1000 * 1000,
                "gb": 1000 * 1000 * 1000,
                "tb": 1000 * 1000 * 1000 * 1000,
                "kib": 1024,
                "mib": 1024 * 1024,
                "gib": 1024 * 1024 * 1024,
                "tib": 1024 * 1024 * 1024 * 1024,
            };
            const match = sizeStr.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/);
            if (!match) return 0;
            const value = parseFloat(match[1]);
            const unit = match[2];
            return value * (units[unit] || 1);
        },

        subscribeStats() {
            if (this.endpoint !== undefined && this.stack.name) {
                this.$root.emitAgent(this.endpoint, "subscribeStackStats", this.stack.name);
            }
        },

        unsubscribeStats() {
            if (this.endpoint !== undefined && this.stack.name) {
                this.$root.emitAgent(this.endpoint, "unsubscribeStackStats", this.stack.name);
            }
        },

        getNetIOPart(netIO, index) {
            if (typeof netIO !== "string") return "0B";
            const parts = netIO.split(" / ");
            return parts[index] || "0B";
        },

        formatBytes(bytes) {
            if (bytes === 0) return "0B";
            const k = 1024;
            const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + sizes[i];
        },

        getUsageClass(perc) {
            const usage = Number.isFinite(perc) ? perc : 0;
            if (usage > 80) return "bg-danger";
            if (usage > 50) return "bg-warning";
            return "bg-primary";
        },
        startServiceStatusTimeout() {
            clearTimeout(serviceStatusTimeout);
            serviceStatusTimeout = setTimeout(async () => {
                this.requestServiceStatus();
            }, 5000);
        },

        requestServiceStatus() {
            // Do not request if it is add mode
            if (this.isAdd) {
                return;
            }

            this.$root.emitAgent(this.endpoint, "serviceStatusList", this.stack.name, (res) => {
                if (res.ok) {
                    this.serviceStatusList = res.serviceStatusList;
                }
                if (!this.stopServiceStatusTimeout) {
                    this.startServiceStatusTimeout();
                }
            });
        },

        exitConfirm(next) {
            if (this.isEditMode) {
                if (confirm(this.$t("confirmLeaveStack"))) {
                    this.exitAction();
                    next();
                } else {
                    next(false);
                }
            } else {
                this.exitAction();
                next();
            }
        },

        exitAction() {
            console.log("exitAction");
            this.stopServiceStatusTimeout = true;
            clearTimeout(serviceStatusTimeout);

            // Leave Combined Terminal
            console.debug("leaveCombinedTerminal", this.endpoint, this.stack.name);
            this.$root.emitAgent(this.endpoint, "leaveCombinedTerminal", this.stack.name, () => {});
        },

        bindTerminal() {
            this.$refs.progressTerminal?.bind(this.endpoint, this.terminalName);
        },

        loadStack() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "getStack", this.stack.name, (res) => {
                if (res.ok) {
                    this.stack = res.stack;
                    this.yamlCodeChange();
                    this.processing = false;
                    this.bindTerminal();
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        deployStack() {
            this.processing = true;

            if (!this.jsonConfig.services) {
                this.$root.toastError("No services found in compose.yaml");
                this.processing = false;
                return;
            }

            // Check if services is object
            if (typeof this.jsonConfig.services !== "object") {
                this.$root.toastError("Services must be an object");
                this.processing = false;
                return;
            }

            let serviceNameList = Object.keys(this.jsonConfig.services);

            // Set the stack name if empty, use the first container name
            if (!this.stack.name && serviceNameList.length > 0) {
                let serviceName = serviceNameList[0];
                let service = this.jsonConfig.services[serviceName];

                if (service && service.container_name) {
                    this.stack.name = service.container_name;
                } else {
                    this.stack.name = serviceName;
                }
            }

            this.bindTerminal();

            this.$root.emitAgent(this.stack.endpoint, "deployStack", this.stack.name, this.stack.composeYAML, this.stack.composeENV, this.isAdd, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.isEditMode = false;
                    this.$router.push(this.url);
                }
            });
        },

        saveStack() {
            this.processing = true;

            this.$root.emitAgent(this.stack.endpoint, "saveStack", this.stack.name, this.stack.composeYAML, this.stack.composeENV, this.isAdd, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.isEditMode = false;
                    this.$router.push(this.url);
                }
            });
        },

        startStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "startStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        stopStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "stopStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        downStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "downStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        restartStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "restartStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        updateStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "updateStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        deleteDialog() {
            this.$root.emitAgent(this.endpoint, "deleteStack", this.stack.name, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.$router.push("/");
                }
            });
        },

        discardStack() {
            this.loadStack();
            this.isEditMode = false;
        },

        yamlToJSON(yaml) {
            let doc = parseDocument(yaml);
            if (doc.errors.length > 0) {
                throw doc.errors[0];
            }

            const config = doc.toJS() ?? {};

            // Check data types
            // "services" must be an object
            if (!config.services) {
                config.services = {};
            }

            if (Array.isArray(config.services) || typeof config.services !== "object") {
                throw new Error("Services must be an object");
            }

            return {
                config,
                doc,
            };
        },

        yamlCodeChange() {
            try {
                let { config, doc } = this.yamlToJSON(this.stack.composeYAML);

                this.yamlDoc = doc;
                this.jsonConfig = config;

                let env = dotenv.parse(this.stack.composeENV);
                let envYAML = envsubstYAML(this.stack.composeYAML, env);
                this.envsubstJSONConfig = this.yamlToJSON(envYAML).config;

                clearTimeout(yamlErrorTimeout);
                this.yamlError = "";
            } catch (e) {
                clearTimeout(yamlErrorTimeout);

                if (this.yamlError) {
                    this.yamlError = e.message;

                } else {
                    yamlErrorTimeout = setTimeout(() => {
                        this.yamlError = e.message;
                    }, 3000);
                }
            }
        },

        enableEditMode() {
            this.isEditMode = true;
        },

        checkYAML() {

        },

        addContainer() {
            this.checkYAML();

            if (this.jsonConfig.services[this.newContainerName]) {
                this.$root.toastError("Container name already exists");
                return;
            }

            if (!this.newContainerName) {
                this.$root.toastError("Container name cannot be empty");
                return;
            }

            this.jsonConfig.services[this.newContainerName] = {
                restart: "unless-stopped",
            };
            this.newContainerName = "";
            let element = this.$refs.containerList.lastElementChild;
            element.scrollIntoView({
                block: "start",
                behavior: "smooth"
            });
        },

        stackNameToLowercase() {
            this.stack.name = this.stack?.name?.toLowerCase();
        },

    }
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

.terminal {
    height: 200px;
}

.editor-box {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    &.edit-mode {
        background-color: $dark-bg2 !important; // 默认深色背景

        // 浅色模式下的样式
        body:not(.dark) & {
            background-color: $light-bg2 !important;
        }
    }
}

.agent-name {
    font-size: 13px;
    color: $dark-font-color3;
}
</style>
