<template>
    <div v-if="isEditMode" class="custom-file-editor">
        <h4 class="mb-3">{{ $t("customFiles") }}</h4>

        <!-- File selector -->
        <div class="shadow-box big-padding mb-3">
            <div class="mb-3">
                <label class="form-label">{{ $t("selectOrEnterFile") }}</label>
                <div class="input-group">
                    <select v-model="selectedFile" class="form-select" @change="loadSelectedFile">
                        <option value="">{{ $t("selectFile") }}</option>
                        <option v-for="file in fileList" :key="file.name" :value="file.name">
                            {{ file.name }}
                        </option>
                    </select>
                    <button class="btn btn-secondary" @click="showCustomInput = !showCustomInput">
                        <font-awesome-icon icon="keyboard" class="me-1" />
                        {{ $t("manual") }}
                    </button>
                    <button class="btn btn-primary" :disabled="!selectedFile" @click="loadFile">
                        <font-awesome-icon icon="edit" class="me-1" />
                        {{ $t("edit") }}
                    </button>
                    <button class="btn btn-secondary" @click="loadFileList">
                        <font-awesome-icon icon="arrows-rotate" class="me-1" />
                        {{ $t("refresh") }}
                    </button>
                </div>
            </div>

            <!-- Custom file path input -->
            <div v-if="showCustomInput" class="mb-3">
                <label class="form-label">{{ $t("customFilePath") }}</label>
                <div class="input-group">
                    <input
                        v-model="customFilePath"
                        type="text"
                        class="form-control"
                        :placeholder="$t('enterFilePath')"
                        @keyup.enter="loadCustomFile"
                    />
                    <button class="btn btn-success" :disabled="!customFilePath" @click="createNewFile">
                        <font-awesome-icon icon="plus" class="me-1" />
                        {{ $t("create") }}
                    </button>
                    <button class="btn btn-primary" :disabled="!customFilePath" @click="loadCustomFile">
                        <font-awesome-icon icon="edit" class="me-1" />
                        {{ $t("edit") }}
                    </button>
                </div>
                <div class="form-text">{{ $t("relativeToStackDir") }}</div>
            </div>
        </div>

        <!-- File Editor Modal -->
        <BModal
            v-model="showEditor"
            :title="currentFile || $t('fileEditor')"
            size="xl"
            :cancel-title="$t('close')"
            :ok-title="$t('saveFile')"
            @ok="saveFile"
            @cancel="closeFile"
        >
            <div v-if="currentFile" class="file-editor-modal">
                <div class="mb-3">
                    <strong>{{ $t("file") }}:</strong> {{ currentFile }}
                </div>
                <div class="editor-container">
                    <prism-editor
                        v-model="fileContent"
                        class="file-editor"
                        :highlight="highlighterText"
                        line-numbers
                    ></prism-editor>
                </div>
            </div>
        </BModal>
    </div>
</template>

<script>
import { PrismEditor } from "vue-prism-editor";
import { highlight, languages } from "prismjs/components/prism-core";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/themes/prism-tomorrow.css";
import "vue-prism-editor/dist/prismeditor.min.css";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BModal } from "bootstrap-vue-next";

export default {
    name: "CustomFileEditor",
    components: {
        PrismEditor,
        FontAwesomeIcon,
        BModal,
    },
    props: {
        stackName: {
            type: String,
            required: true,
        },
        endpoint: {
            type: String,
            default: "",
        },
        isEditMode: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            fileList: [],
            selectedFile: "",
            customFilePath: "",
            showCustomInput: false,
            currentFile: "",
            fileContent: "",
            showEditor: false,
        };
    },
    watch: {
        isEditMode(newVal) {
            console.log("isEditMode changed:", newVal);
            if (newVal) {
                this.loadFileList();
            } else {
                this.closeFile();
            }
        },
        stackName(newVal) {
            console.log("stackName changed:", newVal);
            if (newVal && this.isEditMode) {
                this.loadFileList();
            }
        },
    },
    mounted() {
        console.log("CustomFileEditor mounted:", {
            stackName: this.stackName,
            endpoint: this.endpoint,
            isEditMode: this.isEditMode
        });
        if (this.isEditMode && this.stackName) {
            this.loadFileList();
        }
    },
    methods: {
        loadFileList() {
            if (!this.stackName) {
                console.warn("Cannot load file list: stackName is empty");
                return;
            }

            console.log("Loading file list for stack:", this.stackName, "endpoint:", this.endpoint);
            this.$root.emitAgent(this.endpoint, "listStackFiles", this.stackName, (res) => {
                console.log("File list response:", res);
                if (res.ok) {
                    this.fileList = res.files || [];
                    console.log("File list loaded:", this.fileList);
                } else {
                    console.error("Failed to load file list:", res);
                    this.$root.toastRes(res);
                }
            });
        },

        loadSelectedFile() {
            if (this.selectedFile) {
                this.customFilePath = this.selectedFile;
            }
        },

        loadFile() {
            if (!this.selectedFile) {
                return;
            }
            this.loadCustomFile();
        },

        loadCustomFile() {
            const filePath = this.customFilePath || this.selectedFile;
            if (!filePath) {
                this.$root.toastError(this.$t("pleaseEnterFilePath"));
                return;
            }

            console.log("Loading file:", filePath, "for stack:", this.stackName);
            this.$root.emitAgent(this.endpoint, "readCustomFile", this.stackName, filePath, (res) => {
                console.log("Read file response:", res);
                if (res.ok) {
                    this.currentFile = res.filePath;
                    this.fileContent = res.content;
                    this.selectedFile = res.filePath;
                    this.showEditor = true;
                    console.log("File loaded successfully:", this.currentFile);
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        saveFile() {
            if (!this.currentFile) {
                return;
            }

            this.$root.emitAgent(this.endpoint, "saveCustomFile", this.stackName, this.currentFile, this.fileContent, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadFileList();
                }
            });
        },

        createNewFile() {
            if (!this.customFilePath) {
                this.$root.toastError(this.$t("pleaseEnterFilePath"));
                return;
            }

            // Create a new file with empty content
            this.currentFile = this.customFilePath;
            this.fileContent = "";
            this.selectedFile = this.customFilePath;
            this.showEditor = true;
            console.log("Created new file:", this.currentFile);
        },

        closeFile() {
            this.showEditor = false;
            this.currentFile = "";
            this.fileContent = "";
            this.selectedFile = "";
            this.customFilePath = "";
        },

        highlighterText(code) {
            // Simple text highlighting
            return highlight(code, languages.javascript || languages.clike);
        },
    },
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

.custom-file-editor {
    .file-editor-modal {
        .editor-container {
            border: 1px solid #dee2e6;
            border-radius: 0.375rem;
            overflow: hidden;
            background-color: $dark-bg2; // 默认深色背景

            // 浅色模式下的样式
            body:not(.dark) & {
                background-color: $light-bg2 !important;
                border-color: $light-border-color !important;
            }
        }

        .file-editor {
            font-family: 'JetBrains Mono', monospace;
            font-size: 14px;
            min-height: 400px;
            max-height: 600px;
            overflow-y: auto;
        }
    }
}

// Global styles for modal
:deep(.modal-xl) {
    max-width: 90vw;
}

:deep(.modal-body) {
    padding: 1rem;
}
</style>
